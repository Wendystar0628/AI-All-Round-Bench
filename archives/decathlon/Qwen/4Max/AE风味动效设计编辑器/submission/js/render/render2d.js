/* 铸帧 ForgeFrame · 2D 图层渲染（WebGL2） */
"use strict";
(function(){
const FF=window.FF, GL=FF.GL, S=FF.Shaders, Path=FF.Path, Eval=FF.Eval, Geo=FF.Geo,
  clamp=FF.util.clamp, DEG=FF.util.DEG;
let gl, progs={}, buf, bankMap=new Map();
const M4=FF.M4;

function bank(name,w,h,opt){
  let t=bankMap.get(name);
  if(!t){ t=GL.target(w,h,opt||{}); bankMap.set(name,t); }
  else t.resize(w,h);
  return t;
}
function init(){
  gl=FF.GL.gl;
  progs.flat=GL.compile(S.vs2d,S.fsFlat,'flat');
  progs.blit=GL.compile(S.vsQuad,S.fsBlit,'blit');
  progs.mask=GL.compile(S.vsQuad,S.fsMask,'mask');
  progs.blur=GL.compile(S.vsQuad,S.fsBlur,'blur');
  progs.bright=GL.compile(S.vsQuad,S.fsBright,'bright');
  progs.glow=GL.compile(S.vsQuad,S.fsGlowAdd,'glow');
  progs.shadow=GL.compile(S.vsQuad,S.fsShadowTint,'shadow');
  progs.hsl=GL.compile(S.vsQuad,S.fsHsl,'hsl');
  progs.overlay=GL.compile(S.vsQuad,S.fsOverlay,'overlay');
  progs.bg=GL.compile(S.vsQuad,S.fsBg,'bg');
  buf=GL.makeBuf2D();
}
function ortho2d(w,h){ return M4.ortho(0,w,h,0,-1,1); }
function useFlat(proj){
  gl.useProgram(progs.flat.p);
  gl.uniformMatrix4fv(progs.flat.uni.uProj,false,proj);
}
function setColor(c,a,grad){
  const u=progs.flat.uni;
  gl.uniform4f(u.uColor,c[0],c[1],c[2],a===undefined?1:a);
  if(grad){
    gl.uniform1i(u.uGrad,grad.type==='linear'?2:1);
    gl.uniform2f(u.uGradCenter,grad.center[0],grad.center[1]);
    gl.uniform1f(u.uGradRadius,grad.radius||200);
    gl.uniform3f(u.uColor2,grad.color2[0],grad.color2[1],grad.color2[2]);
  } else gl.uniform1i(u.uGrad,0);
}
function trisFromRings(rings){
  const groups=Geo.groupRings(rings);
  const all=[];
  for(const g of groups){
    const tri=FF.earcut([g.outer,...g.holes]);
    for(const i of tri.idx) all.push(tri.verts[i*2],tri.verts[i*2+1]);
  }
  return all;
}
function layerAffine(ctx,layer,t){
  const wm=Eval.worldMatrix(ctx,layer,t).m;
  return [wm[0],wm[1],wm[4],wm[5],wm[12],wm[13]];
}
function xfVerts(v,m){
  const out=new Array(v.length);
  for(let i=0;i<v.length;i+=2){
    out[i]=m[0]*v[i]+m[2]*v[i+1]+m[4];
    out[i+1]=m[1]*v[i]+m[3]*v[i+1]+m[5];
  }
  return out;
}
function drawShapeLayer(comp,layer,t,ctx,proj){
  const sg=Geo.shapeLayerGeo(ctx,layer,t);
  const m=layerAffine(ctx,layer,t);
  const scl=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))||1;
  useFlat(proj);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  for(const piece of sg.pieces){
    if(piece.fill&&piece.fill.opacity>0.003){
      if(piece.ribbon){
        const verts=FF.glyphs.strokeRibbon(piece.ribbon.stroke,piece.ribbon.frac,1.6);
        if(verts.length){
          buf.set(xfVerts(verts,m));
          setColor(piece.ribbon.color,piece.fill.opacity*piece.ribbon.opacity);
          buf.draw();
        }
      } else if(piece.rings.length){
        const tris=trisFromRings(piece.rings);
        if(tris.length){
          buf.set(xfVerts(tris,m));
          let grad=piece.fill.gradient;
          if(grad){
            const c=[m[0]*grad.center[0]+m[2]*grad.center[1]+m[4], m[1]*grad.center[0]+m[3]*grad.center[1]+m[5]];
            grad={...grad,center:c,radius:grad.radius*scl};
          }
          setColor(piece.fill.color,piece.fill.opacity,grad);
          buf.draw();
        }
      }
    }
    if(piece.stroke&&piece.stroke.opacity>0.003&&piece.stroke.width>0.05){
      const quads=[];
      for(const r of piece.rings) quads.push(...Path.strokeQuads(r,piece.stroke.width,true));
      for(const o of piece.opens) quads.push(...Path.strokeQuads(o,piece.stroke.width,false));
      if(quads.length){
        buf.set(xfVerts(quads,m));
        setColor(piece.stroke.color,piece.stroke.opacity);
        buf.draw();
      }
    }
  }
  gl.disable(gl.BLEND);
}
function drawTextLayer(comp,layer,t,ctx,proj){
  const tg=Geo.textGeo(ctx,layer,t);
  const m=layerAffine(ctx,layer,t);
  useFlat(proj);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  for(const c of tg.chars){
    if(c.opacity<=0.004) continue;
    if(c.missing){
      const size=FF.glyphs.advance(c.ch)>70?60:40;
      const quads=Path.strokeQuads(Path.flatten(Path.rect(c.cx-size/2,c.cy-size/2,size,size,2).c[0],1),3,true);
      buf.set(xfVerts(quads,m)); setColor(tg.fill,c.opacity*0.6); buf.draw();
      continue;
    }
    for(const st of c.strokes){
      const verts=FF.glyphs.strokeRibbon(st,1,1.6);
      if(!verts.length) continue;
      buf.set(xfVerts(verts,m));
      setColor(tg.fill,c.opacity);
      buf.draw();
    }
  }
  gl.disable(gl.BLEND);
}
/* ---------- 蒙版 ---------- */
function renderMasks(comp,layer,t,ctx,w,h){
  if(!layer.masks||!layer.masks.length) return null;
  const mt=bank('mask',w,h), mb=bank('maskBlur',w,h);
  GL.clearTarget(mt,0,0,0,0);
  GL.bindTarget(mt);
  const proj=ortho2d(w,h);
  useFlat(proj);
  const wm=Eval.worldMatrix(ctx,layer,t).m;
  // 蒙版在图层局部空间：应用图层世界变换的逆？AE 蒙版随图层变换。此处蒙版坐标为图层本地坐标。
  for(let mi=0;mi<layer.masks.length;mi++){
    const m=layer.masks[mi];
    const idx=mi;
    const pos=Eval.prop(ctx,layer,'masks.'+idx+'.position',t)||[0,0];
    const opa=(Eval.prop(ctx,layer,'masks.'+idx+'.opacity',t)||100)/100;
    let path;
    if(m.kind==='rect'){
      const size=Eval.prop(ctx,layer,'masks.'+idx+'.size',t)||[300,220];
      path=Path.rect(pos[0]-size[0]/2,pos[1]-size[1]/2,size[0],size[1],0);
    } else if(m.kind==='ellipse'){
      const size=Eval.prop(ctx,layer,'masks.'+idx+'.size',t)||[300,220];
      path=Path.ellipse(pos[0],pos[1],size[0]/2,size[1]/2);
    } else {
      path=Eval.prop(ctx,layer,'masks.'+idx+'.path',t)||Path.empty();
      if(pos[0]||pos[1]) path=Path.transform(path,[1,0,0,1,pos[0],pos[1]]);
    }
    // 图层本地 → 合成空间
    path=Path.transform(path,[wm[0],wm[1],wm[4],wm[5],wm[12],wm[13]]);
    const rings=[];
    for(const c of path.c){ const f=Path.flatten(c,0.8); if(f.length>=6&&c.closed) rings.push(f); }
    if(!rings.length) continue;
    const tris=trisFromRings(rings);
    if(!tris.length) continue;
    buf.set(tris);
    let color=[1,1,1], alpha=opa;
    if(m.invert){
      // 反转：先铺满，再擦除蒙版形状
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      buf.set([0,0,w,0,0,h, w,0,w,h,0,h]);
      setColor(color,alpha);
      buf.draw();
      gl.blendFunc(gl.ZERO,gl.ONE_MINUS_SRC_ALPHA);
      buf.set(tris);
      setColor(color,alpha);
      buf.draw();
      gl.disable(gl.BLEND);
      continue;
    }
    if(m.mode==='subtract'){
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO,gl.ONE_MINUS_SRC_ALPHA);
      setColor(color,alpha);
      buf.draw();
      gl.disable(gl.BLEND);
    } else if(m.mode==='intersect'){
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.DST_ALPHA,gl.ZERO);
      setColor(color,alpha);
      buf.draw();
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      setColor(color,alpha);
      buf.draw();
      gl.disable(gl.BLEND);
    }
  }
  // 羽化
  let src=mt;
  const feather=Math.max(...layer.masks.map((m,i)=>Eval.prop(ctx,layer,'masks.'+i+'.feather',t)||0));
  if(feather>0.5){
    const passes=clamp(Math.ceil(feather/10),1,5);
    for(let p=0;p<passes;p++){
      const r=feather/passes*(p+1)*0.6;
      GL.bindTarget(mb);
      gl.useProgram(progs.blur.p);
      GL.tex(0,src.tex); gl.uniform1i(progs.blur.uni.uTex,0);
      gl.uniform2f(progs.blur.uni.uDir,r/w,0);
      gl.disable(gl.BLEND);
      GL.drawQuad();
      GL.bindTarget(mt);
      GL.tex(0,mb.tex); gl.uniform1i(progs.blur.uni.uTex,0);
      gl.uniform2f(progs.blur.uni.uDir,0,r/h);
      GL.drawQuad();
      src=mt;
    }
  }
  return src;
}
function applyMask(src,dst,mask,mode){
  GL.bindTarget(dst);
  gl.useProgram(progs.mask.p);
  GL.tex(0,src.tex); gl.uniform1i(progs.mask.uni.uTex,0);
  GL.tex(1,mask.tex); gl.uniform1i(progs.mask.uni.uMask,1);
  gl.uniform1i(progs.mask.uni.uMode,mode||0);
  gl.disable(gl.BLEND);
  GL.drawQuad();
  return dst;
}
/* ---------- 效果 ---------- */
function blurPass(src,dst,tmp,r,w,h){
  if(r<0.3){ blit(src,dst,1); return dst; }
  const passes=clamp(Math.ceil(r/9),1,4);
  let s=src;
  for(let p=0;p<passes;p++){
    const rr=r/passes*(p+1)*0.75;
    GL.bindTarget(tmp);
    gl.useProgram(progs.blur.p);
    GL.tex(0,s.tex); gl.uniform1i(progs.blur.uni.uTex,0);
    gl.uniform2f(progs.blur.uni.uDir,rr/w,0);
    gl.disable(gl.BLEND);
    GL.drawQuad();
    GL.bindTarget(dst);
    GL.tex(0,tmp.tex); gl.uniform1i(progs.blur.uni.uTex,0);
    gl.uniform2f(progs.blur.uni.uDir,0,rr/h);
    GL.drawQuad();
    s=dst;
  }
  return dst;
}
function blit(src,dst,opacity,offset){
  GL.bindTarget(dst);
  gl.useProgram(progs.blit.p);
  GL.tex(0,src.tex); gl.uniform1i(progs.blit.uni.uTex,0);
  gl.uniform1f(progs.blit.uni.uOpacity,opacity===undefined?1:opacity);
  gl.uniform2f(progs.blit.uni.uOffset,offset?offset[0]:0,offset?offset[1]:0);
  gl.disable(gl.BLEND);
  GL.drawQuad();
  return dst;
}
function applyEffects(src,layer,t,ctx,w,h,effectList){
  const effects=effectList||layer.effects||[];
  let cur=src;
  const f1=bank('fx1',w,h), f2=bank('fx2',w,h), f3=bank('fx3',w,h);
  const freeBufs=()=>[f1,f2,f3].filter(x=>x!==cur);
  for(let ei=0;ei<effects.length;ei++){
    const e=effects[ei];
    if(!e.enabled) continue;
    const path='effects.'+(layer.effects?layer.effects.indexOf(e):ei)+'.';
    const ev=(k,d)=>{ const p=FF.getProp(layer,path+k); return p?Eval.prop(ctx,layer,path+k,t):d; };
    if(e.type==='blur'){
      const r=ev('radius',8);
      const [d,tp]=freeBufs();
      cur=blurPass(cur,d,tp,r,w,h);
    } else if(e.type==='glow'){
      const th=ev('threshold',0.5), r=ev('radius',16), inten=ev('intensity',1), tint=ev('color',[1,0.7,0.3]);
      const bright=bank('bright',w,h);
      GL.bindTarget(bright);
      gl.useProgram(progs.bright.p);
      GL.tex(0,cur.tex); gl.uniform1i(progs.bright.uni.uTex,0);
      gl.uniform1f(progs.bright.uni.uThreshold,th);
      gl.disable(gl.BLEND); GL.drawQuad();
      const [d,tp]=freeBufs();
      const g=blurPass(bright,d,tp,r,w,h);
      const out=freeBufs().find(x=>x!==g);
      GL.bindTarget(out);
      gl.useProgram(progs.glow.p);
      GL.tex(0,cur.tex); gl.uniform1i(progs.glow.uni.uBase,0);
      GL.tex(1,g.tex); gl.uniform1i(progs.glow.uni.uGlow,1);
      gl.uniform1f(progs.glow.uni.uIntensity,inten);
      gl.uniform3f(progs.glow.uni.uTint,tint[0],tint[1],tint[2]);
      gl.disable(gl.BLEND); GL.drawQuad();
      cur=out;
    } else if(e.type==='shadow'){
      const col=ev('color',[0,0,0]), opa=(ev('opacity',50))/100;
      const dist=ev('distance',12), ang=(ev('angle',135))*DEG, soft=ev('softness',10);
      const tint=bank('shTint',w,h);
      GL.bindTarget(tint);
      gl.useProgram(progs.shadow.p);
      GL.tex(0,cur.tex); gl.uniform1i(progs.shadow.uni.uTex,0);
      gl.uniform3f(progs.shadow.uni.uColor,col[0],col[1],col[2]);
      gl.uniform1f(progs.shadow.uni.uOpacity,opa);
      gl.disable(gl.BLEND); GL.drawQuad();
      const [d,tp]=freeBufs();
      const sh=blurPass(tint,d,tp,soft,w,h);
      const out=freeBufs().find(x=>x!==sh);
      GL.bindTarget(out);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(progs.blit.p);
      GL.tex(0,sh.tex); gl.uniform1i(progs.blit.uni.uTex,0);
      gl.uniform1f(progs.blit.uni.uOpacity,1);
      gl.uniform2f(progs.blit.uni.uOffset,Math.cos(ang)*dist/w,-Math.sin(ang)*dist/h);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      GL.drawQuad();
      GL.tex(0,cur.tex); gl.uniform1i(progs.blit.uni.uTex,0);
      gl.uniform2f(progs.blit.uni.uOffset,0,0);
      GL.drawQuad();
      gl.disable(gl.BLEND);
      cur=out;
    } else if(e.type==='hsl'){
      const out=freeBufs()[0];
      GL.bindTarget(out);
      gl.useProgram(progs.hsl.p);
      GL.tex(0,cur.tex); gl.uniform1i(progs.hsl.uni.uTex,0);
      gl.uniform1f(progs.hsl.uni.uHue,ev('hue',0));
      gl.uniform1f(progs.hsl.uni.uSat,ev('saturation',0));
      gl.uniform1f(progs.hsl.uni.uLight,ev('lightness',0));
      gl.disable(gl.BLEND); GL.drawQuad();
      cur=out;
    }
  }
  return cur;
}
/* ---------- 图层渲染入口 ---------- */
function renderLayer(comp,layer,t,ctx){
  const w=comp.w,h=comp.h;
  let out=bank('layer',w,h);
  GL.clearTarget(out,0,0,0,0);
  GL.bindTarget(out);
  const proj=ortho2d(w,h);
  if(layer.type==='shape') drawShapeLayer(comp,layer,t,ctx,proj);
  else if(layer.type==='text') drawTextLayer(comp,layer,t,ctx,proj);
  // 蒙版
  const mask=renderMasks(comp,layer,t,ctx,w,h);
  if(mask){
    const dst=bank('fx1',w,h);
    applyMask(out,dst,mask,0);
    out=dst;
  }
  // 效果
  if(layer.effects&&layer.effects.some(e=>e.enabled)){
    out=applyEffects(out,layer,t,ctx,w,h);
  }
  return out;
}
FF.R2D={init,bank,blit,blurPass,applyMask,applyEffects,renderLayer,renderMasks,ortho2d,
  get progs(){return progs;}, trisFromRings,
  resetBank:()=>{bankMap.clear();}};
})();
