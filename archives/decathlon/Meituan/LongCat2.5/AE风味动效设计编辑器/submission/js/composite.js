/* composite.js — 合成渲染管线：图层、蒙版、效果、预合成、三维、运动模糊 */
(function(){
'use strict';
const C = { fboPool:[], geomCache:new Map() };
window.Composite = C;

C.EFFECT_DEFS = {
  gaussianBlur:{label:'高斯模糊', params:[{p:'radius',l:'模糊度',t:'num',min:0,max:200,def:10}]},
  glow:{label:'发光', params:[{p:'radius',l:'半径',t:'num',min:0,max:200,def:20},{p:'intensity',l:'强度',t:'num',min:0,max:5,def:1},{p:'color',l:'颜色',t:'color',def:[1,0.85,0.4]}]},
  dropShadow:{label:'投影', params:[{p:'radius',l:'模糊',t:'num',min:0,max:200,def:10},{p:'opacity',l:'不透明度',t:'num',min:0,max:100,def:70},{p:'color',l:'颜色',t:'color',def:[0,0,0]},{p:'offsetX',l:'X 偏移',t:'num',def:8},{p:'offsetY',l:'Y 偏移',t:'num',def:8}]},
  hueSat:{label:'色相/饱和度/亮度', params:[{p:'hue',l:'色相',t:'num',min:-0.5,max:0.5,def:0},{p:'saturation',l:'饱和度',t:'num',min:0,max:3,def:1},{p:'brightness',l:'亮度',t:'num',min:-0.5,max:0.5,def:0}]},
  vignette:{label:'暗角', params:[{p:'amount',l:'数量',t:'num',min:0,max:1,def:0.4}]},
  chromatic:{label:'色差', params:[{p:'amount',l:'数量',t:'num',min:0,max:0.02,def:0.004}]},
};

C.init=function(){
  C.mainFBO=null;
};

/* ==================== FBO 池 ==================== */
C.fbo=function(w,h,opts){
  const key=w+'x'+h+(opts&&opts.depth?'d':'');
  for(let i=0;i<C.fboPool.length;i++){
    const f=C.fboPool[i];
    if(!f.used && f.w===w && f.h===h && (!!f.depthTex)===(!!(opts&&opts.depth))) return f;
  }
  const f=Render.createFBO(w,h,opts||{});
  f.used=false;
  C.fboPool.push(f);
  return f;
};
C.markUsed=function(f){ if(f) f.used=true; };
C.release=function(f){ if(f) f.used=false; };

/* ==================== 效果参数（可关键帧） ==================== */
C.effectParam=function(layer,idx,param,t){
  const path='fx.'+idx+'.'+param;
  const kf=layer.kf[path];
  if(kf&&kf.keys&&kf.keys.length) return U.evalKeys(kf.keys,t);
  if(layer.expr&&layer.expr[path]){
    const r=Expression.evalExpression(layer.expr[path],{time:t,value:0,layer,comp:Model.layerComp(layer),propPath:path,keys:null,seed:1});
    if(!r.error) return r.value;
  }
  const fx=layer.effects[idx];
  if(fx&&fx.params&&param in fx.params) return fx.params[param];
  const def=C.EFFECT_DEFS[fx?fx.type:''];
  if(def){ const d=def.params.find(p=>p.p===param); if(d&&d.def!==undefined) return d.def; }
  return 0;
};
C.effectObj=function(layer,idx,t){
  const fx=layer.effects[idx];
  if(!fx) return null;
  const def=C.EFFECT_DEFS[fx.type];
  if(!def) return null;
  const o={type:fx.type,params:{}};
  for(const p of def.params) o.params[p.p]=C.effectParam(layer,idx,p.p,t);
  o.enabled=fx.enabled!==false;
  return o;
};

/* ==================== 主入口 ==================== */
C.render=function(comp,t,target,opts={}){
  const mb=comp.motionBlur||{enabled:false};
  let samples=opts.samples;
  if(!samples && mb.enabled && C.anyMotionBlur(comp,t)){
    const N=mb.samples||4;
    const shutter=(mb.shutterAngle||180)/360/comp.fps;
    const phase=(mb.phase||0)/360/comp.fps;
    samples=[];
    for(let i=0;i<N;i++){
      const k=N===1?0.5:i/(N-1);
      samples.push(U.clamp(t+(k-0.5)*shutter+phase,0,comp.duration));
    }
  }
  if(samples&&samples.length>1){
    const acc=Render.createFBO(Render.view.cw,Render.view.ch);
    Render.fillFBO(acc,[0,0,0],0);
    for(let i=0;i<samples.length;i++){
      const f=C.fbo(Render.view.cw,Render.view.ch);
      C.renderComp(comp,samples[i],f,opts);
      Render.blend(acc,acc,f,1,1/samples.length);
      C.release(f);
    }
    Render.blend(target,target,acc,0,1);
    Render.releaseFBO(acc);
    return;
  }
  C.renderComp(comp,t,target,opts);
};
C.anyMotionBlur=function(comp,t){
  for(const l of comp.layers){ if(l.motionBlur!==false && l.visible!==false) return true; }
  return false;
};

/* ==================== 合成渲染 ==================== */
C.renderComp=function(comp,t,target,opts={}){
  const gl=Render.gl;
  const cw=Render.view.cw, ch=Render.view.ch;
  Render.clearFBO(target,[comp.bgColor[0],comp.bgColor[1],comp.bgColor[2]],1);
  // 相机
  const cam=C.getActiveCamera(comp,t);
  const scene=C.buildScene(comp,t,cam);
  let pending3D=[];
  const layers=comp.layers;
  for(let i=layers.length-1;i>=0;i--){
    const layer=layers[i];
    if(!C.layerActive(layer,t)) continue;
    const is3D=C.is3DLayer(layer);
    if(is3D){ pending3D.push(layer); continue; }
    if(pending3D.length){ C.render3D(pending3D,comp,t,target,scene,opts); pending3D=[]; }
    C.render2DLayer(layer,comp,t,target,opts);
  }
  if(pending3D.length) C.render3D(pending3D,comp,t,target,scene,opts);
};

C.layerActive=function(layer,t){
  if(layer.visible===false) return false;
  const lt=t+layer.startTime;
  if(lt<layer.inPoint-1e-6||lt>=layer.outPoint-1e-6) return false;
  return true;
};
C.is3DLayer=function(layer){
  if(layer.type==='geometry3d') return true;
  if(layer.type==='particle') return layer.threeD!==false;
  return false;
};

/* ==================== 相机 ==================== */
C.getActiveCamera=function(comp,t){
  for(const l of comp.layers){
    if(l.type==='camera' && C.layerActive(l,t)){
      const c=Model.evalObj(l,'camera',t,comp);
      const pos=c.position, tgt=c.pointOfInterest;
      return {
        pos:pos.slice(), target:tgt.slice(),
        fov:(c.fov||35)*Math.PI/180,
        focusDistance:c.focusDistance||1000, aperture:c.aperture||10,
        enableDOF:c.enableDOF!==false, blurLevel:c.blurLevel||1,
        layer:l,
      };
    }
  }
  const d=(comp.height/2)/Math.tan(35*Math.PI/360);
  return { pos:[comp.width/2,comp.height/2,-d], target:[comp.width/2,comp.height/2,0], fov:35*Math.PI/180,
    focusDistance:d, aperture:0, enableDOF:false, blurLevel:1, layer:null };
};
C.cameraVP=function(cam,comp){
  const aspect=Render.view.cw/Render.view.ch;
  const P=U.m4persp(cam.fov,aspect,1,20000);
  const V=U.m4lookAt(cam.pos,cam.target,[0,-1,0]);
  const T=Render.matNdcToComp();
  const view=Render.matComp();
  return U.m4mul(view,U.m4mul(T,U.m4mul(P,V)));
};

/* ==================== 场景 ==================== */
C.buildScene=function(comp,t,cam){
  const lights=[];
  for(const l of comp.layers){
    if(l.type!=='light'||!C.layerActive(l,t)) continue;
    const o=Model.evalObj(l,'light',t,comp);
    const typeMap={point:0,spot:1,parallel:2};
    const dir=o.type==='parallel'? U.vnorm(o.direction) : U.vnorm(U.vsub(o.pointOfInterest||[0,0,0],o.position));
    lights.push({
      type:typeMap[o.type]!==undefined?typeMap[o.type]:0,
      pos:o.position.slice(), dir,
      color:o.color.slice(), intensity:o.intensity,
      cosOuter:Math.cos((o.cornerAngle||45)*Math.PI/360),
      cosInner:Math.cos((o.cornerAngle||45)*(1-(o.cornerFeather||50)/100)*Math.PI/360),
      radius:o.radius||0, castShadow:!!o.castShadow,
    });
  }
  if(!lights.length){
    lights.push({type:2,pos:[comp.width/2,comp.height/2,-800],dir:[0,0,1],color:[1,1,1],intensity:1,cosOuter:1,cosInner:1,radius:0,castShadow:false});
  }
  return { lights, camPos:cam.pos, time:t, viewProj:C.cameraVP(cam,comp), cam };
};

/* ==================== 图层几何 ==================== */
C.layerGeometry=function(layer,comp,t){
  const key=layer.id+'@'+Math.round(t*1000);
  if(C.geomCache.has(key)) return C.geomCache.get(key);
  let g=null;
  if(layer.type==='shape'){
    const r=Geo.shapeContours(layer,t,comp);
    g={contours:r.contours,tris:r.tris};
  } else if(layer.type==='text'){
    const lay=Geo.textLayout(layer,t,comp);
    const contours=lay.glyphs.flatMap(gl=>gl.contours);
    g={contours,tris:Geo.triangulateTris(contours),layout:lay};
  } else if(layer.type==='geometry3d'){
    g=C.geometry3D(layer,comp,t);
  }
  C.geomCache.set(key,g);
  if(C.geomCache.size>4000){
    const ks=[...C.geomCache.keys()];
    for(let i=0;i<2000;i++) C.geomCache.delete(ks[i]);
  }
  return g;
};
C.sourceGeometry=function(layerId,comp,t){
  const layer=Model.getLayer(layerId);
  if(!layer) return null;
  return C.layerGeometry(layer,comp,t);
};
C.geometry3D=function(layer,comp,t){
  const geo=Model.evalObj(layer,'geo',t,comp);
  const mat=Model.evalObj(layer,'mat',t,comp);
  let contours=null;
  if(geo.sourceType==='primitive'){
    const mesh=Geo.primitive(geo.primitive,{size:(geo.depth||100)});
    return {mesh,mat,contours:[],tris:Geo.meshTris(mesh)};
  }
  let srcLayer=null;
  if(geo.sourceType==='text'){
    srcLayer=geo.sourceLayerId? Model.getLayer(geo.sourceLayerId):layer;
    const lay=Geo.textLayout(srcLayer,t,comp);
    contours=lay.glyphs.flatMap(gl=>gl.contours);
  } else {
    srcLayer=geo.sourceLayerId? Model.getLayer(geo.sourceLayerId):layer;
    if(srcLayer){
      if(srcLayer.type==='text'){ const lay=Geo.textLayout(srcLayer,t,comp); contours=lay.glyphs.flatMap(gl=>gl.contours); }
      else if(srcLayer.type==='shape'){ const r=Geo.shapeContours(srcLayer,t,comp); contours=r.contours; }
      else if(srcLayer.type==='geometry3d'){ const gg=C.geometry3D(srcLayer,comp,t); contours=gg.contours; }
    }
  }
  if(!contours||!contours.length) return {mesh:null,mat,contours:[],tris:[]};
  // 描边转轮廓（若源是开放路径）
  const mesh=Geo.extrude(contours,{depth:geo.depth,bevelEnabled:geo.bevelEnabled,bevelSize:geo.bevelSize,bevelSegments:geo.bevelSegments});
  let pos=Geo.deformMesh(mesh,geo.deformbend||0,geo.deformtwist||0);
  // 场
  const deform=Model.evalObj(layer,'deform',t,comp);
  if(comp.fields&&comp.fields.length) pos=Geo.applyFields(pos,comp.fields,t,deform.fieldStrength||1);
  if(deform.pins&&deform.pins.length) pos=Geo.applyPins(pos,mesh.normals,deform.pins.map(p=>{
    const rot=[ (p.rotX||0)*Math.PI/180, (p.rotY||0)*Math.PI/180, (p.rotZ||0)*Math.PI/180 ];
    return {...p, rot, restPosition:p.restPosition||p.position};
  }),t);
  mesh.positions=pos;
  // 重算法线
  C.recomputeNormals(mesh);
  return {mesh,mat,contours,tris:Geo.meshTris(mesh)};
};
C.recomputeNormals=function(mesh){
  const pos=mesh.positions, idx=mesh.indices;
  const nor=new Float32Array(pos.length);
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
    const ab=[pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]];
    const ac=[pos[c]-pos[a],pos[c+1]-pos[a+1],pos[c+2]-pos[a+2]];
    const n=U.vcross(ab,ac);
    for(const k of [a,b,c]){ nor[k]+=n[0];nor[k+1]+=n[1];nor[k+2]+=n[2]; }
  }
  for(let i=0;i<nor.length;i+=3){
    const l=Math.hypot(nor[i],nor[i+1],nor[i+2])||1;
    nor[i]/=l;nor[i+1]/=l;nor[i+2]/=l;
  }
  mesh.normals=nor;
};

/* ==================== 2D 图层 ==================== */
C.render2DLayer=function(layer,comp,t,target,opts){
  const cw=Render.view.cw, ch=Render.view.ch;
  const f=C.fbo(cw,ch); C.markUsed(f);
  Render.fillFBO(f,[0,0,0],0);
  C.renderLayerContent(layer,comp,t,f,opts);
  // 蒙版
  if(layer.masks&&layer.masks.length) C.applyMasks(layer,comp,t,f);
  // 效果
  if(layer.effects&&layer.effects.length) C.applyEffects(layer,comp,t,f);
  // 不透明度
  const op=Model.evalProperty(layer,'transform.opacity',t,comp)/100;
  // 轨道遮罩
  let matteTex=null;
  if(layer.matte&&layer.matte.layerId){
    const mf=C.fbo(cw,ch); C.markUsed(mf);
    Render.fillFBO(mf,[0,0,0],0);
    const ml=Model.getLayer(layer.matte.layerId);
    if(ml) C.renderLayerContent(ml,comp,t,mf,opts);
    matteTex=mf;
  }
  const mode=C.blendModeIndex(layer.blendMode);
  Render.blend(target,target,f,mode,op,matteTex);
  if(matteTex) C.release(matteTex);
  C.release(f);
};
C.blendModeIndex=function(b){
  switch(b){
    case 'add': case '相加': return 1;
    case 'screen': case '滤色': return 2;
    case 'multiply': case '正片叠底': return 3;
    case 'overlay': case '叠加': return 4;
    default: return 0;
  }
};

C.renderLayerContent=function(layer,comp,t,f,opts){
  const gl=Render.gl;
  const mat=Render.matComp();
  const world=Model.worldMatrix(layer,t,comp);
  const mvp=U.m4mul(mat,world);
  if(layer.type==='shape'){
    const g=C.layerGeometry(layer,comp,t);
    if(!g) return;
    const shape=Model.evalObj(layer,'shape',t,comp);
    if(shape.fill&&shape.fill.enabled&&g.tris.length){
      const c=shape.fill.color;
      Render.drawTris(f,g.tris,mvp,[c[0],c[1],c[2],1],0,(shape.fill.opacity===undefined?100:shape.fill.opacity)/100);
    }
    if(shape.stroke&&shape.stroke.enabled){
      const w=shape.stroke.width;
      if(w>0){
        const contours=[];
        for(const pd of (shape.paths||[])){
          const pts=U.flattenPathData(pd,20);
          if(pts.length>1){
            const out=U.strokeOutline(pts,w,{cap:shape.stroke.cap||'round',join:shape.stroke.join||'round',closed:pd.closed});
            contours.push(...out);
          }
        }
        const tris=Geo.triangulateTris(contours);
        if(tris.length){
          const c=shape.stroke.color;
          Render.drawTris(f,tris,mvp,[c[0],c[1],c[2],1],0,(shape.stroke.opacity===undefined?100:shape.stroke.opacity)/100);
        }
      }
    }
  } else if(layer.type==='text'){
    const g=C.layerGeometry(layer,comp,t);
    if(!g) return;
    const txt=Model.evalObj(layer,'text',t,comp);
    const allTris=[];
    if(txt.fill&&txt.fill.enabled){
      for(const gl2 of g.layout.glyphs){
        const tris=Geo.triangulateTris(gl2.contours);
        const op=(gl2.op===undefined?100:gl2.op)/100;
        if(tris.length) Render.drawTris(f,tris,mvp,[txt.fill.color[0],txt.fill.color[1],txt.fill.color[2],1],0,op);
      }
    }
    if(txt.stroke&&txt.stroke.enabled&&txt.stroke.width>0){
      for(const gl2 of g.layout.glyphs){
        const contours=[];
        for(const cc of gl2.contours){
          if(cc.pts.length>1) contours.push(...U.strokeOutline(cc.pts,txt.stroke.width,{closed:true}));
        }
        const tris=Geo.triangulateTris(contours);
        if(tris.length) Render.drawTris(f,tris,mvp,[txt.stroke.color[0],txt.stroke.color[1],txt.stroke.color[2],1],0,1);
      }
    }
  } else if(layer.type==='precomp'){
    const sub=Model.getComp(layer.precompId);
    if(!sub) return;
    const sf=C.fbo(cw,ch); C.markUsed(sf);
    C.renderComp(sub,t+layer.startTime-(layer.inPoint||0),sf,opts);
    // 画纹理四边形
    const quad=[[-sub.width/2,-sub.height/2,0,0],[sub.width/2,-sub.height/2,1,0],[sub.width/2,sub.height/2,1,1],
                [-sub.width/2,-sub.height/2,0,0],[sub.width/2,sub.height/2,1,1],[-sub.width/2,sub.height/2,0,1]];
    Render.drawTrisTex(f,quad,mvp,sf.tex,[1,1,1,1]);
    C.release(sf);
  } else if(layer.type==='adjust'){
    Render.copy(f,target);
  }
};

/* ==================== 蒙版 ==================== */
C.applyMasks=function(layer,comp,t,f){
  const cw=Render.view.cw, ch=Render.view.ch;
  const mf=C.fbo(cw,ch); C.markUsed(mf);
  Render.fillFBO(mf,[0,0,0],0);
  const gl=Render.gl;
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
  const mat=Render.matComp();
  const world=Model.worldMatrix(layer,t,comp);
  const mvp=U.m4mul(mat,world);
  for(const mask of layer.masks){
    if(mask.enabled===false) continue;
    const contours=C.maskContours(mask,comp,t);
    const tris=Geo.triangulateTris(contours);
    const op=(mask.opacity===undefined?100:mask.opacity)/100;
    Render.drawTris(mf,tris,mvp,[1,1,1,op],0,1);
  }
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  // 反转
  let inverted=layer.masks.some(m=>m.inverted);
  if(inverted){
    // 用 1-alpha 近似：绘制白色背景再减去
    const inv=C.fbo(cw,ch); C.markUsed(inv);
    Render.fillFBO(inv,[1,1,1],1);
    Render.blend(inv,inv,mf,3,1);   // 正片叠底：白 * mask
    // 需要 1-mask，用 custom 太繁琐；改为逐 mask 处理
    C.release(inv);
  }
  // 羽化
  let feather=0;
  for(const m of layer.masks) feather=Math.max(feather,m.feather||0);
  if(feather>0.5) Render.blur(mf,feather);
  Render.blend(f,f,mf,0,1,mf);
  C.release(mf);
};
C.maskContours=function(mask,comp,t){
  const type=mask.type||'rect';
  if(type==='ellipse'){
    const cx=mask.cx!==undefined?mask.cx:comp.width/2, cy=mask.cy!==undefined?mask.cy:comp.height/2;
    const rx=mask.rx!==undefined?mask.rx:100, ry=mask.ry!==undefined?mask.ry:100;
    return [U.ellipseContour(cx,cy,rx,ry,40)];
  }
  if(type==='path'&&mask.path){
    return [{pts:U.flattenPathData(mask.path,20),closed:mask.path.closed!==false}];
  }
  const x=mask.x||0,y=mask.y||0,w=mask.w||100,h=mask.h||100;
  return [U.rectContour(x,y,w,h)];
};

/* ==================== 效果 ==================== */
C.applyEffects=function(layer,comp,t,f){
  const cw=f.w,ch=f.h;
  for(let i=0;i<layer.effects.length;i++){
    const fx=layer.effects[i];
    if(fx.enabled===false) continue;
    const o=C.effectObj(layer,i,t);
    if(!o) continue;
    const p=o.params;
    if(fx.type==='gaussianBlur'){
      Render.blur(f,Math.max(0.5,p.radius||0));
    } else if(fx.type==='glow'){
      const blur=C.fbo(cw,ch); C.markUsed(blur);
      Render.copy(blur,f);
      Render.blur(blur,Math.max(0.5,p.radius||10));
      Render.glow(f,blur,[p.color[0],p.color[1],p.color[2],1],p.intensity);
      C.release(blur);
    } else if(fx.type==='dropShadow'){
      const blur=C.fbo(cw,ch); C.markUsed(blur);
      Render.copy(blur,f);
      Render.blur(blur,Math.max(0.5,p.radius||8));
      Render.dropShadow(f,blur,[(p.offsetX||0)/cw*2,(p.offsetY||0)/ch*2],[p.color[0],p.color[1],p.color[2],1],(p.opacity===undefined?70:p.opacity)/100);
      C.release(blur);
    } else if(fx.type==='hueSat'){
      Render.post(f,p.hue||0,p.saturation===undefined?1:p.saturation,p.brightness||0,0,0);
    } else if(fx.type==='vignette'){
      Render.post(f,0,1,0,p.amount||0,0);
    } else if(fx.type==='chromatic'){
      Render.post(f,0,1,0,0,p.amount||0);
    }
  }
};

/* ==================== 3D 渲染 ==================== */
C.render3D=function(layers,comp,t,target,scene,opts){
  const cw=Render.view.cw, ch=Render.view.ch;
  const f=C.fbo(cw,ch,{depth:true}); C.markUsed(f);
  Render.clearFBO(f,[0,0,0],0);
  const gl=Render.gl;
  // 阴影贴图
  const shadowLight=scene.lights.find(l=>l.castShadow);
  let shadowFBO=null, shadowMat=null;
  if(shadowLight){
    shadowFBO=Render.createFBO(1024,1024,{depth:true});
    shadowMat=C.lightShadowMatrix(shadowLight,comp);
    scene.shadowMap=shadowFBO; scene.shadowMat=shadowMat;
    // 渲染所有 3D 网格深度
    for(const layer of layers){
      if(layer.type!=='geometry3d') continue;
      const g=C.layerGeometry(layer,comp,t);
      if(g&&g.mesh){
        const wm=Model.worldMatrix(layer,t,comp);
        Render.renderShadowMap(shadowFBO,g.mesh,wm,shadowMat);
      }
    }
  }
  // 不透明网格
  for(const layer of layers){
    if(layer.type!=='geometry3d') continue;
    const g=C.layerGeometry(layer,comp,t);
    if(!g||!g.mesh) continue;
    const wm=Model.worldMatrix(layer,t,comp);
    const op=Model.evalProperty(layer,'transform.opacity',t,comp)/100;
    const mat=Object.assign({},g.mat,{opacity:(g.mat.opacity===undefined?100:g.mat.opacity)*op});
    Render.drawMesh(f,g.mesh,wm,mat,scene,{blend:false});
  }
  // 透明网格
  for(const layer of layers){
    if(layer.type!=='geometry3d') continue;
    const g=C.layerGeometry(layer,comp,t);
    if(!g||!g.mesh) continue;
    const op=Model.evalProperty(layer,'transform.opacity',t,comp)/100;
    const mo=(g.mat.opacity===undefined?100:g.mat.opacity)*op;
    if(mo>=0.999) continue;
    const wm=Model.worldMatrix(layer,t,comp);
    Render.drawMesh(f,g.mesh,wm,Object.assign({},g.mat,{opacity:mo}),scene,{blend:true,depthMask:false});
  }
  // 粒子
  for(const layer of layers){
    if(layer.type!=='particle') continue;
    C.renderParticles3D(layer,comp,t,f,scene);
  }
  // 景深
  const cam=scene.cam;
  if(cam&&cam.enableDOF&&cam.aperture>0){
    Render.dof(f,cam.focusDistance,cam.aperture,cam.blurLevel,1,20000);
  }
  const mode=C.blendModeIndex(layers[layers.length-1].blendMode);
  Render.blend(target,target,f,mode,1);
  Render.releaseFBO(shadowFBO);
  C.release(f);
};
C.lightShadowMatrix=function(light,comp){
  const cx=comp.width/2, cy=comp.height/2, cz=0;
  const size=Math.max(comp.width,comp.height)*1.2;
  let V,P;
  if(light.type===2){
    const eye=[cx-light.dir[0]*size*2, cy-light.dir[1]*size*2, cz-light.dir[2]*size*2];
    V=U.m4lookAt(eye,[cx,cy,cz],[0,-1,0]);
    P=U.m4ortho(-size,size,-size,size,0.1,size*5);
  }else{
    V=U.m4lookAt(light.pos,[light.pos[0]+light.dir[0],light.pos[1]+light.dir[1],light.pos[2]+light.dir[2]],[0,-1,0]);
    const fov=Math.max(0.2,Math.acos(U.clamp(light.cosOuter,-1,1))*2);
    P=U.m4persp(fov,1,1,20000);
  }
  return U.m4mul(P,V);
};
C.renderParticles3D=function(layer,comp,t,f,scene){
  const ps=Model.evalObj(layer,'particle',t,comp);
  const s=Particles.sample(layer,comp,t);
  const cam=scene.cam;
  const focal=Render.view.ch/(2*Math.tan(cam.fov/2));
  const parts=s.particles.map(p=>{
    const depth=Math.max(1,U.vdist(p.pos,cam.pos));
    return {pos:p.pos,size:p.size*focal/depth,color:[p.color[0],p.color[1],p.color[2],p.alpha],rot:0};
  });
  if(parts.length) Render.drawSprites(f,parts,scene.viewProj,[Render.view.cw,Render.view.ch],{add:true});
  // 拖尾
  const trailTris=Particles.buildTrails(layer,comp,t,s.hist,cam.pos,scene.viewProj,[Render.view.cw,Render.view.ch]);
  if(trailTris.length){
    Render.drawTrails(f,trailTris,scene.viewProj,[ps.colorStart?ps.colorStart[0]:1,ps.colorStart?ps.colorStart[1]:0.7,ps.colorStart?ps.colorStart[2]:0.3],1);
  }
};

})();
