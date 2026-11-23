/* ============ 锻火 FORGE · content.js : 图层内容构建 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const G=APP.geom;
const A=APP.anim;
const P=APP.project;
const CT=APP.content={};

/* ---------- 工具 ---------- */
function flat(contour){return G.flatten(contour);}
function ctxOf(layer,comp,t){return {comp,layer,time:t};}
function v2rot(p,deg,c){
  const a=deg*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
  const dx=p.x-c.x,dy=p.y-c.y;
  return {x:c.x+dx*ca-dy*sa,y:c.y+dx*sa+dy*ca};
}
function xformPts(pts,pos,scale,rot,anchor){
  const out=[];
  for(const p of pts){
    let x=(p.x-(anchor?anchor[0]:0))*(scale?scale[0]/100:1);
    let y=(p.y-(anchor?anchor[1]:0))*(scale?scale[1]/100:1);
    const r=v2rot({x,y},rot||0,{x:0,y:0});
    out.push({x:r.x+(pos?pos[0]:0),y:r.y+(pos?pos[1]:0)});
  }
  return out;
}

/* ---------- 路径形变 ---------- */
function resample(ring,n){
  if(ring.length<2)return ring.slice();
  const seg=[];let L=0;
  for(let i=1;i<ring.length;i++){const d=Math.hypot(ring[i].x-ring[i-1].x,ring[i].y-ring[i-1].y);seg.push(d);L+=d;}
  if(L<=0){const o=[];for(let i=0;i<n;i++)o.push({x:ring[0].x,y:ring[0].y});return o;}
  const out=[];let acc=0,si=0;
  for(let i=0;i<n;i++){
    const target=L*i/n;
    while(si<seg.length-1&&acc+seg[si]<target){acc+=seg[si];si++;}
    const k=seg[si]>0?(target-acc)/seg[si]:0;
    const a=ring[si],b=ring[si+1]||ring[0];
    out.push({x:C.lerp(a.x,b.x,k),y:C.lerp(a.y,b.y,k)});
  }
  return out;
}
CT.morphPaths=function(pA,pB,u){
  if(!pA||!pB)return pB||pA;
  const out={contours:[]};
  const n=Math.max(pA.contours.length,pB.contours.length);
  for(let i=0;i<n;i++){
    const ca=pA.contours[Math.min(i,pA.contours.length-1)];
    const cb=pB.contours[Math.min(i,pB.contours.length-1)];
    if(!ca||!cb){out.contours.push(ca||cb);continue;}
    const N=Math.max(24,Math.max(ca.pts.length,cb.pts.length));
    const fa=resample(ca.pts.map(p=>({x:p.x,y:p.y})),N);
    const fb=resample(cb.pts.map(p=>({x:p.x,y:p.y})),N);
    const pts=[];
    for(let j=0;j<N;j++)pts.push({x:C.lerp(fa[j].x,fb[j].x,u),y:C.lerp(fa[j].y,fb[j].y,u)});
    out.contours.push({closed:ca.closed&&cb.closed,pts});
  }
  return out;
};
/* 路径项求值(支持关键帧形变) */
CT.pathAt=function(item,layer,comp,t){
  if(item.anim&&item.keys&&item.keys.length){
    if(item.keys.length===1)return item.keys[0].v;
    let i0=0;
    for(let i=0;i<item.keys.length-1;i++)if(t>=item.keys[i].t&&t<=item.keys[i+1].t){i0=i;break;}
    const k0=item.keys[i0],k1=item.keys[Math.min(i0+1,item.keys.length-1)];
    const span=k1.t-k0.t;
    const u=span>0?C.clamp((t-k0.t)/span,0,1):1;
    return CT.morphPaths(k0.v,k1.v,u);
  }
  return item.path;
};

/* ---------- 修剪路径 ---------- */
CT.trimContour=function(pts,closed,start,end,offset){
  const n=pts.length;
  if(n<2)return pts;
  const m=closed?n:n-1;
  const seg=[];let L=0;
  for(let i=0;i<m;i++){const d=Math.hypot(pts[(i+1)%n].x-pts[i].x,pts[(i+1)%n].y-pts[i].y);seg.push(d);L+=d;}
  if(L<=0)return pts;
  const norm=x=>((x%100)+100)%100;
  let s=norm(start+offset), e=norm(end+offset);
  if(Math.abs(s-e)<1e-6)return [];
  const out=[];
  const push=(a,b)=>{ // 取弧长区间 [a,b) (百分比)
    let acc=0;
    for(let i=0;i<m;i++){
      const a0=acc/L*100,a1=(acc+seg[i])/L*100;
      const lo=Math.min(a,b),hi=Math.max(a,b);
      if(a1>lo&&a0<hi){
        const k0=C.clamp((lo-a0)/((a1-a0)||1),0,1),k1=C.clamp((hi-a0)/((a1-a0)||1),0,1);
        const p0={x:C.lerp(pts[i].x,pts[(i+1)%n].x,k0),y:C.lerp(pts[i].y,pts[(i+1)%n].y,k0)};
        const p1={x:C.lerp(pts[i].x,pts[(i+1)%n].x,k1),y:C.lerp(pts[i].y,pts[(i+1)%n].y,k1)};
        if(!out.length||Math.hypot(out[out.length-1].x-p0.x,out[out.length-1].y-p0.y)>1e-6)out.push(p0);
        out.push(p1);
      }
      acc+=seg[i];
    }
  };
  if(s<e)push(s,e);
  else{push(s,100);push(0,e);}
  return out;
};

/* ---------- 形状组 ---------- */
CT.buildGroup=function(group,layer,comp,t){
  const ops=[];
  let paths=[];      // [{contours:[pts], closed}]
  let transform={pos:[0,0],scale:[100,100],rot:0,anchor:[0,0],opacity:100};
  const ctx=ctxOf(layer,comp,t);
  if(!group.enabled)return ops;
  const gt=group.transform;
  const gtPos=A.eval(gt.pos,t,ctx),gtScale=A.eval(gt.scale,t,ctx),
        gtRot=A.evalNum(gt.rot,t,ctx),gtAnchor=A.eval(gt.anchor,t,ctx),gtOp=A.evalNum(gt.opacity,t,ctx);
  for(const item of group.items){
    switch(item.type){
      case 'path':{
        const p=CT.pathAt(item,layer,comp,t);
        if(p&&p.contours)for(const c of p.contours){
          paths.push({pts:flat(c),closed:c.closed});
        }
        break;
      }
      case 'merge':{
        if(paths.length<2)break;
        const all=[];for(const p of paths)for(const c of p.pts)all.push(c);
        if(item.mode==='union'){
          let acc=paths[0].pts;
          for(let i=1;i<paths.length;i++)acc=G.unionContours(acc,paths[i].pts);
          paths=[{pts:acc,closed:true}];
        }else if(item.mode==='subtract'){
          let acc=paths[0].pts;
          for(let i=1;i<paths.length;i++)acc=G.subtractContours(acc,paths[i].pts);
          paths=[{pts:acc,closed:true}];
        }else if(item.mode==='intersect'){
          let acc=paths[0].pts;
          for(let i=1;i<paths.length;i++)acc=G.intersectContours(acc,paths[i].pts);
          paths=[{pts:acc,closed:true}];
        }
        break;
      }
      case 'trim':{
        const s=A.evalNum(item.start,t,ctx),e=A.evalNum(item.end,t,ctx),o=A.evalNum(item.offset,t,ctx);
        paths=paths.map(p=>({pts:CT.trimContour(p.pts,p.closed,s,e,o),closed:false}))
                   .filter(p=>p.pts.length>1);
        break;
      }
      case 'repeater':{
        const copies=Math.max(1,Math.round(A.evalNum(item.copies,t,ctx)));
        const pos=A.eval(item.pos,t,ctx),scale=A.eval(item.scale,t,ctx),
              rot=A.evalNum(item.rot,t,ctx),anchor=A.eval(item.anchor,t,ctx),op=A.evalNum(item.opacity,t,ctx);
        const out=[];
        for(let i=0;i<copies;i++){
          for(const p of paths){
            const pts=xformPts(p.pts,
              [pos[0]*i,pos[1]*i],
              [Math.pow(scale[0]/100,i),Math.pow(scale[1]/100,i)],
              rot*i,anchor);
            out.push({pts,closed:p.closed});
          }
        }
        paths=out;
        break;
      }
      case 'fill':{
        if(!paths.length)break;
        const col=hexRgb(item.color),op=A.evalNum(item.opacity,t,ctx)/100;
        ops.push({kind:'fill',paths:paths.map(p=>({pts:p.pts.slice(),closed:p.closed})),
          color:col,opacity:op*(gtOp/100),rule:item.rule||'nonzero',
          transform:snapT(gtPos,gtScale,gtRot,gtAnchor)});
        break;
      }
      case 'stroke':{
        if(!paths.length)break;
        const w=A.evalNum(item.width,t,ctx);
        const col=hexRgb(item.color),op=A.evalNum(item.opacity,t,ctx)/100;
        // 生成描边轮廓
        const rings=[];
        for(const p of paths){
          const contour={closed:p.closed,pts:p.pts.map(pt=>({x:pt.x,y:pt.y}))};
          const ring=G.strokeContours(contour,w,item.cap||'round',item.join||'round',p.closed);
          if(ring.length>2)rings.push(ring);
        }
        if(rings.length)ops.push({kind:'stroke',rings,color:col,opacity:op*(gtOp/100),
          transform:snapT(gtPos,gtScale,gtRot,gtAnchor)});
        break;
      }
    }
  }
  return ops;
};
function snapT(pos,scale,rot,anchor){return {pos,scale,rot,anchor};}
function hexRgb(h){
  if(Array.isArray(h))return h;
  const c=C.hex2rgb(h||'#ffffff');return [c.r,c.g,c.b];
}

/* ---------- 文字 ---------- */
CT.textLines=function(layer){
  const txt=layer.text;
  const src=(txt.src||'').replace(/\r/g,'');
  return src.split('\n');
};
CT.textLayout=function(layer,comp,t){
  const txt=layer.text;
  const size=txt.size||100;
  const scale=size/1000;
  const lines=CT.textLines(layer);
  const leading=(txt.leading!==undefined?txt.leading:size*1.2)/1000*size;
  const tracking=(txt.tracking||0)/1000*size;
  const chars=[];
  const lineInfo=[];
  let maxW=0;
  for(let li=0;li<lines.length;li++){
    const line=lines[li];
    let w=0;
    for(const ch of line){
      const adv=(APP.font.advance(ch)||1000)*scale;
      w+=adv+tracking;
    }
    if(line.length)w-=tracking;
    lineInfo.push({w,chars:[]});
    maxW=Math.max(maxW,w);
  }
  for(let li=0;li<lines.length;li++){
    const line=lines[li];
    const li_w=lineInfo[li].w;
    let x=(txt.align==='center'?-maxW/2+(maxW-li_w)/2:txt.align==='right'?maxW/2-li_w:-maxW/2);
    const y=(li-lines.length/2+0.5)*leading;
    for(let ci=0;ci<line.length;ci++){
      const ch=line[ci];
      const adv=(APP.font.advance(ch)||1000)*scale;
      const g=APP.font.glyph(ch);
      const b=g.bounds;
      const ox=-(b.x+b.w/2), oy=-(b.y+b.h/2);
      chars.push({ch,ci,li,x,y,w:adv,h:b.h*scale,
        cx:x+adv/2, cy:y, adv,
        bounds:{x:x+(b.x+ox)*scale,y:y+(b.y+oy)*scale,w:b.w*scale,h:b.h*scale},
        contours:g.contours.map(c=>c.map(p=>({x:x+(p.x+ox)*scale,y:y+(p.y+oy)*scale}))),
        tris:g.tris?g.tris:null});
      lineInfo[li].chars.push(chars[chars.length-1]);
      x+=adv+tracking;
    }
  }
  return {chars,lines:lineInfo,size,scale,width:maxW,
    height:lines.length*leading,leading};
};
/* 文字动画器 */
CT.textAnimators=function(layer,comp,t,layout){
  const txt=layer.text;
  const out=[];
  const ctx=ctxOf(layer,comp,t);
  const n=layout.chars.length;
  const words=[];let cur=[];
  for(let i=0;i<n;i++){
    const c=layout.chars[i];
    if(c.ch===' '||c.ch==='，'||c.ch==='。'||c.ch==='、'){if(cur.length){words.push(cur);cur=[];}}
    else cur.push(i);
  }
  if(cur.length)words.push(cur);
  for(const an of (txt.animators||[])){
    if(!an.enabled)continue;
    const sel=new Array(n).fill(0);
    for(const r of (an.ranges||[])){
      const unit=r.unit||'chars';
      let total,idxOf;
      if(unit==='lines'){total=layout.lines.length;idxOf=i=>layout.chars[i].li;}
      else if(unit==='words'){total=words.length;idxOf=i=>{for(let w=0;w<words.length;w++)if(words[w].includes(i))return w;return 0;};}
      else {total=n;idxOf=i=>i;}
      const start=r.start||0,end=r.end!==undefined?r.end:100,off=r.offset||0,soft=r.soft||0;
      for(let i=0;i<n;i++){
        const pos=(idxOf(i)+off);
        const s=(pos-start)/Math.max(0.0001,(end-start));
        let v=1;
        if(soft>0){
          v=C.clamp((s*(end-start+soft*2)-(soft))/1,0,1);
        }else v=s>=0&&s<=1?1:0;
        sel[i]=Math.max(sel[i],v);
      }
    }
    out.push({sel,props:an.props,animator:an});
  }
  return out;
};
/* 文字 -> 绘制 ops */
CT.buildText=function(layer,comp,t){
  const layout=CT.textLayout(layer,comp,t);
  const ctx=ctxOf(layer,comp,t);
  const anims=CT.textAnimators(layer,comp,t,layout);
  const ops=[];
  const baseOp=A.evalNum(layer.t.opacity,t,ctx)/100;
  for(let i=0;i<layout.chars.length;i++){
    const c=layout.chars[i];
    if(!c.contours.length)continue;
    let op=baseOp,dx=0,dy=0,rot=0,sx=1,sy=1;
    for(const an of anims){
      const s=an.sel[i];
      if(!s)continue;
      const p=an.props;
      if(p.pos){dx+=p.pos[0]*s;dy+=p.pos[1]*s;}
      if(p.rot)rot+=p.rot*s;
      if(p.scale){sx*=1+(p.scale[0]/100-1)*s;sy*=1+(p.scale[1]/100-1)*s;}
      if(p.opacity!==undefined)op*=(p.opacity/100)*s+(1-s)*1;
    }
    // 字符绕自身中心
    const cx=c.cx,cy=c.cy;
    const contours=c.contours.map(ring=>xformPts(ring,[dx+cx,dy+cy],[sx*100,sy*100],rot,[cx,cy]));
    ops.push({kind:'fill',paths:contours.map(pts=>({pts,closed:true})),
      color:layer.text.color||[1,1,1],opacity:op,rule:'nonzero',
      transform:{pos:[0,0],scale:[100,100],rot:0,anchor:[0,0]},
      charIndex:i,char:c.ch});
  }
  return {ops,layout,anims};
};

/* ---------- 蒙版 ---------- */
CT.maskShape=function(m,layer,comp,t){
  const ctx=ctxOf(layer,comp,t);
  const w=A.evalNum(m.props.w,t,ctx),h=A.evalNum(m.props.h,t,ctx);
  const pos=A.eval(m.props.pos,t,ctx),rot=A.evalNum(m.props.rot,t,ctx);
  const pts=[];
  if(m.shape==='rect'){
    const r=Math.min(w,h)/2*Math.min(1,A.evalNum(m.props.roundness,t,ctx)/100)*0.5;
    const seg=8;
    const corner=(cx,cy,a0)=>{
      for(let i=0;i<=seg;i++){const a=a0+i/seg*Math.PI/2;pts.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});}
    };
    corner(w/2-r,-h/2+r,-Math.PI/2);corner(w/2-r,h/2-r,0);corner(-w/2+r,h/2-r,Math.PI/2);corner(-w/2+r,-h/2+r,Math.PI);
  }else if(m.shape==='ellipse'){
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2;pts.push({x:Math.cos(a)*w/2,y:Math.sin(a)*h/2});}
  }else{
    const p=CT.pathAt(m.pathItem,layer,comp,t);
    if(p&&p.contours)for(const c of p.contours)for(const q of G.flatten(c))pts.push({x:q.x,y:q.y});
  }
  const tr=xformPts(pts,pos,[100,100],rot,[0,0]);
  return {pts:tr,inverted:!!m.inverted,feather:A.evalNum(m.props.feather,t,ctx),
    opacity:A.evalNum(m.props.opacity,t,ctx)/100,expand:A.evalNum(m.props.expand,t,ctx),
    mode:m.mode||'add'};
};
CT.buildMasks=function(layer,comp,t){
  return (layer.masks||[]).filter(m=>m.enabled!==false).map(m=>CT.maskShape(m,layer,comp,t));
};

/* ---------- 效果 ---------- */
CT.buildEffects=function(layer,comp,t){
  const ctx=ctxOf(layer,comp,t);
  return (layer.effects||[]).filter(e=>e.enabled!==false).map(e=>{
    const props={};
    for(const k in e.props)props[k]=A.eval(e.props[k],t,ctx);
    return {type:e.type,name:e.name,props};
  });
};

/* ---------- 三维几何 ---------- */
CT.geoContours=function(layer,comp,t){
  const ctx=ctxOf(layer,comp,t);
  if(layer.type==='geo3d'){
    const g=layer.geo3d;
    if(g.source==='text'||layer.text){
      const layout=CT.textLayout(layer,comp,t);
      let all=[];
      for(const c of layout.chars)for(const ring of c.contours)all.push(ring);
      return all;
    }
    if(g.source==='shape'){
      const ops=[];
      for(const grp of (layer.shape?layer.shape.groups:[])){
        for(const op of CT.buildGroup(grp,layer,comp,t))ops.push(op);
      }
      let all=[];
      for(const op of ops){
        if(op.kind==='fill')for(const p of op.paths)for(const ring of p.pts)all.push(ring);
        if(op.kind==='stroke')for(const ring of op.rings)all.push(ring);
      }
      return all;
    }
    if(g.source==='node'&&APP.sim){
      const r=APP.sim.evalNodeGeometry(layer,comp,t);
      if(r)return r.contours;
    }
    return [];
  }
  if(layer.type==='shape'){
    let all=[];
    for(const grp of (layer.shape?layer.shape.groups:[])){
      for(const op of CT.buildGroup(grp,layer,comp,t)){
        if(op.kind==='fill')for(const p of op.paths)for(const ring of p.pts)all.push(ring);
        if(op.kind==='stroke')for(const ring of op.rings)all.push(ring);
      }
    }
    return all;
  }
  if(layer.type==='text'){
    const layout=CT.textLayout(layer,comp,t);
    let all=[];
    for(const c of layout.chars)for(const ring of c.contours)all.push(ring);
    return all;
  }
  return [];
};
CT.buildGeo3D=function(layer,comp,t){
  const ctx=ctxOf(layer,comp,t);
  const g=layer.geo3d||{};
  const contours=CT.geoContours(layer,comp,t);
  if(!contours.length)return null;
  const depth=A.evalNum(g.depth,t,ctx);
  const bevel=A.evalNum(g.bevel,t,ctx);
  const mesh=G.extrude(contours,{depth,bevel:Math.min(bevel,depth*0.4),bevelSeg:1});
  // 材质
  const mat=g.material||{};
  return {mesh,material:{
    base:A.eval(mat.base||{v:[0.85,0.62,0.32]},t,ctx),
    metal:A.evalNum(mat.metal!==undefined?mat.metal:{v:0.9},t,ctx),
    rough:A.evalNum(mat.rough!==undefined?mat.rough:{v:0.35},t,ctx),
    emissive:A.eval(mat.emissive||{v:[0,0,0]},t,ctx),
    emissiveI:A.evalNum(mat.emissiveI!==undefined?mat.emissiveI:{v:0},t,ctx),
    opacity:A.evalNum(mat.opacity!==undefined?mat.opacity:{v:1},t,ctx)
  },contours};
};

/* ---------- 图层统一构建 ---------- */
CT.buildLayer=function(layer,comp,t){
  const ctx=ctxOf(layer,comp,t);
  const out={id:layer.id,type:layer.type,ops:[],masks:[],effects:[],mesh:null,material:null,particle:null,audio:null};
  if(layer.type==='shape'){
    for(const grp of (layer.shape?layer.shape.groups:[])){
      for(const op of CT.buildGroup(grp,layer,comp,t))out.ops.push(op);
    }
  }else if(layer.type==='text'){
    const r=CT.buildText(layer,comp,t);
    out.ops=r.ops;out.layout=r.layout;
  }else if(layer.type==='geo3d'){
    const g=CT.buildGeo3D(layer,comp,t);
    if(g){out.mesh=g.mesh;out.material=g.material;out.contours=g.contours;}
  }else if(layer.type==='null'||layer.type==='adjust'||layer.type==='camera'||layer.type==='light'){
    // 无内容
  }
  out.masks=CT.buildMasks(layer,comp,t);
  out.effects=CT.buildEffects(layer,comp,t);
  out.opacity=A.evalNum(layer.t.opacity,t,ctx)/100;
  return out;
};

/* ---------- 形状路径工具(UI 用) ---------- */
CT.newRectPath=(w,h)=>P.rectPath?null:null;
CT.rectPath=function(w,h){
  const hw=w/2,hh=h/2;
  return {contours:[{closed:true,pts:[{x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}]}]};
};
CT.ellipsePath=function(rx,ry){
  const pts=[];
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;pts.push({x:Math.cos(a)*rx,y:Math.sin(a)*ry});}
  return {contours:[{closed:true,pts}]};
};
CT.starPath=function(R,r,n){
  const pts=[];
  for(let i=0;i<n*2;i++){const a=i/(n*2)*Math.PI*2-Math.PI/2;const rad=i%2?r:R;
    pts.push({x:Math.cos(a)*rad,y:Math.sin(a)*rad});}
  return {contours:[{closed:true,pts}]};
};
CT.polyPath=function(R,n){
  const pts=[];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2-Math.PI/2;pts.push({x:Math.cos(a)*R,y:Math.sin(a)*R});}
  return {contours:[{closed:true,pts}]};
};
CT.openPath=function(pts){
  return {contours:[{closed:false,pts:pts.map(p=>({x:p[0],y:p[1]}))}]};
};

APP.content=CT;
})();
