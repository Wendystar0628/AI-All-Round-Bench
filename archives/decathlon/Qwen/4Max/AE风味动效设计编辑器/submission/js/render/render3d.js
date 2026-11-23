/* 铸帧 ForgeFrame · 3D 场景渲染：材质 / 灯光 / 阴影 / 粒子 / 景深 */
"use strict";
(function(){
const FF=window.FF, GL=FF.GL, S=FF.Shaders, M4=FF.M4, V=FF.V, Eval=FF.Eval, Geo=FF.Geo,
  clamp=FF.util.clamp, DEG=FF.util.DEG;
let gl, progs={}, meshBufs=new Map(), partVAO=null, partBuf=null, cornerBuf=null,
  trailVAO=null, trailBuf=null, shadowTarget=null;
const NEAR=8, FAR=9000;
let lastCam=null;

function init(){
  gl=FF.GL.gl;
  progs.mesh=GL.compile(S.vsMesh,S.fsMesh,'mesh');
  progs.depth=GL.compile(S.vsDepth,S.fsDepth,'depth');
  progs.part=GL.compile(S.vsParticle,S.fsParticle,'particle');
  progs.trail=GL.compile(S.vsTrail,S.fsTrail,'trail');
  progs.dof=GL.compile(S.vsQuad,S.fsDof,'dof');
  shadowTarget=GL.target(2048,2048,{depth:true});
  // 粒子实例化 VAO
  partVAO=gl.createVertexArray();
  gl.bindVertexArray(partVAO);
  cornerBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);
  partBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,partBuf);
  const stride=32;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,3,gl.FLOAT,false,stride,0); gl.vertexAttribDivisor(1,1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,1,gl.FLOAT,false,stride,12); gl.vertexAttribDivisor(2,1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3,3,gl.FLOAT,false,stride,16); gl.vertexAttribDivisor(3,1);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4,1,gl.FLOAT,false,stride,28); gl.vertexAttribDivisor(4,1);
  gl.bindVertexArray(null);
  trailVAO=gl.createVertexArray();
  gl.bindVertexArray(trailVAO);
  trailBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,trailBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,28,12);
  gl.bindVertexArray(null);
}
function getMeshBuf(id){
  let b=meshBufs.get(id);
  if(!b){ b=GL.makeMeshBuf(); meshBufs.set(id,b); }
  return b;
}
function collectCamera(comp,t,ctx){
  let camLayer=null;
  for(const l of comp.layers){
    if(l.type==='camera'&&l.visible&&Eval.layerActive(comp,l,t)){ camLayer=l; break; }
  }
  let pos=[0,0,1000], target=[0,0,0], fov=40, focus=1000, aperture=0;
  if(camLayer){
    const wm=Eval.worldMatrix(ctx,camLayer,t).m;
    pos=M4.transformPoint(wm,[0,0,0]);
    target=Eval.prop(ctx,camLayer,'camera.target',t)||[0,0,0];
    fov=Eval.prop(ctx,camLayer,'camera.fov',t)||40;
    focus=Eval.prop(ctx,camLayer,'camera.focusDistance',t)||1000;
    aperture=(Eval.prop(ctx,camLayer,'camera.aperture',t)||0)/100;
  }
  const view=M4.lookAt(pos,target,[0,1,0]);
  const proj=M4.perspective(fov*DEG,comp.w/comp.h,NEAR,FAR);
  proj[5]=-proj[5]; // y 向下世界 → 屏幕 y 向下
  const vp=M4.mul(proj,view);
  return {layer:camLayer,pos,target,fov,focus,aperture,view,proj,vp,near:NEAR,far:FAR};
}
function collectLights(comp,t,ctx){
  const lights=[];
  for(const l of comp.layers){
    if(l.type!=='light'||!l.visible||!Eval.layerActive(comp,l,t)) continue;
    const wm=Eval.worldMatrix(ctx,l,t).m;
    const pos=M4.transformPoint(wm,[0,0,0]);
    const target=Eval.prop(ctx,l,'light.target',t)||[0,0,0];
    const color=Eval.prop(ctx,l,'light.color',t)||[1,1,1];
    const inten=(Eval.prop(ctx,l,'light.intensity',t)||0)/100;
    lights.push({layer:l,type:l.light.lightType==='parallel'?1:0,pos,target,color,intensity:inten,
      castsShadow:l.light.castsShadow});
    if(lights.length>=4) break;
  }
  return lights;
}
function lightShadowVP(light,sceneBounds){
  const c=sceneBounds?sceneBounds.center:[0,0,0];
  const r=sceneBounds?Math.max(sceneBounds.size[0],sceneBounds.size[1],sceneBounds.size[2])*0.75+200:900;
  if(light.type===1){
    const dir=V.norm(V.sub(light.target,light.pos));
    const eye=V.sub(c,V.mul(dir,r*2.2));
    const view=M4.lookAt(eye,c,[0,1,0]);
    const proj=M4.ortho(-r,r,-r,r,1,r*5);
    return {vp:M4.mul(proj,view),eye};
  } else {
    const view=M4.lookAt(light.pos,c,[0,1,0]);
    const proj=M4.perspective(80*DEG,1,10,r*5);
    return {vp:M4.mul(proj,view),eye:light.pos};
  }
}
function renderScene(comp,group,t,ctx,opts){
  opts=opts||{};
  const w=comp.w,h=comp.h;
  const cam=collectCamera(comp,t,ctx);
  lastCam=cam;
  ctx.__camPos=cam.pos;
  const lights=collectLights(comp,t,ctx);
  const scene=FF.R2D.bank('scene',w,h,{depth:true});
  // 收集网格
  const draws=[];
  let bounds=null;
  for(const l of group){
    if(l.type==='geo'&&l.visible&&Eval.layerActive(comp,l,t)){
      const mesh=Geo.geoLayerMesh(ctx,l,t);
      if(!mesh||!mesh.idx.length) continue;
      const wm=Eval.worldMatrix(ctx,l,t).m;
      const mat=l.geo.material;
      const evp=(k)=>Eval.prop(ctx,l,'geo.material.'+k,t);
      const entry={
        layer:l, mesh, model:wm,
        normalMat:M4.invert(wm),
        baseColor:evp('baseColor')||[0.8,0.8,0.8],
        metallic:clamp((evp('metallic')||0)/100,0,1),
        roughness:clamp((evp('roughness')||50)/100,0.03,1),
        emissive:V.mul(evp('emissive')||[0,0,0],(evp('emissiveStrength')||0)/100*3),
        opacity:clamp((evp('opacity')===undefined?100:evp('opacity'))/100*(Eval.prop(ctx,l,'transform.opacity',t)/100),0,1),
        castShadow:l.geo.castShadow, receiveShadow:l.geo.receiveShadow,
      };
      draws.push(entry);
      const mb=Geo.meshBounds(mesh);
      const wc=M4.transformPoint(wm,mb.center);
      const wr=Math.max(mb.size[0],mb.size[1],mb.size[2])*Math.max(Math.abs(wm[0]),Math.abs(wm[5]),1)*0.6+80;
      if(!bounds) bounds={center:wc,size:[wr*2,wr*2,wr*2]};
      else {
        bounds.center=V.mul(V.add(bounds.center,wc),0.5);
        bounds.size=[Math.max(bounds.size[0],wr*2+V.dist(bounds.center,wc)),Math.max(bounds.size[1],wr*2),Math.max(bounds.size[2],wr*2)];
      }
    }
  }
  // 粒子数据
  const partSystems=[];
  for(const l of group){
    if(l.type==='particles'&&l.visible&&Eval.layerActive(comp,l,t)){
      const data=FF.Particles.renderData(ctx,l,t);
      if(data.count||data.trails) partSystems.push({layer:l,data,additive:l.particles.additive});
    }
  }
  GL.clearTarget(scene,0,0,0,0);
  // ---- 阴影 pass ----
  const shadowLight=lights.find(l=>l.castsShadow);
  let shadowVP=null;
  if(shadowLight&&draws.length){
    shadowVP=lightShadowVP(shadowLight,bounds);
    GL.bindTarget(shadowTarget);
    gl.viewport(0,0,shadowTarget.w,shadowTarget.h);
    gl.clearColor(1,1,1,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(progs.depth.p);
    gl.uniformMatrix4fv(progs.depth.uni.uLightVP,false,shadowVP.vp);
    for(const d of draws){
      if(!d.castShadow) continue;
      const mb=getMeshBuf(d.layer.id);
      mb.set(d.mesh);
      gl.uniformMatrix4fv(progs.depth.uni.uModel,false,d.model);
      mb.draw();
    }
  }
  // ---- 主 pass ----
  GL.bindTarget(scene);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(progs.mesh.p);
  const u=progs.mesh.uni;
  gl.uniformMatrix4fv(u.uVP,false,cam.vp);
  gl.uniform3f(u.uCamPos,cam.pos[0],cam.pos[1],cam.pos[2]);
  gl.uniform1i(u.uNumLights,lights.length);
  for(let i=0;i<lights.length;i++){
    const L=lights[i];
    const dir=V.norm(V.sub(L.target,L.pos));
    gl.uniform3f(gl.getUniformLocation(progs.mesh.p,'uLightPos['+i+']'),L.pos[0],L.pos[1],L.pos[2]);
    gl.uniform3f(gl.getUniformLocation(progs.mesh.p,'uLightDir['+i+']'),dir[0],dir[1],dir[2]);
    gl.uniform3f(gl.getUniformLocation(progs.mesh.p,'uLightColor['+i+']'),L.color[0]*L.intensity,L.color[1]*L.intensity,L.color[2]*L.intensity);
    gl.uniform1f(gl.getUniformLocation(progs.mesh.p,'uLightIntensity['+i+']'),1);
    gl.uniform1i(gl.getUniformLocation(progs.mesh.p,'uLightType['+i+']'),L.type);
  }
  if(shadowVP){
    gl.uniform1i(u.uHasShadow,1);
    gl.uniformMatrix4fv(u.uLightVP,false,shadowVP.vp);
    GL.tex(7,shadowTarget.depth);
    gl.uniform1i(u.uShadowMap,7);
    gl.uniform1f(u.uShadowTexel,1/2048);
  } else gl.uniform1i(u.uHasShadow,0);
  const opaque=draws.filter(d=>d.opacity>=0.999);
  const trans=draws.filter(d=>d.opacity<0.999).sort((a,b)=>{
    const da=V.dist(M4.transformPoint(a.model,[0,0,0]),cam.pos);
    const db=V.dist(M4.transformPoint(b.model,[0,0,0]),cam.pos);
    return db-da;
  });
  const drawMesh=(d)=>{
    const mb=getMeshBuf(d.layer.id);
    mb.set(d.mesh);
    gl.uniformMatrix4fv(u.uModel,false,d.model);
    gl.uniformMatrix4fv(u.uNormalMat,false,d.normalMat);
    gl.uniform3f(u.uBaseColor,d.baseColor[0],d.baseColor[1],d.baseColor[2]);
    gl.uniform1f(u.uMetallic,d.metallic);
    gl.uniform1f(u.uRoughness,d.roughness);
    gl.uniform3f(u.uEmissive,d.emissive[0],d.emissive[1],d.emissive[2]);
    gl.uniform1f(u.uOpacity,d.opacity);
    mb.draw();
  };
  for(const d of opaque) drawMesh(d);
  if(trans.length){
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for(const d of trans) drawMesh(d);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  // ---- 拖尾与粒子 ----
  const right=[cam.view[0],cam.view[4],cam.view[8]];
  const up=[cam.view[1],cam.view[5],cam.view[9]];
  // 注意：proj y 翻转，up 取反以对齐公告板
  const upF=[-up[0],-up[1],-up[2]];
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  for(const ps of partSystems){
    if(ps.data.trails&&ps.data.trails.length){
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
      gl.useProgram(progs.trail.p);
      gl.uniformMatrix4fv(progs.trail.uni.uVP,false,cam.vp);
      gl.bindVertexArray(trailVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER,trailBuf);
      gl.bufferData(gl.ARRAY_BUFFER,ps.data.trails,gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES,0,ps.data.trails.length/7);
      gl.bindVertexArray(null);
    }
  }
  for(const ps of partSystems){
    if(!ps.data.count) continue;
    gl.blendFunc(gl.SRC_ALPHA,ps.additive?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progs.part.p);
    gl.uniformMatrix4fv(progs.part.uni.uVP,false,cam.vp);
    gl.uniform3f(progs.part.uni.uRight,right[0],right[1],right[2]);
    gl.uniform3f(progs.part.uni.uUp,upF[0],upF[1],upF[2]);
    gl.uniform1f(progs.part.uni.uNear,NEAR);
    gl.uniform1f(progs.part.uni.uFar,FAR);
    gl.uniform2f(progs.part.uni.uResolution,w,h);
    gl.uniform1i(progs.part.uni.uSoft,ps.additive?0:1);
    GL.tex(6,scene.depth);
    gl.uniform1i(progs.part.uni.uSceneDepth,6);
    gl.bindVertexArray(partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,partBuf);
    gl.bufferData(gl.ARRAY_BUFFER,ps.data.inst,gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,ps.data.count);
    gl.bindVertexArray(null);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  // ---- 泛光 ----
  let result=scene;
  const bright=FF.R2D.bank('scBright',w,h);
  GL.bindTarget(bright);
  gl.useProgram(FF.R2D.progs.bright.p);
  GL.tex(0,scene.tex); gl.uniform1i(FF.R2D.progs.bright.uni.uTex,0);
  gl.uniform1f(FF.R2D.progs.bright.uni.uThreshold,0.72);
  gl.disable(gl.BLEND); GL.drawQuad();
  const b1=FF.R2D.bank('scB1',w,h), b2=FF.R2D.bank('scB2',w,h);
  FF.R2D.blurPass(bright,b1,b2,14,w,h);
  const bloomed=FF.R2D.bank('scBloom',w,h);
  GL.bindTarget(bloomed);
  gl.useProgram(FF.R2D.progs.glow.p);
  GL.tex(0,scene.tex); gl.uniform1i(FF.R2D.progs.glow.uni.uBase,0);
  GL.tex(1,b1.tex); gl.uniform1i(FF.R2D.progs.glow.uni.uGlow,1);
  gl.uniform1f(FF.R2D.progs.glow.uni.uIntensity,0.55);
  gl.uniform3f(FF.R2D.progs.glow.uni.uTint,1,0.9,0.8);
  GL.drawQuad();
  result=bloomed;
  // ---- 景深 ----
  if(cam.aperture>0.003){
    const db=FF.R2D.bank('dofBlur',w,h), dt2=FF.R2D.bank('dofTmp',w,h);
    FF.R2D.blurPass(result,db,dt2,7,w,h);
    const out=FF.R2D.bank('dofOut',w,h);
    GL.bindTarget(out);
    gl.useProgram(progs.dof.p);
    GL.tex(0,result.tex); gl.uniform1i(progs.dof.uni.uScene,0);
    GL.tex(1,db.tex); gl.uniform1i(progs.dof.uni.uBlur,1);
    GL.tex(2,scene.depth); gl.uniform1i(progs.dof.uni.uDepth,2);
    gl.uniform1f(progs.dof.uni.uFocus,cam.focus);
    gl.uniform1f(progs.dof.uni.uAperture,cam.aperture);
    gl.uniform1f(progs.dof.uni.uNear,NEAR);
    gl.uniform1f(progs.dof.uni.uFar,FAR);
    GL.drawQuad();
    result=out;
  }
  return {tex:result.tex, target:result, depth:scene.depth, cam};
}
/* 拾取：屏幕坐标 → 最近可选表面 */
function pick(comp,t,ctx,sx,sy,vw,vh){
  const cam=lastCam||collectCamera(comp,t,ctx);
  const ndcX=sx/vw*2-1, ndcY=1-sy/vh*2;
  const inv=M4.invert(cam.vp);
  const p0=M4.transformPoint(inv,[ndcX,ndcY,-1]);
  const p1=M4.transformPoint(inv,[ndcX,ndcY,1]);
  const dir=V.norm(V.sub(p1,p0));
  let best=null;
  for(const l of comp.layers){
    if(!l.visible||l.locked||!Eval.layerActive(comp,l,t)) continue;
    if(l.type==='geo'){
      const mesh=Geo.geoLayerMesh(ctx,l,t);
      const wm=Eval.worldMatrix(ctx,l,t).m;
      const world=Geo.transformMesh(mesh,wm);
      const grid=Geo.buildGrid(world,80);
      const far=V.add(p0,V.mul(dir,6000));
      const hit=Geo.collideSegment(grid,p0,far,1);
      if(hit&&(!best||hit.t*6000<best.dist)){
        best={layer:l,point:hit.point,dist:hit.t*6000,normal:hit.normal};
      }
    } else if(l.type==='shape'||l.type==='text'){
      // 与 z=0 平面求交
      if(Math.abs(dir[2])<1e-6) continue;
      const tt=-p0[2]/dir[2];
      if(tt<0) continue;
      const pt=V.add(p0,V.mul(dir,tt));
      const iw=M4.invert(Eval.worldMatrix(ctx,l,t).m);
      const lp=M4.transformPoint(iw,pt);
      let inside=false;
      if(l.type==='shape'){
        const sg=Geo.shapeLayerGeo(ctx,l,t);
        for(const r of sg.rings) if(FF.Path.pointIn(r,lp[0],lp[1])){ inside=true; break; }
        if(!inside) for(const o of sg.opens){
          for(let i=2;i<o.length;i+=2){
            if(Math.hypot(o[i]-lp[0],o[i+1]-lp[1])<12){ inside=true; break; }
          }
        }
      } else {
        const tg=Geo.textGeo(ctx,l,t);
        for(const c of tg.chars){
          if(Math.abs(lp[0]-c.cx)<45&&Math.abs(lp[1]-c.cy)<55){ inside=true; break; }
        }
      }
      if(inside&&(!best||tt<best.dist)) best={layer:l,point:pt,dist:tt};
    } else if(l.type==='null'||l.type==='field'||l.type==='light'||l.type==='camera'){
      const wm=Eval.worldMatrix(ctx,l,t).m;
      const c=M4.transformPoint(wm,[0,0,0]);
      const toC=V.sub(c,p0);
      const proj=V.dot(toC,dir);
      if(proj<0) continue;
      const closest=V.add(p0,V.mul(dir,proj));
      if(V.dist(closest,c)<26&&(!best||proj<best.dist)) best={layer:l,point:c,dist:proj};
    }
  }
  return best;
}
FF.R3D={init,renderScene,collectCamera,pick,get lastCam(){return lastCam;},
  resetCache:()=>{meshBufs.clear();}};
})();
