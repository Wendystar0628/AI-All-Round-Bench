/* 铸帧 ForgeFrame · 几何引擎：形状求值 / 挤出 / 变形 / 场 / 碰撞 */
"use strict";
(function(){
const FF=window.FF, V=FF.V, M4=FF.M4, Path=FF.Path, Eval=FF.Eval,
  clamp=FF.util.clamp, lerp=FF.util.lerp, smooth=FF.util.smooth, DEG=FF.util.DEG, uid=FF.util.uid;

FF.makeModifier=(type)=>{
  const m={ id:uid('S'), kind:type };
  if(type==='trim'){ m.name='修剪路径'; m.start=FF.P('num',0); m.end=FF.P('num',100); m.offset=FF.P('num',0); m.mode='simultaneously'; }
  else if(type==='repeater'){ m.name='重复器'; m.copies=FF.P('num',3);
    m.position=FF.P('vec2',[60,0]); m.rotation=FF.P('num',0); m.scale=FF.P('vec2',[100,100]);
    m.anchor=FF.P('vec2',[0,0]); m.fade=FF.P('num',100); }
  else if(type==='boolean'){ m.name='布尔'; m.op='union'; m.source=null; }
  return m;
};

/* ---------- 形状图层求值 ---------- */
function shapeItemGeometry(ctx,layer,item,t){
  const idx=layer.shapes.indexOf(item);
  const pos=Eval.prop(ctx,layer,'shapes.'+idx+'.position',t)||[0,0];
  const fill=item.fill&&item.fill.enabled?{
    color:Eval.prop(ctx,layer,'shapes.'+idx+'.fill.color',t),
    opacity:(Eval.prop(ctx,layer,'shapes.'+idx+'.fill.opacity',t)||0)/100,
    gradient:item.fill.color2?{type:'radial',
      color2:Eval.prop(ctx,layer,'shapes.'+idx+'.fill.color2',t),
      center:[pos[0],pos[1]], radius:item.fill.gradRadius||80}:null}:null;
  const stroke=item.stroke&&item.stroke.enabled?{
    color:Eval.prop(ctx,layer,'shapes.'+layer.shapes.indexOf(item)+'.stroke.color',t),
    width:Eval.prop(ctx,layer,'shapes.'+layer.shapes.indexOf(item)+'.stroke.width',t)||1,
    opacity:(Eval.prop(ctx,layer,'shapes.'+layer.shapes.indexOf(item)+'.stroke.opacity',t)||0)/100}:null;
  let path=null, ribbon=null;
  if(item.kind==='rect'){
    const size=Eval.prop(ctx,layer,'shapes.'+idx+'.size',t), r=Eval.prop(ctx,layer,'shapes.'+idx+'.roundness',t)||0;
    path=Path.rect(-size[0]/2,-size[1]/2,size[0],size[1],r);
  } else if(item.kind==='ellipse'){
    const size=Eval.prop(ctx,layer,'shapes.'+idx+'.size',t);
    path=Path.ellipse(0,0,size[0]/2,size[1]/2);
  } else if(item.kind==='path'){
    path=Eval.prop(ctx,layer,'shapes.'+idx+'.path',t)||Path.empty();
  } else if(item.kind==='strokeRef'){
    let src=FF.layerByName(ctx.comp,item.sourceLayer)||FF.findLayer(ctx.comp,item.sourceLayer);
    if(!src){ for(const c of ctx.project.comps){ src=FF.layerByName(c,item.sourceLayer); if(src) break; } }
    let ch='火';
    if(src&&src.type==='text') ch=[...Eval.prop(ctx,src,'text.content',t)][0]||'火';
    else if(src) ch=[...String(src.text&&src.text.content.value||'火')][0];
    const write=(Eval.prop(ctx,layer,'shapes.'+idx+'.write',t)||0)/100;
    const strokes=FF.glyphs.getChar(ch);
    if(strokes&&strokes[item.strokeIndex]){
      ribbon={stroke:strokes[item.strokeIndex], frac:write, color:fill?fill.color:[1,1,1], opacity:fill?fill.opacity:1};
      path={c:[FF.glyphs.strokeOutline(strokes[item.strokeIndex],2.4)]};
    } else path=Path.empty();
  }
  if(path&&pos&&(pos[0]||pos[1])) path=Path.transform(path,[1,0,0,1,pos[0],pos[1]]);
  const rings=[], opens=[];
  if(path) for(const c of path.c){
    const flat=Path.flatten(c,0.7);
    if(flat.length<4) continue;
    if(c.closed) rings.push(flat); else opens.push(flat);
  }
  return {rings, opens, ribbon, fill, stroke, srcId:item.id};
}
function trimPiece(piece,start,end,offset){
  const s=(start/100+offset/360)%1, e=(end/100+offset/360)%1;
  const sn=((s%1)+1)%1, en=((e%1)+1)%1;
  const out={...piece, rings:[], opens:[]};
  for(const r of piece.rings){
    const trimmed=Path.trimFlat(r,sn,en,true);
    if(trimmed.length>=4) out.opens.push(trimmed);
  }
  for(const o of piece.opens){
    const trimmed=Path.trimFlat(o,sn,en,false);
    if(trimmed.length>=4) out.opens.push(trimmed);
  }
  if(piece.ribbon) out.ribbon={...piece.ribbon, frac:piece.ribbon.frac*clamp(en-sn,0,1)};
  return out;
}
function repeatPiece(piece,m,ctx,layer,idx,t){
  const copies=Math.max(1,Math.round(Eval.prop(ctx,layer,'shapes.'+idx+'.copies',t)||1));
  const dp=Eval.prop(ctx,layer,'shapes.'+idx+'.position',t)||[0,0];
  const dr=(Eval.prop(ctx,layer,'shapes.'+idx+'.rotation',t)||0)*DEG;
  const ds=Eval.prop(ctx,layer,'shapes.'+idx+'.scale',t)||[100,100];
  const anch=Eval.prop(ctx,layer,'shapes.'+idx+'.anchor',t)||[0,0];
  const fade=(Eval.prop(ctx,layer,'shapes.'+idx+'.fade',t)||100)/100;
  const out=[];
  let acc=[1,0,0,1,0,0];
  for(let i=0;i<copies;i++){
    const cp=FF.deepClone(piece);
    const tr=(r)=>Path.transform(r,acc);
    cp.rings=piece.rings.map(r=>{
      const path={c:[{closed:true,p:flatToPts(r)}]};
      return Path.flatten(Path.transform(path,acc).c[0],0.7);
    });
    cp.opens=piece.opens.map(r=>{
      const path={c:[{closed:false,p:flatToPts(r)}]};
      return Path.flatten(Path.transform(path,acc).c[0],0.7);
    });
    if(cp.fill) cp.fill={...cp.fill, opacity:cp.fill.opacity*lerp(1,fade,i/(copies-1||1))};
    if(cp.stroke) cp.stroke={...cp.stroke, opacity:cp.stroke.opacity*lerp(1,fade,i/(copies-1||1))};
    if(cp.ribbon) cp.ribbon={...cp.ribbon, opacity:cp.ribbon.opacity*lerp(1,fade,i/(copies-1||1)),
      stroke:transformStroke(cp.ribbon.stroke,acc)};
    out.push(cp);
    const step=Path.affine(dp[0],dp[1],dr,ds[0]/100,ds[1]/100,anch[0],anch[1]);
    acc=[ acc[0]*step[0]+acc[2]*step[1], acc[1]*step[0]+acc[3]*step[1],
      acc[0]*step[2]+acc[2]*step[3], acc[1]*step[2]+acc[3]*step[3],
      acc[0]*step[4]+acc[2]*step[5]+acc[4], acc[1]*step[4]+acc[3]*step[5]+acc[5] ];
  }
  return out;
}
function flatToPts(flat){ const p=[]; for(let i=0;i<flat.length;i+=2) p.push([flat[i],flat[i+1],flat[i],flat[i+1],flat[i],flat[i+1]]); return p; }
function transformStroke(stroke,m){
  const tp=(x,y)=>[m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
  const sc=Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))||1;
  return {p:stroke.p.map(q=>{ const a=tp(q[0],q[1]); return [a[0],a[1],q[2]*sc]; })};
}
function shapeLayerGeo(ctx,layer,t){
  const ck='SG:'+layer.id+':'+t.toFixed(5);
  if(ctx.cache.has(ck)) return ctx.cache.get(ck);
  let pieces=[];
  const items=layer.shapes||[];
  for(let idx=0;idx<items.length;idx++){
    const item=items[idx];
    if(item.kind==='rect'||item.kind==='ellipse'||item.kind==='path'||item.kind==='strokeRef'){
      pieces.push(shapeItemGeometry(ctx,layer,item,t));
    } else if(item.kind==='trim'){
      const s=Eval.prop(ctx,layer,'shapes.'+idx+'.start',t)||0;
      const e=Eval.prop(ctx,layer,'shapes.'+idx+'.end',t);
      const o=Eval.prop(ctx,layer,'shapes.'+idx+'.offset',t)||0;
      pieces=pieces.map(p=>trimPiece(p,s,e===undefined?100:e,o));
    } else if(item.kind==='repeater'){
      const out=[];
      for(const p of pieces) out.push(...repeatPiece(p,item,ctx,layer,idx,t));
      pieces=out;
    } else if(item.kind==='boolean'){
      const srcItem=items.find(x=>x.id===item.source)||items.filter(x=>['rect','ellipse','path','strokeRef'].includes(x.kind)).pop();
      if(srcItem){
        const src=shapeItemGeometry(ctx,layer,srcItem,t);
        const subj=[], clip=src.rings;
        for(const p of pieces) subj.push(...p.rings);
        const res=FF.poly.boolean(FF.poly.orient(subj),FF.poly.orient(clip),item.op);
        const style=pieces[pieces.length-1];
        pieces=[{rings:res, opens:[], ribbon:null, fill:style?style.fill:null, stroke:style?style.stroke:null, srcId:item.id}];
      }
    }
  }
  const rings=[]; for(const p of pieces) rings.push(...p.rings);
  const out={pieces, rings};
  ctx.cache.set(ck,out);
  return out;
}

/* ---------- 文字几何 ---------- */
function textGeo(ctx,layer,t){
  const ck='TG:'+layer.id+':'+t.toFixed(5);
  if(ctx.cache.has(ck)) return ctx.cache.get(ck);
  const content=Eval.prop(ctx,layer,'text.content',t);
  const fontSize=Eval.prop(ctx,layer,'text.fontSize',t)||80;
  const lineHeight=Eval.prop(ctx,layer,'text.lineHeight',t)||1.25;
  const tracking=Eval.prop(ctx,layer,'text.tracking',t)||0;
  const fill=Eval.prop(ctx,layer,'text.fill',t)||[1,1,1];
  const lay=FF.glyphs.layout(content,fontSize,lineHeight,layer.text.align,tracking);
  // 动画器
  const anims=(layer.text.animators||[]).map(a=>{
    const unit=a.range.unit||'char';
    const total=unit==='line'?(lay.chars.length?Math.max(...lay.chars.map(c=>c.line))+1:1)
      :unit==='word'?countWords(content):lay.chars.length;
    return {
      unit, total,
      start:(Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.range.start',t)||0)/100,
      end:(Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.range.end',t)===undefined?100:Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.range.end',t))/100,
      offset:(Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.range.offset',t)||0)/100,
      soft:(Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.range.softness',t)||0)/100,
      pos:a.props.position?Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.props.position',t):null,
      rot:a.props.rotation?Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.props.rotation',t):null,
      scl:a.props.scale?Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.props.scale',t):null,
      opa:a.props.opacity?Eval.prop(ctx,layer,'text.animators.'+layer.text.animators.indexOf(a)+'.props.opacity',t):null,
    };
  });
  let wordIdx=0; const wordMap=[];
  { let inWord=false; let wi=0;
    for(const ch of content){ if(/\s/.test(ch)){ inWord=false; } else { if(!inWord){ wi++; inWord=true; } } wordMap.push(wi-1); } }
  let ci=0;
  const chars=lay.chars.map(c=>{
    let x=c.x, y=c.y, rot=0, sx=1, sy=1, opa=1;
    const unitIdx=c.line!==undefined?c.line:0;
    for(const a of anims){
      let idx=0, total=a.total||1;
      if(a.unit==='line'){ idx=c.line; }
      else if(a.unit==='word'){ idx=wordMap[ci]||0; }
      else idx=ci;
      const u=total>1?idx/(total-1):0;
      let s=a.start+a.offset, e=a.end+a.offset;
      let w;
      if(s<=e){ w=(u>=s&&u<=e)?1:0;
        if(a.soft>0){ if(u<s) w=clamp(1-(s-u)/a.soft,0,1); else if(u>e) w=clamp(1-(u-e)/a.soft,0,1); }
      } else { w=(u>=s||u<=e)?1:0; }
      w=smooth(clamp(w,0,1));
      if(a.pos){ x+=a.pos[0]*w; y+=a.pos[1]*w; }
      if(a.rot!==null) rot+=a.rot*DEG*w;
      if(a.scl){ sx*=lerp(1,a.scl[0]/100,w); sy*=lerp(1,a.scl[1]/100,w); }
      if(a.opa!==null) opa*=lerp(1,a.opa/100,w);
    }
    ci++;
    // 字符绕自身中心变换
    const cx=c.x+c.size*50, cy=c.y+c.size*50;
    const mm=[Math.cos(rot)*sx, Math.sin(rot)*sx, -Math.sin(rot)*sy, Math.cos(rot)*sy,
      cx + (x-c.x) - Math.cos(rot)*sx*cx + Math.sin(rot)*sy*cy,
      cy + (y-c.y) - Math.sin(rot)*sx*cx - Math.cos(rot)*sy*cy];
    const strokes=(c.strokes||[]).map(st=>transformStroke(st,[c.size*mm[0],c.size*mm[1],c.size*mm[2],c.size*mm[3],mm[4],mm[5]]));
    return {ch:c.ch, strokes, opacity:opa, cx:mm[4], cy:mm[5], missing:!c.strokes};
  });
  const out={chars, fill, width:lay.width, height:lay.height};
  ctx.cache.set(ck,out);
  return out;
}
function countWords(text){ let n=0,inW=false; for(const ch of text){ if(/\s/.test(ch)) inW=false; else if(!inW){n++;inW=true;} } return Math.max(1,n); }

/* ---------- 网格工具 ---------- */
function newMesh(){ return {pos:[], nrm:[], idx:[]}; }
function meshBounds(mesh){
  let x0=1e18,y0=1e18,z0=1e18,x1=-1e18,y1=-1e18,z1=-1e18;
  for(let i=0;i<mesh.pos.length;i+=3){
    x0=Math.min(x0,mesh.pos[i]); x1=Math.max(x1,mesh.pos[i]);
    y0=Math.min(y0,mesh.pos[i+1]); y1=Math.max(y1,mesh.pos[i+1]);
    z0=Math.min(z0,mesh.pos[i+2]); z1=Math.max(z1,mesh.pos[i+2]);
  }
  if(x0>x1) return {min:[0,0,0],max:[0,0,0],center:[0,0,0],size:[0,0,0]};
  return {min:[x0,y0,z0],max:[x1,y1,z1],center:[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],size:[x1-x0,y1-y0,z1-z0]};
}
function transformMesh(mesh,m){
  const out=newMesh();
  const nm=M4.invert(m);
  for(let i=0;i<mesh.pos.length;i+=3){
    const p=M4.transformPoint(m,[mesh.pos[i],mesh.pos[i+1],mesh.pos[i+2]]);
    out.pos.push(p[0],p[1],p[2]);
    const n=M4.transformDir([nm[0],nm[4],nm[8],0,nm[1],nm[5],nm[9],0,nm[2],nm[6],nm[10],0,0,0,0,1],
      [mesh.nrm[i],mesh.nrm[i+1],mesh.nrm[i+2]]);
    const l=Math.hypot(n[0],n[1],n[2])||1;
    out.nrm.push(n[0]/l,n[1]/l,n[2]/l);
  }
  out.idx=mesh.idx.slice();
  return out;
}
function mergeMeshes(list){
  const out=newMesh();
  for(const m of list){
    const base=out.pos.length/3;
    out.pos.push(...m.pos); out.nrm.push(...m.nrm);
    for(const i of m.idx) out.idx.push(i+base);
  }
  return out;
}
function recomputeNormals(mesh){
  const n=new Float32Array(mesh.pos.length);
  for(let i=0;i<mesh.idx.length;i+=3){
    const a=mesh.idx[i]*3,b=mesh.idx[i+1]*3,c=mesh.idx[i+2]*3;
    const ux=mesh.pos[b]-mesh.pos[a],uy=mesh.pos[b+1]-mesh.pos[a+1],uz=mesh.pos[b+2]-mesh.pos[a+2];
    const vx=mesh.pos[c]-mesh.pos[a],vy=mesh.pos[c+1]-mesh.pos[a+1],vz=mesh.pos[c+2]-mesh.pos[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    for(const k of [a,b,c]){ n[k]+=nx; n[k+1]+=ny; n[k+2]+=nz; }
  }
  for(let i=0;i<n.length;i+=3){
    const l=Math.hypot(n[i],n[i+1],n[i+2])||1;
    mesh.nrm[i]=n[i]/l; mesh.nrm[i+1]=n[i+1]/l; mesh.nrm[i+2]=n[i+2]/l;
  }
  return mesh;
}

/* ---------- 挤出 ---------- */
function groupRings(rings){
  const oriented=FF.poly.orient(rings);
  const areas=oriented.map(r=>Path.area(r));
  const groups=[]; const outers=[];
  oriented.forEach((r,i)=>{ if(areas[i]>0){ const g={outer:r,holes:[]}; groups.push(g); outers.push(g); } });
  oriented.forEach((r,i)=>{
    if(areas[i]<0){
      let best=null,bd=1e18;
      for(const g of outers){
        if(Path.pointIn(g.outer,r[0],r[1])){ const a=Math.abs(Path.area(g.outer)); if(a<bd){bd=a;best=g;} }
      }
      if(best) best.holes.push(r); else if(outers.length) outers[0].holes.push(r);
    }
  });
  return groups;
}
function extrude(rings,depth,bevel,bevelSegs){
  depth=Math.max(0.01,depth); bevel=Math.max(0,Math.min(bevel,depth/2-0.01));
  bevelSegs=bevel>0.05?(bevelSegs||2):0;
  const groups=groupRings(rings);
  const mesh=newMesh();
  // 每层轮廓偏移
  const levels=[];
  if(bevelSegs>0){
    for(let s=0;s<=bevelSegs;s++){ const f=s/bevelSegs;
      levels.push({z:-depth/2+bevel*f, off:bevel*(1-f), nz:-Math.cos(f*Math.PI/2), blend:1-f}); }
    levels.push({z:depth/2-bevel, off:0, nz:0, blend:0});
    for(let s=bevelSegs;s>=0;s--){ const f=s/bevelSegs;
      levels.push({z:depth/2-bevel*f, off:bevel*(1-f), nz:Math.cos(f*Math.PI/2), blend:1-f}); }
  } else {
    levels.push({z:-depth/2, off:0, nz:0, blend:0});
    levels.push({z:depth/2, off:0, nz:0, blend:0});
  }
  for(const g of groups){
    const all=[g.outer,...g.holes];
    // 面（前/后）
    const faceRings=all.map(r=>bevel>0.05?Path.offsetPoly(r,bevel):r.slice());
    for(const side of [-1,1]){
      const tri=FF.earcut(faceRings);
      const base=mesh.pos.length/3;
      const z=side*depth/2;
      for(let i=0;i<tri.verts.length;i+=2){ mesh.pos.push(tri.verts[i],tri.verts[i+1],z); mesh.nrm.push(0,0,side); }
      for(const i of tri.idx) mesh.idx.push(base+i);
    }
    // 侧壁
    const ringStarts=[];
    for(const ring of all){
      const area=Path.area(ring); const osign=area>0?-1:1;
      const n=ring.length/2;
      const start=mesh.pos.length/3; ringStarts.push({start,n});
      for(const lv of levels){
        const rr=lv.off>0.01?Path.offsetPoly(ring,lv.off):ring;
        for(let i=0;i<n;i++){
          const p=(i-1+n)%n, q=(i+1)%n;
          let dx=rr[q*2]-rr[p*2], dy=rr[q*2+1]-rr[p*2+1];
          const l=Math.hypot(dx,dy)||1; dx/=l; dy/=l;
          let nx=-dy*osign, ny=dx*osign;
          const nz=lv.nz*(area>0?1:-1)*0; // 侧壁法线 z 分量由倒角斜率给出
          const bz=lv.blend!==undefined?lv.blend:0;
          const signZ=lv.z<0?-1:1;
          const zz=bz>0?signZ*bz*0.9:0;
          const nl=Math.hypot(nx,ny,zz)||1;
          mesh.pos.push(rr[i*2],rr[i*2+1],lv.z);
          mesh.nrm.push(nx/nl,ny/nl,zz/nl);
        }
      }
    }
    for(const {start,n} of ringStarts){
      for(let lv=0;lv<levels.length-1;lv++){
        for(let i=0;i<n;i++){
          const j=(i+1)%n;
          const a=start+lv*n+i, b=start+lv*n+j, c=start+(lv+1)*n+i, d=start+(lv+1)*n+j;
          mesh.idx.push(a,c,b, b,c,d);
        }
      }
    }
  }
  return mesh;
}
function planeMesh(w,h,segs){
  segs=segs||1; const mesh=newMesh();
  for(let j=0;j<=segs;j++)for(let i=0;i<=segs;i++){
    mesh.pos.push((i/segs-0.5)*w,(j/segs-0.5)*h,0);
    mesh.nrm.push(0,0,1);
  }
  for(let j=0;j<segs;j++)for(let i=0;i<segs;i++){
    const a=j*(segs+1)+i, b=a+1, c=a+segs+1, d=c+1;
    mesh.idx.push(a,c,b, b,c,d);
  }
  return mesh;
}
function boxMesh(w,h,d){
  const rings=[Path.flatten(Path.rect(-w/2,-h/2,w,h,0).c[0],1)];
  return extrude(rings,d,0,0);
}

/* ---------- 场 ---------- */
function fieldAt(ctx,fieldLayer,pos,t){
  const f=fieldLayer.field;
  const wm=Eval.worldMatrix(ctx,fieldLayer,t).m;
  const fp=M4.transformPoint(wm,[0,0,0]);
  const radius=Math.max(1,Eval.prop(ctx,fieldLayer,'field.radius',t));
  const strength=Eval.prop(ctx,fieldLayer,'field.strength',t)||0;
  const freq=Eval.prop(ctx,fieldLayer,'field.freq',t)||1;
  const dir=Eval.prop(ctx,fieldLayer,'field.direction',t)||[0,1,0];
  const d=V.dist(pos,fp);
  const fall=clamp(1-d/radius,0,1); const w=smooth(fall);
  if(w<=0) return [0,0,0];
  if(f.fieldType==='falloff'){
    const dv=V.norm(V.sub(pos,fp));
    return V.mul(dv,strength*w);
  }
  if(f.fieldType==='noise'){
    const s=strength*w;
    return [FF.rng.noise3(pos[0]*freq*0.01+t*0.8,pos[1]*freq*0.01,pos[2]*freq*0.01,11)*s,
      FF.rng.noise3(pos[0]*freq*0.01,pos[1]*freq*0.01+t*0.8,pos[2]*freq*0.01,29)*s,
      FF.rng.noise3(pos[0]*freq*0.01,pos[1]*freq*0.01,pos[2]*freq*0.01+t*0.8,47)*s];
  }
  if(f.fieldType==='vortex'){
    const axis=V.norm(M4.transformDir(wm,dir));
    const rel=V.sub(pos,fp);
    const tang=V.cross(axis,rel);
    const l=V.len(tang)||1;
    return V.mul(tang,strength*w/l);
  }
  return [0,0,0];
}

/* ---------- 网格变形（图钉 / 弯曲 / 扭转 / 场） ---------- */
function deformMesh(ctx,layer,mesh,t){
  const g=layer.geo;
  const pins=(g.pins||[]).filter(p=>p.enabled!==false);
  const bend=Eval.prop(ctx,layer,'geo.bend',t)||0;
  const twist=Eval.prop(ctx,layer,'geo.twist',t)||0;
  const fields=(g.fields||[]).filter(f=>f.layerId);
  const hasWork=pins.length||Math.abs(bend)>0.01||Math.abs(twist)>0.01||fields.length;
  if(!hasWork) return mesh;
  const bounds=meshBounds(mesh);
  const wm=Eval.worldMatrix(ctx,layer,t).m;
  const iw=M4.invert(wm);
  const fieldLayers=fields.map(f=>({l:FF.findLayer(ctx.comp,f.layerId), s:Eval.prop(ctx,layer,'geo.fields.'+g.fields.indexOf(f)+'.strength',t)||1})).filter(x=>x.l);
  const pinData=pins.map((p,i)=>({
    base:p.base||[0,0,0],
    target:Eval.prop(ctx,layer,'geo.pins.'+i+'.pos',t)||p.base,
    rot:(Eval.prop(ctx,layer,'geo.pins.'+i+'.rotation',t)||0)*DEG,
    scl:(Eval.prop(ctx,layer,'geo.pins.'+i+'.scale',t)||100)/100,
    radius:Math.max(10,p.radius||120),
  }));
  const out=newMesh();
  const ext=Math.max(bounds.size[0],bounds.size[1],1);
  for(let i=0;i<mesh.pos.length;i+=3){
    let v=[mesh.pos[i],mesh.pos[i+1],mesh.pos[i+2]];
    // 弯曲 / 扭转
    if(Math.abs(bend)>0.01){
      const th=bend*DEG*(v[0]/ext);
      const c=Math.cos(th),s=Math.sin(th);
      const y=v[1]-bounds.center[1], z=v[2];
      v=[v[0], bounds.center[1]+y*c-z*s, y*s+z*c];
    }
    if(Math.abs(twist)>0.01){
      const th=twist*DEG*((v[1]-bounds.min[1])/Math.max(1,bounds.size[1]));
      const c=Math.cos(th),s=Math.sin(th);
      const x=v[0]-bounds.center[0], z=v[2];
      v=[bounds.center[0]+x*c-z*s, v[1], x*s+z*c];
    }
    // 图钉（平滑权重混合，不撕裂）
    if(pinData.length){
      let sw=0, acc=[0,0,0];
      for(const p of pinData){
        const d=V.dist(v,p.base);
        const q=clamp(1-(d/p.radius)*(d/p.radius),0,1);
        const w=q*q;
        if(w<=0) continue;
        const rel=V.sub(v,p.base);
        const c=Math.cos(p.rot),s=Math.sin(p.rot);
        const rv=[(rel[0]*c-rel[1]*s)*p.scl,(rel[0]*s+rel[1]*c)*p.scl,rel[2]*p.scl];
        const tv=V.add(p.target,rv);
        acc=V.add(acc,V.mul(tv,w)); sw+=w;
      }
      if(sw>0){
        const blended=V.mul(acc,1/sw);
        const k=Math.min(1,sw);
        v=V.lerp(v,blended,k);
      }
    }
    // 空间场
    if(fieldLayers.length){
      const wp=M4.transformPoint(wm,v);
      let f=[0,0,0];
      for(const fl of fieldLayers) f=V.add(f,V.mul(fieldAt(ctx,fl.l,wp,t),fl.s));
      if(f[0]||f[1]||f[2]){
        const wp2=V.add(wp,f);
        v=M4.transformPoint(iw,wp2);
      }
    }
    out.pos.push(v[0],v[1],v[2]);
    out.nrm.push(mesh.nrm[i],mesh.nrm[i+1],mesh.nrm[i+2]);
  }
  out.idx=mesh.idx.slice();
  recomputeNormals(out);
  return out;
}

/* ---------- 几何图层完整管线 ---------- */
const geoCache=new Map();
function geoLayerMesh(ctx,layer,t){
  const key=layer.id+':'+t.toFixed(4);
  const sig=geoSignature(ctx,layer,t);
  const hit=geoCache.get(key);
  if(hit&&hit.sig===sig) return hit.mesh;
  let rings=[];
  const graph=FF.findGraph(ctx.project,layer.geo.graphId);
  if(graph&&FF.Nodes){
    const res=FF.Nodes.evaluate(ctx,graph,layer.geo.outputNode,t,layer);
    if(res){
      if(res.mesh){ rings=null; var preMesh=res.mesh; }
      else rings=res.rings||[];
    }
  }
  let mesh;
  if(rings===null&&preMesh) mesh=preMesh;
  else {
    const depth=Eval.prop(ctx,layer,'geo.depth',t)||1;
    const bevel=Eval.prop(ctx,layer,'geo.bevel',t)||0;
    mesh=extrude(rings,depth,bevel,2);
  }
  mesh=deformMesh(ctx,layer,mesh,t);
  geoCache.set(key,{sig,mesh});
  if(geoCache.size>600){ const first=geoCache.keys().next().value; geoCache.delete(first); }
  return mesh;
}
function geoSignature(ctx,layer,t){
  const parts=[layer.geo.graphId,layer.geo.outputNode,
    Eval.prop(ctx,layer,'geo.depth',t),Eval.prop(ctx,layer,'geo.bevel',t),
    Eval.prop(ctx,layer,'geo.bend',t),Eval.prop(ctx,layer,'geo.twist',t)];
  for(const p of layer.geo.pins||[]){ parts.push(JSON.stringify(p.base),JSON.stringify(Eval.prop(ctx,layer,'geo.pins.'+(layer.geo.pins.indexOf(p))+'.pos',t))); }
  for(const f of layer.geo.fields||[]){ const fl=FF.findLayer(ctx.comp,f.layerId);
    if(fl) parts.push(fl.id,JSON.stringify(Eval.worldMatrix(ctx,fl,t).m),Eval.prop(ctx,fl,'field.strength',t)); }
  const graph=FF.findGraph(ctx.project,layer.geo.graphId);
  if(graph) parts.push(JSON.stringify(graph.nodes.map(n=>({t:n.type,p:n.params,i:n.inputs}))));
  // 源文字内容
  if(graph) for(const n of graph.nodes){
    if(n.type==='textGlyph'&&n.params.textLayer){
      const src=FF.layerByName(ctx.comp,n.params.textLayer);
      if(src) parts.push(Eval.prop(ctx,src,'text.content',t));
    }
  }
  return parts.join('|');
}
function invalidateGeo(){ geoCache.clear(); }

/* ---------- 碰撞 ---------- */
function buildGrid(mesh,cellSize){
  cellSize=cellSize||60;
  const cells=new Map();
  const tris=[];
  for(let i=0;i<mesh.idx.length;i+=3){
    const a=mesh.idx[i]*3,b=mesh.idx[i+1]*3,c=mesh.idx[i+2]*3;
    const tri={a:[mesh.pos[a],mesh.pos[a+1],mesh.pos[a+2]],
      b:[mesh.pos[b],mesh.pos[b+1],mesh.pos[b+2]],
      c:[mesh.pos[c],mesh.pos[c+1],mesh.pos[c+2]], i:tris.length};
    tris.push(tri);
    const x0=Math.min(tri.a[0],tri.b[0],tri.c[0]), x1=Math.max(tri.a[0],tri.b[0],tri.c[0]);
    const y0=Math.min(tri.a[1],tri.b[1],tri.c[1]), y1=Math.max(tri.a[1],tri.b[1],tri.c[1]);
    const z0=Math.min(tri.a[2],tri.b[2],tri.c[2]), z1=Math.max(tri.a[2],tri.b[2],tri.c[2]);
    for(let x=Math.floor(x0/cellSize);x<=Math.floor(x1/cellSize);x++)
    for(let y=Math.floor(y0/cellSize);y<=Math.floor(y1/cellSize);y++)
    for(let z=Math.floor(z0/cellSize);z<=Math.floor(z1/cellSize);z++){
      const k=x+','+y+','+z;
      if(!cells.has(k)) cells.set(k,[]);
      cells.get(k).push(tri);
    }
  }
  return {cells,cellSize,tris};
}
function rayTri(p0,p1,tri){
  const d=V.sub(p1,p0);
  const e1=V.sub(tri.b,tri.a), e2=V.sub(tri.c,tri.a);
  const h=V.cross(d,e2); const a=V.dot(e1,h);
  if(Math.abs(a)<1e-10) return null;
  const f=1/a; const s=V.sub(p0,tri.a);
  const u=f*V.dot(s,h); if(u<-0.001||u>1.001) return null;
  const q=V.cross(s,e1); const v=f*V.dot(d,q);
  if(v<-0.001||u+v>1.001) return null;
  const t=f*V.dot(e2,q);
  if(t<0||t>1) return null;
  const n=V.norm(V.cross(e1,e2));
  return {t, point:V.add(p0,V.mul(d,t)), normal:n};
}
function collideSegment(grid,p0,p1,radius){
  if(!grid||!grid.tris.length) return null;
  const cs=grid.cellSize;
  const seen=new Set();
  let best=null;
  const steps=Math.max(1,Math.ceil(V.dist(p0,p1)/(cs*0.8)));
  for(let s=0;s<=steps;s++){
    const p=V.lerp(p0,p1,s/steps);
    const cx=Math.floor(p[0]/cs),cy=Math.floor(p[1]/cs),cz=Math.floor(p[2]/cs);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const cell=grid.cells.get((cx+dx)+','+(cy+dy)+','+(cz+dz));
      if(!cell) continue;
      for(const tri of cell){
        if(seen.has(tri.i)) continue; seen.add(tri.i);
        const hit=rayTri(p0,p1,tri);
        if(hit&&(!best||hit.t<best.t)) best=hit;
      }
    }
  }
  return best;
}
function surfaceSamples(mesh,count,rand){
  // 按面积加权采样表面点与法线
  const areas=[]; let total=0;
  for(let i=0;i<mesh.idx.length;i+=3){
    const a=mesh.idx[i]*3,b=mesh.idx[i+1]*3,c=mesh.idx[i+2]*3;
    const ux=mesh.pos[b]-mesh.pos[a],uy=mesh.pos[b+1]-mesh.pos[a+1],uz=mesh.pos[b+2]-mesh.pos[a+2];
    const vx=mesh.pos[c]-mesh.pos[a],vy=mesh.pos[c+1]-mesh.pos[a+1],vz=mesh.pos[c+2]-mesh.pos[a+2];
    const ar=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2;
    areas.push(ar); total+=ar;
  }
  const out=[];
  if(total<=0) return out;
  for(let k=0;k<count;k++){
    let r=rand()*total, ti=0;
    while(ti<areas.length-1&&r>areas[ti]){ r-=areas[ti]; ti++; }
    const a=mesh.idx[ti*3]*3,b=mesh.idx[ti*3+1]*3,c=mesh.idx[ti*3+2]*3;
    let u=rand(),v=rand(); if(u+v>1){u=1-u;v=1-v;}
    const p=[mesh.pos[a]+(mesh.pos[b]-mesh.pos[a])*u+(mesh.pos[c]-mesh.pos[a])*u,
      mesh.pos[a+1]+(mesh.pos[b+1]-mesh.pos[a+1])*u+(mesh.pos[c+1]-mesh.pos[a+1])*u,
      mesh.pos[a+2]+(mesh.pos[b+2]-mesh.pos[a+2])*u+(mesh.pos[c+2]-mesh.pos[a+2])*u];
    const n=[mesh.nrm[a],mesh.nrm[a+1],mesh.nrm[a+2]];
    out.push({p,n});
  }
  return out;
}

FF.Geo={shapeLayerGeo,textGeo,extrude,planeMesh,boxMesh,mergeMeshes,transformMesh,recomputeNormals,
  meshBounds,deformMesh,fieldAt,geoLayerMesh,invalidateGeo,buildGrid,collideSegment,surfaceSamples,groupRings};
})();
