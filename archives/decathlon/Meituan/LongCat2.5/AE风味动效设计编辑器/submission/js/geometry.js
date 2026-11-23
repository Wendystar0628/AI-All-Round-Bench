/* geometry.js — 形状、布尔、文字轮廓、挤出网格、场、图钉、BVH */
(function(){
'use strict';
const G = {};
window.Geo = G;

/* ==================== 轮廓工具 ==================== */
G.normalizeContours=function(contours){
  if(!contours||!contours.length) return [];
  const arr=contours.map(c=>({pts:c.pts.map(p=>[p[0],p[1]]),closed:c.closed!==false,hole:false,_area:U.polyArea(c.pts)}));
  arr.sort((a,b)=>Math.abs(b._area)-Math.abs(a._area));
  for(let i=0;i<arr.length;i++){
    let depth=0;
    const p=arr[i].pts[0];
    for(let j=0;j<arr.length;j++){
      if(i===j) continue;
      if(Math.abs(arr[j]._area)<=Math.abs(arr[i]._area)) continue;
      if(U.pointInPoly(p,arr[j].pts)) depth++;
    }
    arr[i].hole = (depth%2===1);
    // y 向下：外轮廓面积>0（顺时针），孔洞面积<0
    const wantPositive = !arr[i].hole;
    if(wantPositive && arr[i]._area<0) arr[i].pts.reverse();
    if(!wantPositive && arr[i]._area>0) arr[i].pts.reverse();
    delete arr[i]._area;
  }
  return arr;
};
G.triangulateTris=function(contours){
  const flat=U.triangulate(contours);
  const tris=[];
  for(let i=0;i+2<flat.length;i+=3) tris.push([flat[i],flat[i+1],flat[i+2]]);
  return tris;
};
G.trianglesToContours=function(tris){
  const key=(p,q)=>{
    const a=`${Math.round(p[0]*1e4)},${Math.round(p[1]*1e4)}`;
    const b=`${Math.round(q[0]*1e4)},${Math.round(q[1]*1e4)}`;
    return a<b? a+'|'+b : b+'|'+a;
  };
  const edges=new Map();
  const addEdge=(a,b)=>{
    const k=key(a,b);
    const dir=`${Math.round(a[0]*1e4)},${Math.round(a[1]*1e4)}>${Math.round(b[0]*1e4)},${Math.round(b[1]*1e4)}`;
    if(!edges.has(k)) edges.set(k,{a,b,dirs:[]});
    const e=edges.get(k);
    const rev=`${Math.round(b[0]*1e4)},${Math.round(b[1]*1e4)}>${Math.round(a[0]*1e4)},${Math.round(a[1]*1e4)}`;
    if(e.dirs.indexOf(rev)>=0){ e.dirs.splice(e.dirs.indexOf(rev),1); if(!e.dirs.length) edges.delete(k); }
    else { e.dirs.push(dir); }
  };
  for(const t of tris){
    for(let i=0;i<3;i++) addEdge(t[i],t[(i+1)%3]);
  }
  // 链接剩余边
  const ptKey=p=>`${Math.round(p[0]*1e4)},${Math.round(p[1]*1e4)}`;
  const adj=new Map();
  const addAdj=(p,q)=>{
    const k=ptKey(p);
    if(!adj.has(k)) adj.set(k,{p,q:[]});
    adj.get(k).q.push(q);
  };
  for(const e of edges.values()){ addAdj(e.a,e.b); }
  const contours=[];
  const visited=new Set();
  for(const [k,node] of adj){
    if(visited.has(k)) continue;
    // 从该点出发找环
    let start=node.p, cur=node.p;
    const loop=[cur];
    let prevKey=null;
    while(true){
      visited.add(ptKey(cur));
      const rec=adj.get(ptKey(cur));
      if(!rec) break;
      let next=null;
      for(const q of rec.q){
        const qk=ptKey(q);
        if(qk===prevKey && rec.q.length>1) continue;
        next=q; break;
      }
      if(!next) break;
      prevKey=ptKey(cur);
      cur=next;
      if(ptKey(cur)===ptKey(start)) break;
      loop.push(cur);
      if(loop.length>10000) break;
    }
    if(loop.length>2) contours.push({pts:loop.map(p=>[p[0],p[1]]),closed:true,hole:false});
  }
  return G.normalizeContours(contours);
};
G.pointInContours=function(p,contours){
  let inside=false;
  for(const c of contours){ if(U.pointInPoly(p,c.pts)) inside=!inside; }
  return inside;
};
/* 三角形细分（用于布尔分类） */
function subdivideTri(t,depth){
  if(depth<=0) return [t];
  const [a,b,c]=t;
  const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const bc=[(b[0]+c[0])/2,(b[1]+c[1])/2];
  const ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];
  const out=[];
  for(const tri of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]]){
    out.push(...subdivideTri(tri,depth-1));
  }
  return out;
}
G.classifyTris=function(tris,other,insideMode,depth=2){
  const out=[];
  const test=(tri)=>{
    const cx=(tri[0][0]+tri[1][0]+tri[2][0])/3, cy=(tri[0][1]+tri[1][1]+tri[2][1])/3;
    const inn=G.pointInContours([cx,cy],other);
    const want = insideMode? inn : !inn;
    if(want) out.push(tri);
  };
  for(const t of tris){
    const ins=t.map(p=>G.pointInContours(p,other));
    const allIn=ins.every(x=>x), allOut=ins.every(x=>!x);
    if(allIn||allOut){ test(t); }
    else{
      for(const st of subdivideTri(t,depth)) test(st);
    }
  }
  return out;
};
G.boolean=function(contoursA,contoursB,op){
  const trisA=G.triangulateTris(contoursA);
  const trisB=G.triangulateTris(contoursB);
  let kept=[];
  if(op==='union'){ kept=G.classifyTris(trisA,contoursB,false).concat(G.classifyTris(trisB,contoursA,false)); }
  else if(op==='subtract'){ kept=G.classifyTris(trisA,contoursB,false); }
  else if(op==='intersect'){ kept=G.classifyTris(trisA,contoursB,true); }
  else if(op==='add'){ kept=trisA.concat(trisB); }
  return {tris:kept, contours:G.trianglesToContours(kept)};
};

/* ==================== 形状求值 ==================== */
G.shapeObject=function(layer,t,comp){ return Model.evalObj(layer,'shape',t,comp); };
G.shapeContours=function(layer,t,comp,opts={}){
  const shape=G.shapeObject(layer,t,comp);
  const paths=shape.paths||[];
  if(!paths.length) return {contours:[],tris:[]};
  // 1. 展开路径
  const flats=paths.map(pd=>({op:pd.op||'add', pts:U.flattenPathData(pd, opts.seg||20)}));
  // 2. 布尔折叠
  let acc={contours:[{pts:flats[0].pts,closed:flats[0].closed!==false,hole:false}],tris:[]};
  if(flats.length>1){
    let cur=acc.contours;
    for(let i=1;i<flats.length;i++){
      const B=[{pts:flats[i].pts,closed:flats[i].closed!==false,hole:false}];
      const r=G.boolean(cur,B,flats[i].op==='add'?'union':flats[i].op);
      cur=r.contours;
    }
    acc={contours:cur,tris:[]};
  }
  let contours=acc.contours;
  if(!contours.length) return {contours:[],tris:[]};
  contours=G.normalizeContours(contours);
  // 3. 修剪路径
  if(shape.trim && shape.trim.enabled){
    const trim=shape.trim;
    const off=((trim.offset||0)%360+360)%360;
    const a=Math.min(trim.start,trim.end), b=Math.max(trim.start,trim.end);
    const s=((a+off)%360)/360, e=((b+off)%360)/360;
    contours=contours.map(c=>trimContour(c,s,e)).filter(c=>c.pts.length>1);
  }
  // 4. 重复器
  if(shape.repeater && shape.repeater.enabled && shape.repeater.count>1){
    const rep=shape.repeater;
    const out=[];
    for(let i=0;i<rep.count;i++){
      const f=i/(rep.count-1||1);
      const dx=rep.pos[0]*i, dy=rep.pos[1]*i, dz=(rep.pos[2]||0)*i;
      const sc=1+ (rep.scale[0]/100-1)*f;
      const sc2=1+ (rep.scale[1]/100-1)*f;
      const rot=rep.rot*i;
      const m=U.m4mul(U.m4trans(dx,dy,dz),U.m4mul(U.m4rotZ(rot*Math.PI/180),U.m4scale(sc,sc2,1)));
      for(const c of contours){
        out.push({pts:c.pts.map(p=>{
          const q=U.m4mulV(m,[p[0],p[1],0,1]); return [q[0],q[1]];
        }),closed:c.closed,hole:c.hole});
      }
    }
    contours=out;
  }
  const tris=G.triangulateTris(contours);
  return {contours,tris};
};
function trimContour(c,s,e){
  const pts=c.pts;
  const per=U.polyPerimeter(pts)* (c.closed?1:0) || U.polyLength(pts);
  if(per<=0) return {pts:[],closed:c.closed};
  const total=U.polyPerimeter(pts);
  const d0=s*total, d1=e*total;
  if(d1<=d0) return {pts:[],closed:c.closed};
  const out=[];
  let acc=0;
  const n=pts.length;
  const count=c.closed?n:n-1;
  for(let i=0;i<count;i++){
    const a=pts[i], b=pts[(i+1)%n];
    const l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const segStart=acc, segEnd=acc+l;
    acc=segEnd;
    const lo=Math.max(segStart,d0), hi=Math.min(segEnd,d1);
    if(hi<=lo) continue;
    const t0=(lo-segStart)/l, t1=(hi-segStart)/l;
    const p0=[a[0]+(b[0]-a[0])*t0, a[1]+(b[1]-a[1])*t0];
    const p1=[a[0]+(b[0]-a[0])*t1, a[1]+(b[1]-a[1])*t1];
    if(out.length===0) out.push(p0);
    else {
      const last=out[out.length-1];
      if(Math.hypot(last[0]-p0[0],last[1]-p0[1])>1e-6) out.push(p0);
    }
    out.push(p1);
  }
  return {pts:out,closed:false,hole:false};
}
G.trimmedLength=function(c,s,e){
  const total=U.polyPerimeter(c.pts);
  return Math.abs(e-s)/360*total;
};

/* ==================== 路径形变 ==================== */
G.morphContours=function(A,B,t){
  if(!A.length||!B.length) return t<0.5?A:B;
  const out=[];
  const n=Math.max(A.length,B.length);
  for(let i=0;i<n;i++){
    const a=A[Math.min(i,A.length-1)], b=B[Math.min(i,B.length-1)];
    const N=Math.max(8,Math.min(a.pts.length,b.pts.length,64));
    const pa=U.resample(a.pts,N,a.closed!==false);
    const pb=U.resample(b.pts,N,b.closed!==false);
    out.push({pts:pa.map((p,k)=>[U.lerp(p[0],pb[k][0],t),U.lerp(p[1],pb[k][1],t)]),closed:a.closed,hole:a.hole});
  }
  return out;
};

/* ==================== 偏移（倒角/蒙版扩展） ==================== */
G.offsetContour=function(pts,dist){
  const n=pts.length;
  if(n<3) return pts.map(p=>p.slice());
  const area=U.polyArea(pts);
  const sign=area>0?1:-1;
  const out=[];
  for(let i=0;i<n;i++){
    const prev=pts[(i-1+n)%n], cur=pts[i], next=pts[(i+1)%n];
    const d1=[cur[0]-prev[0],cur[1]-prev[1]], d2=[next[0]-cur[0],next[1]-cur[1]];
    const l1=Math.hypot(d1[0],d1[1])||1, l2=Math.hypot(d2[0],d2[1])||1;
    const n1=[d1[1]/l1*sign, -d1[0]/l1*sign];
    const n2=[d2[1]/l2*sign, -d2[0]/l2*sign];
    let nx=n1[0]+n2[0], ny=n1[1]+n2[1];
    const nl=Math.hypot(nx,ny);
    if(nl<1e-6){ nx=n2[0]; ny=n2[1]; }
    else { nx/=nl; ny/=nl; }
    const cos=Math.max(0.3, nx*n2[0]+ny*n2[1]);
    const k=dist/cos;
    out.push([cur[0]-nx*k, cur[1]-ny*k]);
  }
  return out;
};

/* ==================== 文字轮廓 ==================== */
G._glyphCache=new Map();
G.fontAvailable=function(name){
  const c=document.createElement('canvas').getContext('2d');
  const test='美';

  c.font='100px "'+name+'"';
  const w1=c.measureText(test).width;
  c.font='100px monospace';
  const w2=c.measureText(test).width;
  c.font='100px "___nonexistent___"';
  const w3=c.measureText(test).width;
  return Math.abs(w1-w3)>0.5;
};
G.availableFonts=function(){
  const list=['Microsoft YaHei','微软雅黑','SimHei','黑体','SimSun','宋体','KaiTi','楷体','FangSong','仿宋','DengXian','等线','Microsoft JhengHei','PMingLiU','Arial','Georgia','Times New Roman','Impact'];
  const found=list.filter(f=>G.fontAvailable(f));
  return found.length?found:list;
};
G.glyphContours=function(ch,font,size){
  const key=ch+'|'+font+'|'+size;
  if(G._glyphCache.has(key)) return G._glyphCache.get(key);
  const px=Math.min(400,Math.max(64,Math.round(size*2)));
  const cv=document.createElement('canvas');
  const pad=Math.round(px*0.3);
  cv.width=px*2+pad*2; cv.height=px*2+pad*2;
  const ctx=cv.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#000';ctx.fillRect(0,0,cv.width,cv.height);
  ctx.fillStyle='#fff';
  ctx.font=px+'px "'+font+'"';
  ctx.textBaseline='alphabetic';
  ctx.fillText(ch,pad,pv.height/2+px*0.36);
  let contours=[];
  try{
    const img=ctx.getImageData(0,0,cv.width,cv.height).data;
    const mask=new Uint8Array(cv.width*cv.height);
    for(let i=0;i<mask.length;i++) mask[i]=img[i*4+3]>110?255:0;
    const traced=U.traceMaskContours(mask,cv.width,cv.height,128);
    contours=traced.map(c=>({
      pts:U.simplify(c.map(p=>[(p[0]-pad)/size,(p[1]-(cv.height/2+px*0.36))/size]),0.012),
      closed:true,hole:false
    }));
    contours=contours.filter(c=>c.pts.length>2);
    contours=G.normalizeContours(contours);
  }catch(e){ contours=[]; }
  const res={contours,advance:0};
  G._glyphCache.set(key,res);
  return res;
};
G.measureChar=function(ch,font,size){
  const c=document.createElement('canvas').getContext('2d');
  c.font=size+'px "'+font+'"';
  return c.measureText(ch).width;
};

/* 文字排版 + 动画器 */
G.textLayout=function(layer,t,comp){
  const txt=Model.evalObj(layer,'text',t,comp);
  const font=txt.font||'Microsoft YaHei';
  const size=txt.size||120;
  const lines=(txt.source||'').split('\n');
  const lineH=size*(txt.lineHeight||1.2);
  const tracking=txt.tracking||0;
  const glyphs=[];
  let globalIdx=0;
  let wordIdx=0;
  let prevSpace=true;
  const lineMetrics=[];
  for(let li=0;li<lines.length;li++){
    const line=lines[li];
    let lineW=0;
    const chars=[];
    for(let ci=0;ci<line.length;ci++){
      const ch=line[ci];
      const g=G.glyphContours(ch,font,size);
      const adv=G.measureChar(ch,font,size)+tracking;
      chars.push({ch,contours:g.contours,adv,x:lineW,idx:globalIdx,line:li,lineIdx:ci});
      lineW+=adv;
      globalIdx++;
    }
    lineMetrics.push({w:lineW,chars});
    wordIdx=0;
  }
  // 对齐
  const maxW=Math.max(1,...lineMetrics.map(m=>m.w));
  const totalH=lineH*lines.length;
  const out=[];
  for(let li=0;li<lines.length;li++){
    const m=lineMetrics[li];
    let ox=0;
    if(txt.align==='center') ox=(maxW-m.w)/2;
    else if(txt.align==='right') ox=maxW-m.w;
    const oy=-lineH*0.5 + li*lineH;
    for(const c of m.chars){
      out.push({...c,x:c.x+ox,y:oy,contours:c.contours.map(cc=>({pts:cc.pts.map(p=>[p[0]+c.x+ox,p[1]+oy]),closed:cc.closed,hole:cc.hole}))});
    }
  }
  // 动画器
  const anims=txt.animators||[];
  if(anims.length){
    for(const g of out){
      let tx=0,ty=0,rot=0,scx=100,scy=100,op=100;
      for(const an of anims){
        const f=animatorFactor(an,g,out.length,lines.length);
        if(f<=0) continue;
        const p=an.props||{};
        const amt=(an.amount!==undefined?an.amount:100)/100;
        tx+=(p.position?p.position[0]:0)*f*amt;
        ty+=(p.position?p.position[1]:0)*f*amt;
        rot+=(p.rotation||0)*f*amt;
        scx*=Math.pow((p.scale?p.scale[0]:100)/100,f*amt);
        scy*=Math.pow((p.scale?p.scale[1]:100)/100,f*amt);
        op*=(1-(1-(p.opacity!==undefined?p.opacity:100)/100)*f*amt);
      }
      if(tx||ty||rot||scx!==100||scy!==100||op!==100){
        const rad=rot*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
        const cx=g.x, cy=g.y;
        for(const cc of g.contours){
          cc.pts=cc.pts.map(p=>{
            let x=p[0]-cx, y=p[1]-cy;
            x*=scx/100; y*=scy/100;
            const rx=x*cos-y*sin, ry=x*sin+y*cos;
            return [cx+rx+tx, cy+ry+ty];
          });
        }
        g.tx=tx;g.ty=ty;g.rot=rot;g.sc=[scx,scy];g.op=op;
      }
    }
  }
  return {glyphs:out,lines:lines.length,bbox:{w:maxW,h:totalH},size,lineH};
};
function animatorFactor(an,glyph,totalChars,totalLines){
  const sel=an.selector||{unit:'chars',start:0,end:100};
  const unit=sel.unit||'chars';
  let idx=0,total=1;
  if(unit==='chars'){ idx=glyph.idx; total=Math.max(1,totalChars); }
  else if(unit==='lines'){ idx=glyph.line; total=Math.max(1,totalLines); }
  else { idx=glyph.lineIdx; total=Math.max(1,(glyph.ch===' '?0:1)+1); }
  const s=(sel.start||0)/100*total, e=(sel.end||0)/100*total;
  if(e<=s) return idx>=s?1:0;
  const easeHigh=sel.easeHigh!==undefined?sel.easeHigh:50;
  const easeLow=sel.easeLow!==undefined?sel.easeLow:50;
  const d0=(idx-s)/(e-s), d1=(idx+1-s)/(e-s);
  const f0=smoothRange(d0,easeHigh/100,easeLow/100);
  const f1=smoothRange(d1,easeHigh/100,easeLow/100);
  return U.clamp((f0+f1)/2,0,1);
}
function smoothRange(t,hi,lo){
  t=U.clamp(t,0,1);
  if(t<0.5) return U.clamp((t/0.5)*(1-hi),0,1);
  return U.clamp((1-(t-0.5)/0.5)*(1-lo),0,1);
}

/* ==================== 挤出网格 ==================== */
G.extrude=function(contoursIn,opts={}){
  const depth=opts.depth||100;
  const bv=opts.bevelEnabled? (opts.bevelSize||0):0;
  const bseg=opts.bevelEnabled? (opts.bevelSegments||2):0;
  const h=depth/2;
  const pos=[],nor=[],uv=[],idx=[];
  const contours=G.normalizeContours(contoursIn);
  if(!contours.length) return {positions:new Float32Array(pos),normals:new Float32Array(nor),uvs:new Float32Array(uv),indices:new Uint16Array(idx)};
  // —— 顶/底盖 ——
  const capZ=h, capZ2=-h;
  const front=[],back=[];
  for(const c of contours){
    const tris=G.triangulateTris([c]);
    for(const tri of tris){
      const a=tri[0],b=tri[1],d=tri[2];
      const base=pos.length/3;
      pos.push(a[0],a[1],capZ, b[0],b[1],capZ, d[0],d[1],capZ);
      for(let k=0;k<3;k++) nor.push(0,0,1);
      uv.push(a[0],a[1],b[0],b[1],d[0],d[1]);
      idx.push(base,base+1,base+2);
    }
    // 底面（反向）
    for(const tri of tris){
      const a=tri[0],b=tri[1],d=tri[2];
      const base=pos.length/3;
      pos.push(a[0],a[1],capZ2, d[0],d[1],capZ2, b[0],b[1],capZ2);
      for(let k=0;k<3;k++) nor.push(0,0,-1);
      uv.push(a[0],a[1],d[0],d[1],b[0],b[1]);
      idx.push(base,base+1,base+2);
    }
  }
  // —— 侧壁（含倒角） ——
  const wallContours=[];
  for(const c of contours){
    if(bv>0 && bseg>0){
      // 主体外轮廓（z 从 -(h-bv) 到 (h-bv)）
      wallContours.push({pts:c.pts,z0:-(h-bv),z1:h-bv,n:[0,0,0]});
      // 倒角：从主体到 cap 的收缩环
      let prev=c.pts, prevZ=h-bv;
      for(let s=1;s<=bseg;s++){
        const f=s/bseg;
        const ang=f*Math.PI/2;
        const inset=G.offsetContour(c.pts, bv*Math.sin(ang)*(c.hole?-1:1));
        const z=h-bv+bv*Math.sin(ang);
        wallContours.push({pts:inset,z0:prevZ,z1:z,n:[0,0,0]});
        prev=inset; prevZ=z;
      }
    }else{
      wallContours.push({pts:c.pts,z0:-h,z1:h,n:[0,0,0]});
    }
  }
  for(const wc of wallContours){
    const pts=wc.pts, n=pts.length;
    if(n<2) continue;
    const ring=[];
    for(let i=0;i<n;i++){
      const prev=pts[(i-1+n)%n], cur=pts[i], next=pts[(i+1)%n];
      const d1=[cur[0]-prev[0],cur[1]-prev[1]], d2=[next[0]-cur[0],next[1]-cur[1]];
      const l1=Math.hypot(d1[0],d1[1])||1, l2=Math.hypot(d2[0],d2[1])||1;
      let nx=d1[1]/l1+d2[1]/l2, ny=-d1[0]/l1-d2[0]/l2;
      const nl=Math.hypot(nx,ny);
      if(nl<1e-6){nx=d2[1]/l2;ny=-d2[0]/l2;}
      else{nx/=nl;ny/=nl;}
      const area=U.polyArea(pts);
      const sgn=area>0?1:-1;
      // 侧面法线朝外
      const ox=nx*sgn, oy=ny*sgn;
      ring.push({p:cur, n:[ox,oy,0]});
    }
    for(let i=0;i<n;i++){
      const a=ring[i], b=ring[(i+1)%n];
      const base=pos.length/3;
      pos.push(a.p[0],a.p[1],wc.z0, b.p[0],b.p[1],wc.z0, b.p[0],b.p[1],wc.z1, a.p[0],a.p[1],wc.z0, b.p[0],b.p[1],wc.z1, a.p[0],a.p[1],wc.z1);
      const nl=Math.hypot(a.n[0],a.n[1])||1;
      const nx=a.n[0]/nl, ny=a.n[1]/nl;
      for(let k=0;k<6;k++) nor.push(nx,ny,0);
      uv.push(a.p[0],a.p[1], b.p[0],b.p[1], b.p[0],b.p[1], a.p[0],a.p[1], b.p[0],b.p[1], a.p[0],a.p[1]);
      idx.push(base,base+1,base+2, base+3,base+4,base+5);
    }
  }
  return {positions:new Float32Array(pos),normals:new Float32Array(nor),uvs:new Float32Array(uv),indices:(idx.length>65535?new Uint32Array(idx):new Uint16Array(idx))};
};

/* 基本体 */
G.primitive=function(type,opts={}){
  const s=opts.size||100;
  const pos=[],nor=[],idx=[];
  if(type==='plane'){
    pos.push(-s,-s,0, s,-s,0, s,s,0, -s,s,0);
    for(let i=0;i<4;i++) nor.push(0,0,1);
    idx.push(0,1,2,0,2,3);
  }else if(type==='box'){
    const h=s;
    const faces=[
      [[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h],[0,0,1]],
      [[h,-h,-h],[-h,-h,-h],[-h,h,-h],[h,h,-h],[0,0,-1]],
      [[h,-h,h],[h,-h,-h],[h,h,-h],[h,h,h],[1,0,0]],
      [[-h,-h,-h],[-h,-h,h],[-h,h,h],[-h,h,-h],[-1,0,0]],
      [[-h,h,h],[h,h,h],[h,h,-h],[-h,h,-h],[0,1,0]],
      [[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h],[0,-1,0]],
    ];
    for(const f of faces){
      const base=pos.length/3;
      for(let i=0;i<4;i++){ pos.push(...f[i]); nor.push(...f[4]); }
      idx.push(base,base+1,base+2, base,base+2,base+3);
    }
  }else if(type==='sphere'){
    const seg=24, rings=16;
    for(let r=0;r<=rings;r++){
      const th=r/rings*Math.PI;
      for(let i=0;i<=seg;i++){
        const ph=i/seg*U.TAU;
        const x=Math.sin(th)*Math.cos(ph)*s, y=Math.cos(th)*s, z=Math.sin(th)*Math.sin(ph)*s;
        pos.push(x,y,z); nor.push(x/s,y/s,z/s);
      }
    }
    for(let r=0;r<rings;r++)for(let i=0;i<seg;i++){
      const a=r*(seg+1)+i, b=a+seg+1;
      idx.push(a,b,a+1, a+1,b,b+1);
    }
  }else if(type==='cylinder'){
    const seg=24;
    for(let i=0;i<=seg;i++){
      const a=i/seg*U.TAU, x=Math.cos(a)*s, z=Math.sin(a)*s;
      pos.push(x,-s,z, x,s,z); nor.push(x/s,0,z/s, x/s,0,z/s);
    }
    for(let i=0;i<seg;i++){
      const a=i*2;
      idx.push(a,a+2,a+1, a+1,a+2,a+3);
    }
  }else if(type==='torus'){
    const R=s, r=s*0.35, seg=32, sides=16;
    for(let i=0;i<=seg;i++){
      const u=i/seg*U.TAU;
      for(let j=0;j<=sides;j++){
        const v=j/sides*U.TAU;
        const x=(R+r*Math.cos(v))*Math.cos(u), y=r*Math.sin(v), z=(R+r*Math.cos(v))*Math.sin(u);
        pos.push(x,y,z);
        nor.push(Math.cos(v)*Math.cos(u), Math.sin(v), Math.cos(v)*Math.sin(u));
      }
    }
    for(let i=0;i<seg;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j, b=a+sides+1;
      idx.push(a,b,a+1, a+1,b,b+1);
    }
  }else{
    pos.push(-s,-s,0, s,-s,0, s,s,0, -s,s,0);
    for(let i=0;i<4;i++) nor.push(0,0,1);
    idx.push(0,1,2,0,2,3);
  }
  return {positions:new Float32Array(pos),normals:new Float32Array(nor),uvs:new Float32Array(pos.length/3*2),indices:(idx.length>65535?new Uint32Array(idx):new Uint16Array(idx))};
};

/* ==================== 场 ==================== */
G.makeField=function(opts){
  return Object.assign({id:U.uid('fld'),type:'distance',position:[0,0,0],radius:300,strength:1,falloff:2,color:[1,1,1],
    noiseScale:1,noiseSpeed:1,vortexAxis:[0,1,0],vortexStrength:1,enabled:true,animate:false},opts);
};
G.evalField=function(field, p, t){
  if(!field||!field.enabled) return null;
  const dx=p[0]-field.position[0], dy=p[1]-field.position[1], dz=(p[2]||0)-(field.position[2]||0);
  const d=Math.hypot(dx,dy,dz);
  if(d>field.radius) return null;
  const f=Math.pow(1-d/field.radius, field.falloff||2);
  const s=field.strength*f;
  switch(field.type){
    case 'distance':{
      const n=field.strength>0?1:-1;
      const inv=d>1e-6?1/d:0;
      return [dx*inv*s*n, dy*inv*s*n, dz*inv*s*n];
    }
    case 'noise':{
      const sc=(field.noiseScale||1)/100;
      const tt=t*(field.noiseSpeed||1);
      const x=p[0]*sc+tt, y=p[1]*sc+tt*0.7, z=(p[2]||0)*sc;
      const e=0.35;
      const g=(dx,dy,dz)=>fbm3(x+dx*e,y+dy*e,z+dz*e);
      const vx=(g(e,0,0)-g(-e,0,0))/(2*e);
      const vy=(g(0,e,0)-g(0,-e,0))/(2*e);
      const vz=(g(0,0,e)-g(0,0,-e))/(2*e);
      return [vx*s*260, vy*s*260, vz*s*260];
      function fbm3(a,b,c){
        const i=Math.floor(a),j=Math.floor(b),k=Math.floor(c);
        const fa=a-i,fb=b-j,fc=c-k;
        const u=fa*fa*(3-2*fa),v=fb*fb*(3-2*fb),w=fc*fc*(3-2*fc);
        const h=(xx,yy,zz)=>hash3(i+xx,j+yy,k+zz);
        const l=(pp,qq,rr)=>pp+(qq-pp)*rr;
        return l(l(l(h(0,0,0),h(1,0,0),u),l(h(0,1,0),h(1,1,0),u),v),
               l(l(h(0,0,1),h(1,0,1),u),l(h(0,1,1),h(1,1,1),u),v),w)*2-1;
      }
      function hash3(x,y,z){
        let h=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,1103515245);
        h=Math.imul(h^(h>>>13),1274126177);
        return ((h^(h>>>16))>>>0)/4294967296;
      }
    }
    case 'vortex':{
      const axis=field.vortexAxis||[0,1,0];
      const rx=p[0]-field.position[0], ry=p[1]-field.position[1], rz=(p[2]||0)-(field.position[2]||0);
      const tang=U.vcross(axis,[rx,ry,rz]);
      const tl=U.vlen(tang)||1;
      const k=field.vortexStrength*s*200;
      return [tang[0]/tl*k, tang[1]/tl*k, tang[2]/tl*k];
    }
    case 'impact':{
      const n=field.strength>0?1:-1;
      const inv=d>1e-6?1/d:0;
      return [-dx*inv*s*n*300, -dy*inv*s*n*300, -dz*inv*s*n*300];
    }
    case 'wind':{
      return [s*200, s*60, 0];
    }
  }
  return null;
};
G.applyFields=function(positions,fields,t,strength=1){
  if(!fields||!fields.length) return positions;
  const out=new Float32Array(positions.length);
  for(let i=0;i<positions.length;i+=3){
    let x=positions[i],y=positions[i+1],z=positions[i+2];
    let dx=0,dy=0,dz=0;
    for(const f of fields){
      const d=G.evalField(f,[x,y,z],t);
      if(d){ dx+=d[0]; dy+=d[1]; dz+=d[2]; }
    }
    out[i]=x+dx*strength; out[i+1]=y+dy*strength; out[i+2]=z+dz*strength;
  }
  return out;
};

/* ==================== 图钉 ==================== */
G.applyPins=function(positions, normals, pins, t){
  if(!pins||!pins.length) return positions;
  const n=positions.length/3;
  const out=new Float32Array(positions.length);
  const mats=pins.map(pin=>{
    const w=pin.strength!==undefined?pin.strength:1;
    const rot=pin.rot||[0,0,0], scl=pin.scale||[1,1,1];
    return {pin, w, m:U.m4fromTRS(pin.position||[0,0,0],rot,scl)};
  });
  const radius=pins[0]&&pins[0].radius||200;
  for(let i=0;i<n;i++){
    const p=[positions[i*3],positions[i*3+1],positions[i*3+2]];
    let wsum=0;
    const ws=mats.map(o=>{
      const d=U.vdist(p,o.pin.restPosition||o.pin.position||[0,0,0]);
      const r=o.pin.radius||radius;
      let w=Math.pow(U.clamp(1-d/r,0,1), o.pin.falloff||2)*o.w;
      wsum+=w; return w;
    });
    if(wsum<1e-6){ out[i*3]=p[0];out[i*3+1]=p[1];out[i*3+2]=p[2]; continue; }
    // 加权混合变换后的位置
    let tx=0,ty=0,tz=0;
    for(let k=0;k<mats.length;k++){
      const w=ws[k]/wsum;
      const q=U.m4mulV(mats[k].m,[p[0],p[1],p[2],1]);
      tx+=q[0]*w; ty+=q[1]*w; tz+=q[2]*w;
    }
    out[i*3]=tx; out[i*3+1]=ty; out[i*3+2]=tz;
  }
  return out;
};

/* ==================== BVH（碰撞） ==================== */
G.buildBVH=function(tris){
  // tris: [[p0,p1,p2],...] 每点 [x,y,z]
  const items=tris.map((t,i)=>({tri:t,i,box:triBox(t)}));
  const root=buildNode(items,0);
  return {root,tris};
  function triBox(t){
    const x0=Math.min(t[0][0],t[1][0],t[2][0]), x1=Math.max(t[0][0],t[1][0],t[2][0]);
    const y0=Math.min(t[0][1],t[1][1],t[2][1]), y1=Math.max(t[0][1],t[1][1],t[2][1]);
    const z0=Math.min(t[0][2],t[1][2],t[2][2]), z1=Math.max(t[0][2],t[1][2],t[2][2]);
    return {x0,y0,z0,x1,y1,z1,cx:(x0+x1)/2,cy:(y0+y1)/2,cz:(z0+z1)/2};
  }
  function buildNode(list,depth){
    if(!list.length) return null;
    let x0=1e18,y0=1e18,z0=1e18,x1=-1e18,y1=-1e18,z1=-1e18;
    for(const it of list){ const b=it.box; x0=Math.min(x0,b.x0);y0=Math.min(y0,b.y0);z0=Math.min(z0,b.z0);x1=Math.max(x1,b.x1);y1=Math.max(y1,b.y1);z1=Math.max(z1,b.z1); }
    const node={box:{x0,y0,z0,x1,y1,z1},left:null,right:null,items:null};
    if(list.length<=4||depth>24){ node.items=list; return node; }
    const dx=x1-x0, dy=y1-y0, dz=z1-z0;
    const axis= dx>=dy&&dx>=dz?0:(dy>=dz?1:2);
    list.sort((a,b)=> (axis===0?(a.box.cx-b.box.cx):axis===1?(a.box.cy-b.box.cy):(a.box.cz-b.box.cz)));
    const mid=Math.floor(list.length/2);
    node.left=buildNode(list.slice(0,mid),depth+1);
    node.right=buildNode(list.slice(mid),depth+1);
    return node;
  }
};
G.closestOnMesh=function(bvh,p,maxDist=1e9){
  let best={dist:maxDist,point:null,normal:null,tri:-1};
  const stack=[bvh.root];
  while(stack.length){
    const node=stack.pop();
    if(!node) continue;
    const b=node.box;
    const dx=Math.max(b.x0-p[0],0,p[0]-b.x1), dy=Math.max(b.y0-p[1],0,p[1]-b.y1), dz=Math.max(b.z0-p[2],0,p[2]-b.z1);
    if(Math.hypot(dx,dy,dz)>best.dist) continue;
    if(node.items){
      for(const it of node.items){
        const r=closestOnTri(p,it.tri);
        if(r.dist<best.dist){ best={dist:r.dist,point:r.point,normal:r.normal,tri:it.i}; }
      }
    }else{
      if(node.left) stack.push(node.left);
      if(node.right) stack.push(node.right);
    }
  }
  return best;
};
function closestOnTri(p,t){
  const a=t[0],b=t[1],c=t[2];
  const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const ap=[p[0]-a[0],p[1]-a[1],p[2]-a[2]];
  const d1=U.vdot(ab,ap), d2=U.vdot(ac,ap);
  if(d1<=0&&d2<=0) return {dist:U.vdist(p,a),point:a,normal:triNormal(t)};
  const bp=[p[0]-b[0],p[1]-b[1],p[2]-b[2]];
  const d3=U.vdot(ab,bp), d4=U.vdot(ac,bp);
  if(d3>=0&&d4<=d3) return {dist:U.vdist(p,b),point:b,normal:triNormal(t)};
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0){ const v=d1/(d1-d3); const q=[a[0]+ab[0]*v,a[1]+ab[1]*v,a[2]+ab[2]*v]; return {dist:U.vdist(p,q),point:q,normal:triNormal(t)}; }
  const cp=[p[0]-c[0],p[1]-c[1],p[2]-c[2]];
  const d5=U.vdot(ab,cp), d6=U.vdot(ac,cp);
  if(d6>=0&&d5<=d6) return {dist:U.vdist(p,c),point:c,normal:triNormal(t)};
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0){ const w=d2/(d2-d6); const q=[a[0]+ac[0]*w,a[1]+ac[1]*w,a[2]+ac[2]*w]; return {dist:U.vdist(p,q),point:q,normal:triNormal(t)}; }
  const va=d3*d6-d5*d4;
  if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){ const w=(d4-d3)/((d4-d3)+(d5-d6)); const q=[b[0]+(c[0]-b[0])*w,b[1]+(c[1]-b[1])*w,b[2]+(c[2]-b[2])*w]; return {dist:U.vdist(p,q),point:q,normal:triNormal(t)}; }
  const denom=1/(va+vb+vc), v=vb*denom, w=vc*denom;
  const q=[a[0]+ab[0]*v+ac[0]*w, a[1]+ab[1]*v+ac[1]*w, a[2]+ab[2]*v+ac[2]*w];
  return {dist:U.vdist(p,q),point:q,normal:triNormal(t)};
}
function triNormal(t){
  const n=U.vcross([t[1][0]-t[0][0],t[1][1]-t[0][1],t[1][2]-t[0][2]],[t[2][0]-t[0][0],t[2][1]-t[0][1],t[2][2]-t[0][2]]);
  return U.vnorm(n);
}

/* 网格 -> 三角形列表 */
G.meshTris=function(mesh){
  const pos=mesh.positions, idx=mesh.indices, out=[];
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
    out.push([[pos[a],pos[a+1],pos[a+2]],[pos[b],pos[b+1],pos[b+2]],[pos[c],pos[c+1],pos[c+2]]]);
  }
  return out;
};

/* 变形：弯曲 / 扭转 */
G.deformMesh=function(mesh,bend,twist){
  if(!bend&&!twist) return mesh.positions;
  const pos=mesh.positions;
  const out=new Float32Array(pos.length);
  let minX=1e18,maxX=-1e18,minZ=1e18,maxZ=-1e18;
  for(let i=0;i<pos.length;i+=3){ if(pos[i]<minX)minX=pos[i];if(pos[i]>maxX)maxX=pos[i];if(pos[i+2]<minZ)minZ=pos[i+2];if(pos[i+2]>maxZ)maxZ=pos[i+2]; }
  const len=Math.max(1e-6,maxX-minX);
  for(let i=0;i<pos.length;i+=3){
    let x=pos[i],y=pos[i+1],z=pos[i+2];
    if(bend){
      const f=(x-minX)/len;
      const ang=bend*f;
      const r=200;
      const ny=y*Math.cos(ang)-z*Math.sin(ang);
      const nz=y*Math.sin(ang)+z*Math.cos(ang);
      y=ny; z=nz;
    }
    if(twist){
      const f=(z-minZ)/Math.max(1e-6,maxZ-minZ);
      const ang=twist*f;
      const nx=x*Math.cos(ang)-y*Math.sin(ang);
      const ny=x*Math.sin(ang)+y*Math.cos(ang);
      x=nx; y=ny;
    }
    out[i]=x;out[i+1]=y;out[i+2]=z;
  }
  return out;
};

})();
