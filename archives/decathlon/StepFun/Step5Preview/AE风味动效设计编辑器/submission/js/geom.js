/* ============ 锻火 FORGE · geom.js : 路径 / 布尔 / 三角化 / 挤出 ============ */
(function(){
const APP=window.APP=window.APP||{};
const G=APP.geom={};
const C=APP.core;
const EPS=1e-7;

/* ---------- 路径表示 ----------
   path = { contours:[ {closed, pts:[{x,y,hi:{x,y},ho:{x,y}}] } ] }
   hi/ho 为绝对坐标的贝塞尔控制柄 ---------- */
G.newPath=()=>({contours:[]});
G.newContour=(closed)=>({closed:!!closed,pts:[]});
G.pt=(x,y,hi,ho)=>({x,y,hi:hi||null,ho:ho||null});

function sampleCubic(p0,p1,p2,p3,out){
  const dx=Math.max(Math.abs(p0.x-p1.x)+Math.abs(p2.x-p1.x)+Math.abs(p3.x-p2.x),
                Math.abs(p0.y-p1.y)+Math.abs(p2.y-p1.y)+Math.abs(p3.y-p2.y));
  const n=Math.max(4,Math.min(40,Math.ceil(Math.sqrt(dx*0.6))));
  for(let i=1;i<=n;i++){const t=i/n,mt=1-t;
    out.push({x:mt*mt*mt*p0.x+3*mt*mt*t*p1.x+3*mt*t*t*p2.x+t*t*t*p3.x,
              y:mt*mt*mt*p0.y+3*mt*mt*t*p1.y+3*mt*t*t*p2.y+t*t*t*p3.y});}
}
G.flatten=function(c){
  const pts=c.pts,n=pts.length,out=[];
  if(!n)return out;
  out.push({x:pts[0].x,y:pts[0].y});
  const m=c.closed?n:n-1;
  for(let i=0;i<m;i++){
    const a=pts[i],b=pts[(i+1)%n];
    if(a.ho&&b.hi)sampleCubic(a,b,a.ho,b.hi,out);
    else out.push({x:b.x,y:b.y});
  }
  return out;
};
G.flattenPath=function(p){
  return p.contours.map(c=>G.flatten(c));
};
G.pathLength=function(c){
  const f=G.flatten(c);let L=0;
  const m=c.closed?f.length:f.length-1;
  for(let i=0;i<m;i++)L+=Math.hypot(f[(i+1)%f.length].x-f[i].x,f[(i+1)%f.length].y-f[i].y);
  return L;
};
G.pointAtLen=function(c,s){
  const f=G.flatten(c);let L=0;const m=c.closed?f.length:f.length-1;
  const seg=[];for(let i=0;i<m;i++){const d=Math.hypot(f[(i+1)%f.length].x-f[i].x,f[(i+1)%f.length].y-f[i].y);seg.push(d);L+=d;}
  if(L<=0)return {x:f[0]?f[0].x:0,y:f[0]?f[0].y:0,t:0};
  let t=(s%L+L)%L;
  for(let i=0;i<m;i++){
    if(t<=seg[i]||i===m-1){const k=seg[i]>0?Math.min(1,t/seg[i]):0;
      return {x:f[i].x+(f[(i+1)%f.length].x-f[i].x)*k, y:f[i].y+(f[(i+1)%f.length].y-f[i].y)*k, t:k};}
    t-=seg[i];
  }
  return {x:f[0].x,y:f[0].y,t:0};
};

/* ---------- 轮廓基础 ---------- */
G.area=function(c){let a=0;for(let i=0;i<c.length;i++){const b=c[(i+1)%c.length];a+=(b.x-c[i].x)*(b.y+c[i].y)/2;}return a;};
G.bounds=function(cs){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const c of cs)for(const p of c){if(p.x<x0)x0=p.x;if(p.y<y0)y0=p.y;if(p.x>x1)x1=p.x;if(p.y>y1)y1=p.y;}
  if(x0>x1)return {x:0,y:0,w:0,h:0};return {x:x0,y:y0,w:x1-x0,h:y1-y0};};
G.windAt=function(cs,x,y){ // 绕数
  let w=0;
  for(const c of cs){
    for(let i=0;i<c.length;i++){
      const a=c[i],b=c[(i+1)%c.length];
      if(a.y<=y){if(b.y>y){ if((b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y)>0)w++; }}
      else {if(b.y<=y){ if((b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y)<0)w--; }}
    }
  }
  return w;
};
G.pointInside=function(cs,x,y){return G.windAt(cs,x,y)!==0;};

/* ---------- 描边(路径 -> 轮廓) ---------- */
G.strokeContours=function(c,width,cap,join,closed){
  const f=G.flatten(c),n=f.length;
  if(n<2)return [];
  const L=[],R=[];
  for(let i=0;i<n;i++){
    const p=f[i];let tx,ty;
    if(i===0){tx=f[1].x-p.x;ty=f[1].y-p.y;}
    else if(i===n-1){tx=p.x-f[i-1].x;ty=p.y-f[i-1].y;}
    else{tx=f[i+1].x-f[i-1].x;ty=f[i+1].y-f[i-1].y;}
    const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;
    L.push({x:p.x-ty*width/2,y:p.y+tx*width/2});
    R.push({x:p.x+ty*width/2,y:p.y-tx*width/2});
  }
  const addArc=(c0,from,to)=>{
    const a0=Math.atan2(from.y-c0.y,from.x-c0.x),a1=Math.atan2(to.y-c0.y,to.x-c0.x);
    let da=a1-a0;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
    const steps=Math.max(2,Math.ceil(Math.abs(da)/0.4));
    for(let k=1;k<steps;k++){const a=a0+da*k/steps,r=Math.hypot(from.x-c0.x,from.y-c0.y);
      out.push({x:c0.x+Math.cos(a)*r,y:c0.y+Math.sin(a)*r});}
  };
  const out=[];
  for(let i=0;i<n;i++){
    if(i>0){
      const a=L[i-1],b=L[i],c2=L[Math.min(i+1,n-1)];
      const d1={x:b.x-a.x,y:b.y-a.y},d2={x:c2.x-b.x,y:c2.y-b.y};
      const cross=d1.x*d2.y-d1.y*d2.x;
      if(cross<-1e-6){
        const den=d1.x*d2.y-d1.y*d2.x;
        const t=((a.x-b.x)*d2.y-(a.y-b.y)*d2.x)/den;
        const mx=a.x+d1.x*t,my=a.y+d1.y*t;
        if(Math.hypot(mx-b.x,my-b.y)<width*1.5)out.push({x:mx,y:my});
      }
    }
    out.push(L[i]);
  }
  if(!closed){
    if(cap==='round')addArc(f[n-1],L[n-1],R[n-1]);
    else out.push({x:R[n-1].x,y:R[n-1].y});
  }
  for(let i=n-1;i>=0;i--){
    if(i<n-1){
      const a=R[i+1],b=R[i],c2=R[Math.max(i-1,0)];
      const d1={x:b.x-a.x,y:b.y-a.y},d2={x:c2.x-b.x,y:c2.y-b.y};
      const cross=d1.x*d2.y-d1.y*d2.x;
      if(cross>1e-6){
        const den=d1.x*d2.y-d1.y*d2.x;
        const t=((a.x-b.x)*d2.y-(a.y-b.y)*d2.x)/den;
        const mx=a.x+d1.x*t,my=a.y+d1.y*t;
        if(Math.hypot(mx-b.x,my-b.y)<width*1.5)out.push({x:mx,y:my});
      }
    }
    out.push(R[i]);
  }
  if(!closed){
    if(cap==='round')addArc(f[0],R[0],L[0]);
    else out.push({x:L[0].x,y:L[0].y});
  } else {
    // 闭合: 直接回到起点
  }
  return out;
};
/* 沿法线偏移整条轮廓(用于厚度/倒角) */
G.offsetRing=function(ring,d){
  const n=ring.length,out=[];
  for(let i=0;i<n;i++){
    const p=ring[i];let tx,ty;
    if(i===0){tx=ring[1].x-p.x;ty=ring[1].y-p.y;}
    else if(i===n-1){tx=p.x-ring[i-1].x;ty=p.y-ring[i-1].y;}
    else{tx=ring[i+1].x-ring[i-1].x;ty=ring[i+1].y-ring[i-1].y;}
    const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;
    out.push({x:p.x-ty*d,y:p.y+tx*d});
  }
  return out;
};

/* ---------- 三角化 (earcut) ---------- */
function earcutMain(data,holeIndices,dim){
  dim=dim||2;
  const hasHoles=holeIndices&&holeIndices.length;
  const outerLen=hasHoles?holeIndices[0]*dim:data.length;
  let outerNode=linkedList(data,0,outerLen,dim,true);
  if(!outerNode||outerNode.next===outerNode.prev)return [];
  if(hasHoles)outerNode=eliminateHoles(data,holeIndices,outerNode,dim);
  const tris=[];
  earcutLinked(outerNode,tris,dim);
  return tris;
}
function Node(i,x,y){this.i=i;this.x=x;this.y=y;this.prev=null;this.next=null;this.z=0;this.prevZ=null;this.nextZ=null;this.steiner=false;}
function linkedList(data,start,end,dim,clockwise){
  let i,last;
  if(clockwise===(signedArea(data,start,end,dim)>0)){
    for(i=start;i<end;i+=dim)last=insertNode(i,data[i],data[i+1],last);
  }else{
    for(i=end-dim;i>=start;i-=dim)last=insertNode(i,data[i],data[i+1],last);
  }
  if(last&&equals(last,last.next)){removeNode(last);last=last.next;}
  return last;
}
function filterPoints(start,end){
  if(!start)return start;
  if(!end)end=start;
  let p=start,again;
  do{again=false;
    if(!p.steiner&&(equals(p,p.next)||area(p,p.prev,p.next)===0)){
      removeNode(p);p=end=p.prev;if(p===p.next)break;again=true;
    }else p=p.next;
  }while(again||p!==end);
  return end;
}
function earcutLinked(ear,triangles,dim){
  if(!ear)return;
  let stop=ear,prev,next;
  const d=dim||2;
  while(ear.prev!==ear.next){
    prev=ear.prev;next=ear.next;
    if(isEar(ear)){
      triangles.push(prev.i/d|0,ear.i/d|0,next.i/d|0);
      removeNode(ear);
      ear=next.next;stop=next.next;continue;
    }
    ear=next;
    if(ear===stop){
      const f=filterPoints(ear);
      if(f!==ear||!f){
        if(!f)return;
      }
      // 局部自交修复
      ear=cureLocalIntersections(f,triangles,d);
      if(!ear)return;
      earcutLinked(ear,triangles,d);
      return;
    }
  }
}
function isEar(ear){
  const a=ear.prev,b=ear,c=ear.next;
  if(area(a,b,c)>=0)return false;
  const ax=a.x,bx=b.x,cx=c.x,ay=a.y,by=b.y,cy=c.y;
  const x0=ax<bx?(ax<cx?ax:cx):(bx<cx?bx:cx), x1=ax>bx?(ax>cx?ax:cx):(bx>cx?bx:cx);
  const y0=ay<by?(ay<cy?ay:cy):(by<cy?by:cy), y1=ay>by?(ay>cy?ay:cy):(by>cy?by:cy);
  let p=c.next;
  while(p!==a){
    if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1&&pointInTriangle(ax,ay,bx,by,cx,cy,p.x,p.y)&&area(p.prev,p,p.next)>=0)return false;
    p=p.next;
  }
  return true;
}
function isEarHashed(data,ear,dim){
  const a=ear.prev,b=ear,c=ear.next;
  if(area(a,b,c)>=0)return false;
  const ax=a.x,bx=b.x,cx=c.x,ay=a.y,by=b.y,cy=c.y;
  const x0=ax<bx?(ax<cx?ax:cx):(bx<cx?bx:cx), x1=ax>bx?(ax>cx?ax:cx):(bx>cx?bx:cx);
  const y0=ay<by?(ay<cy?ay:cy):(by<cy?by:cy), y1=ay>by?(ay>cy?ay:cy):(by>cy?by:cy);
  let p=c.nextZ,n=p?p.z:null;
  while(p){
    if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1&&p.i!==a.i&&p.i!==b.i&&p.i!==c.i&&pointInTriangle(ax,ay,bx,by,cx,cy,p.x,p.y)&&area(p.prev,p,p.next)>=0)return false;
    p=p.nextZ;n=p?p.z:null;
  }
  return true;
}
function cureLocalIntersections(start,triangles,dim){
  let p=start;
  do{
    const a=p.prev,b=p.next.next;
    if(!equals(a,b)&&intersects(a,p,p.next,b)&&locallyInside(a,b)&&locallyInside(b,a)){
      triangles.push(a.i,p.i,b.i);
      removeNode(p);removeNode(p.next);
      p=start=b;
    }
    p=p.next;
  }while(p!==start);
  return filterPoints(p);
}
function splitEarcut(start,triangles,dim){
  let a=start;
  do{let b=a.next.next;while(b!==a.prev){
    if(a.i!==b.i&&isValidDiagonal(a,b)){
      let c=splitPolygon(a,b);
      a=filterPoints(a,a.next);c=filterPoints(c,c.next);
      earcutLinked(a,triangles,dim);earcutLinked(c,triangles,dim);return;
    }
    b=b.next;}
    a=a.next;}while(a!==start);
}
function eliminateHoles(data,holeIndices,outerNode,dim){
  const queue=[];
  for(let i=0,len=holeIndices.length;i<len;i++){
    const start=holeIndices[i]*dim;
    const end=i<len-1?holeIndices[i+1]*dim:data.length;
    const list=linkedList(data,start,end,dim,false);
    if(list===list.next)list.steiner=true;
    queue.push(getLeftmost(list));
  }
  queue.sort(cmpX);
  for(let i=0;i<queue.length;i++){
    outerNode=eliminateHole(queue[i],outerNode);
  }
  return outerNode;
}
function cmpX(a,b){return a.x-b.x;}
function eliminateHole(hole,outerNode){
  const bridge=findHoleBridge(hole,outerNode);
  if(!bridge)return outerNode;
  const b2=insertNode(bridge.i,bridge.x,bridge.y,bridge);
  const nn=b2.next;
  const hEnd=hole.prev;
  b2.next=hole;hole.prev=b2;
  hEnd.next=nn;nn.prev=hEnd;
  return b2;
}
function findHoleBridge(hole,outerNode){
  let p=outerNode;const hx=hole.x,hy=hole.y,qx=-Infinity; let m;
  do{
    if(hy<=p.y&&hy>=p.next.y&&p.next.y!==p.y){
      const x=p.x+(hy-p.y)*(p.next.x-p.x)/(p.next.y-p.y);
      if(x<=hx&&x>qx){qx=x;
        if(x===hx){
          if(hy===p.y)return p;
          if(hy===p.next.y)return p.next;
        }
        m=p.x<p.next.x?p:p.next;
      }
    }
    p=p.next;
  }while(p!==outerNode);
  if(!m)return null;
  const stop=m,mx=m.x,my=m.y;let tanMin=Infinity;let tan;
  p=m;
  do{
    if(hx>=p.x&&p.x>=mx&&hx!==p.x&&pointInTriangle(hy<my?hx:qx,hy,mx,my,hy<my?qx:hx,hy,p.x,p.y)){
      tan=Math.abs(hy-p.y)/(hx-p.x);
      if(locallyInside(p,hole)&&(tan<tanMin||(tan===tanMin&&(p.x>m.x||(p.x===m.x&&sectorContainsSector(m,p)))))){
        m=p;tanMin=tan;
      }
    }
    p=p.next;
  }while(p!==stop);
  return m;
}
function sectorContainsSector(m,p){return area(m.prev,m,p.prev)<0&&area(p.next,m,m.next)<0;}
function getLeftmost(start){
  let p=start,leftmost=start;
  do{if(p.x<leftmost.x||(p.x===leftmost.x&&p.y<leftmost.y))leftmost=p;p=p.next;}while(p!==start);
  return leftmost;
}
function pointInTriangle(ax,ay,bx,by,cx,cy,px,py){
  return (cx-px)*(ay-py)-(ax-px)*(cy-py)>=0&&(ax-px)*(by-py)-(bx-px)*(ay-py)>=0&&(bx-px)*(cy-py)-(cx-px)*(by-py)>=0;
}
function isValidDiagonal(a,b){
  return a.next.i!==b.i&&a.prev.i!==b.i&&!intersectsPolygon(a,b)&&(locallyInside(a,b)&&locallyInside(b,a)&&middleInside(a,b)&&(area(a.prev,a,b.prev)||area(a,b.prev,b))||equals(a,b)&&area(a.prev,a,a.next)>0&&area(b.prev,b,b.next)>0);
}
function area(p,q,r){return (q.y-p.y)*(r.x-q.x)-(q.x-p.x)*(r.y-q.y);}
function equals(p1,p2){return p1.x===p2.x&&p1.y===p2.y;}
function intersects(p1,q1,p2,q2){
  const o1=sign(area(p1,q1,p2));const o2=sign(area(p1,q1,q2));
  const o3=sign(area(p2,q2,p1));const o4=sign(area(p2,q2,q1));
  if(o1!==o2&&o3!==o4)return true;
  if(o1===0&&onSegment(p1,p2,q1))return true;
  if(o2===0&&onSegment(p1,q2,q1))return true;
  if(o3===0&&onSegment(p2,p1,q2))return true;
  if(o4===0&&onSegment(p2,q1,q2))return true;
  return false;
}
function onSegment(p,q,r){return q.x<=Math.max(p.x,r.x)&&q.x>=Math.min(p.x,r.x)&&q.y<=Math.max(p.y,r.y)&&q.y>=Math.min(p.y,r.y);}
function sign(num){return num>0?1:num<0?-1:0;}
function intersectsPolygon(a,b){
  let p=a;
  do{if(p.i!==a.i&&p.next.i!==a.i&&p.i!==b.i&&p.next.i!==b.i&&intersects(p,p.next,a,b))return true;
    p=p.next;}while(p!==a);
  return false;
}
function locallyInside(a,b){return area(a.prev,a,a.next)<0?area(a,b,a.next)>=0&&area(a,a.prev,b)>=0:area(a,b,a.prev)<0||area(a,a.next,b)<0;}
function middleInside(a,b){
  let p=a,inside=false;const px=(a.x+b.x)/2,py=(a.y+b.y)/2;
  do{if(p.y>py!==p.next.y>py&&p.next.y!==p.y&&px<(p.next.x-p.x)*(py-p.y)/(p.next.y-p.y)+p.x)inside=!inside;
    p=p.next;}while(p!==a);
  return inside;
}
function splitPolygon(a,b){
  const a2=new Node(a.i,a.x,a.y),b2=new Node(b.i,b.x,b.y),an=a.next,bp=b.prev;
  a.next=b;b.prev=a;
  a2.next=an;an.prev=a2;
  b2.next=a2;a2.prev=b2;
  bp.next=b2;b2.prev=bp;
  return b2;
}
function insertNode(i,x,y,last){
  const p=new Node(i,x,y);
  if(!last){p.prev=p;p.next=p;}
  else{p.next=last.next;p.prev=last;last.next.prev=p;last.next=p;}
  return p;
}
function removeNode(p){p.next.prev=p.prev;p.prev.next=p.next;}
function signedArea(data,start,end,dim){
  let sum=0;
  for(let i=start,j=end-dim;i<end;i+=dim){sum+=(data[j]-data[i])*(data[i+1]+data[j+1]);j=i;}
  return sum;
}


/* 三角化轮廓集合(含孔洞); 返回 {pos:Float32Array(n,2), idx:Uint32Array} */
G.triangulate=function(contours){
  if(!contours||!contours.length)return {pos:new Float32Array(0),idx:new Uint32Array(0)};
  // 归一化方向 + 计算嵌套深度
  const rings=contours.map(c=>{
    const a=G.area(c);
    return {pts:c, area:a};
  }).filter(r=>r.pts.length>=3&&Math.abs(r.area)>1e-9);
  if(!rings.length)return {pos:new Float32Array(0),idx:new Uint32Array(0)};
  for(const r of rings)if(r.area<0){r.pts=r.pts.slice().reverse();r.area=-r.area;}
  // 判定孔洞: 被奇数个其它环包含
  const depth=r=>{
    let d=0;const p=r.pts[0];
    for(const o of rings){if(o===r)continue;
      if(o.area>r.area && G.windAt([o.pts],p.x,p.y)!==0)d++;}
    return d;
  };
  const data=[];const holeIdx=[];let offset=0;const outers=[];
  rings.forEach((r,i)=>{const d=depth(r);r.depth=d;});
  // 按面积降序处理, 保证外层先写入
  const order=rings.slice().sort((a,b)=>b.area-a.area);
  for(const r of order){
    const isHole=r.depth%2===1;
    if(isHole)holeIdx.push(offset/2);
    else outers.push(r);
    for(const p of r.pts){data.push(p.x,p.y);}
    offset+=r.pts.length*2;
  }
  let idx;
  try{idx=earcutMain(data,holeIdx,2);}catch(e){idx=[];}
  if(!idx||!idx.length){
    // 退路: 扇形三角化每个环
    idx=[];
    let base=0;
    for(const r of order){
      const start=r.depth%2===1?-1:0;
      const n=r.pts.length;
      for(let i=1;i<n-1;i++){
        const a=0,b=i,c=i+1;
        const p0=r.pts[a],p1=r.pts[b],p2=r.pts[c];
        const cr=(p1.x-p0.x)*(p2.y-p0.y)-(p1.y-p0.y)*(p2.x-p0.x);
        if(start===-1?cr<0:cr>0)idx.push(base+a,base+b,base+c);
      }
      base+=n;
    }
  }
  return {pos:new Float32Array(data),idx:new Uint32Array(idx)};
};

/* ---------- 布尔运算 (排列 + 绕数分类) ---------- */
function segInt(a1,a2,b1,b2){
  const d1x=a2.x-a1.x,d1y=a2.y-a1.y,d2x=b2.x-b1.x,d2y=b2.y-b1.y;
  const den=d1x*d2y-d1y*d2x;
  if(Math.abs(den)<1e-12)return null;
  const t=((b1.x-a1.x)*d2y-(b1.y-a1.y)*d2x)/den;
  const s=((b1.x-a1.x)*d1y-(b1.y-a1.y)*d1x)/den;
  if(t<-1e-9||t>1+1e-9||s<-1e-9||s>1+1e-9)return null;
  return {x:a1.x+d1x*t,y:a1.y+d1y*t,t};
}
function key(x,y){return Math.round(x*1e5)+','+Math.round(y*1e5);}
function normSets(x){
  if(!x||!x.length)return [];
  if(Array.isArray(x[0]))return x;
  return [x]; // 单个轮廓
}
function booleanOp(setsIn,mode){
  const sets=[normSets(setsIn[0]),normSets(setsIn[1])];
  if(mode==='union'){
    if(!sets[1].length)return sets[0].map(c=>c.slice());
    if(!sets[0].length)return sets[1].map(c=>c.slice());
  }
  if(mode==='diff'&&!sets[1].length)return sets[0].map(c=>c.slice());
  if(mode==='inter'&&(!sets[0].length||!sets[1].length))return [];
  // 1. 收集有向边并求交分割
  const edges=[]; // {a:{x,y,id}, b:{...}}
  const vmap=new Map();
  function vid(p){const k=key(p.x,p.y);let v=vmap.get(k);if(!v){v={x:p.x,y:p.y,id:vmap.size,out:[]};vmap.set(k,v);}return v;}
  const rawSegs=[];
  for(const cs of sets)for(const c of cs){
    const n=c.length;
    for(let i=0;i<n;i++){
      const a=c[i],b=c[(i+1)%n];
      if(Math.abs(a.x-b.x)<EPS&&Math.abs(a.y-b.y)<EPS)continue;
      rawSegs.push([{x:a.x,y:a.y},{x:b.x,y:b.y}]);
    }
  }
  if(!rawSegs.length)return [];
  // 分割
  const edgeSet=new Set();
  const pushEdge=(a,b)=>{
    const va=vid(a),vb=vid(b);
    if(va===vb)return;
    const k=Math.min(va.id,vb.id)+'>'+Math.max(va.id,vb.id);
    if(edgeSet.has(k))return;
    edgeSet.add(k);
    edges.push([va,vb]);
  };
  for(let i=0;i<rawSegs.length;i++){
    const s=rawSegs[i];const cuts=[];
    for(let j=0;j<rawSegs.length;j++){
      if(i===j)continue;
      const o=rawSegs[j];
      if(Math.max(s[0].x,s[1].x)<Math.min(o[0].x,o[1].x)-1e-9)continue;
      if(Math.min(s[0].x,s[1].x)>Math.max(o[0].x,o[1].x)+1e-9)continue;
      if(Math.max(s[0].y,s[1].y)<Math.min(o[0].y,o[1].y)-1e-9)continue;
      if(Math.min(s[0].y,s[1].y)>Math.max(o[0].y,o[1].y)+1e-9)continue;
      const p=segInt(s[0],s[1],o[0],o[1]);
      if(p)cuts.push(p);
    }
    cuts.sort((a,b)=>a.t-b.t);
    let prev=s[0];
    for(const c of cuts){
      if(Math.abs(c.x-prev.x)<1e-7&&Math.abs(c.y-prev.y)<1e-7)continue;
      if(Math.abs(c.x-s[1].x)<1e-7&&Math.abs(c.y-s[1].y)<1e-7)break;
      pushEdge(prev,c);
      prev=c;
    }
    pushEdge(prev,s[1]);
  }
  if(!edges.length)return [];
  // 2. 半边结构 (每条无向边产生两个半边)
  const halfs=[];
  for(const e of edges){
    const h1={from:e[0],to:e[1],used:false,twin:null};
    const h2={from:e[1],to:e[0],used:false,twin:h1};
    h1.twin=h2;
    halfs.push(h1,h2);
  }
  // 3. 顶点出边排序 (角度归一化到 [0,2π) 后 CCW 排序)
  vmap.forEach(v=>{
    v.out=halfs.filter(h=>h.from===v);
    const ang=h=>{let a=Math.atan2(h.to.y-v.y,h.to.x-v.x);if(a<0)a+=Math.PI*2;return a;};
    v.out.sort((a,b)=>ang(a)-ang(b));
  });
  // 4. 遍历面
  const faces=[];
  for(const h of halfs){
    if(h.used)continue;
    const face=[];let e=h;
    do{
      e.used=true;face.push(e);
      const v=e.to;
      const list=v.out;
      let idx=list.indexOf(e.twin);
      if(idx<0){ // 无孪生边(不应发生)
        idx=list.findIndex(x=>Math.abs(Math.atan2(x.to.y-v.y,x.to.x-v.x)-(Math.atan2(e.from.y-v.y,e.from.x-v.x)+Math.PI))<1e-9);
      }
      e=list[(idx-1+list.length)%list.length];
      if(!e)break;
    }while(e!==h&&!e.used);
    faces.push(face);
  }
  // 5. 分类 + 边界重建
  const A=sets[0],B=sets[1];
  const keptFaces=[];
  for(let fi=0;fi<faces.length;fi++){
    const f=faces[fi];
    if(f.length<3)continue;
    for(const e of f)e.face=fi;
    // 内部探测点: 取最短边中点, 沿代数左侧(R+ = (-dy,dx))微移 —— DCEL 中面恒在边的左侧
    let bi=0,bd=Infinity;
    for(let i=0;i<f.length;i++){
      const d=Math.hypot(f[i].to.x-f[i].from.x,f[i].to.y-f[i].from.y);
      if(d<bd){bd=d;bi=i;}
    }
    if(!(bd>0)||!isFinite(bd))continue;
    const a=f[bi].from,b=f[bi].to;
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const dx=(b.x-a.x)/bd, dy=(b.y-a.y)/bd;
    const eps=1e-4*(1+Math.abs(mx)+Math.abs(my))*1e-3+1e-5;
    const ix=mx-dy*eps, iy=my+dx*eps;
    const wA=G.windAt(A,ix,iy), wB=G.windAt(B,ix,iy);
    const inA=wA!==0, inB=wB!==0;
    let keep=false;
    if(mode==='union')keep=inA||inB;
    else if(mode==='diff')keep=inA&&!inB;
    else keep=inA&&inB;
    if(!keep)continue;
    keptFaces.push(f);
  }
  if(!keptFaces.length)return [];
  const keptSet=new Set(keptFaces);
  // 边界半边: 自身面保留, 孪生面不保留
  const bEdges=[];
  for(const f of keptFaces)for(const e of f){
    const tf=e.twin.face;
    if(tf===undefined||!keptSet.has(faces[tf]))bEdges.push(e);
  }
  // 链接成环
  const outMap=new Map();
  for(const e of bEdges){ if(!outMap.has(e.from))outMap.set(e.from,[]); outMap.get(e.from).push(e); }
  const used=new Set();
  const out=[];
  for(const e0 of bEdges){
    if(used.has(e0))continue;
    const ring=[];let e=e0,guard=0;
    do{
      used.add(e);ring.push({x:e.from.x,y:e.from.y});
      const cand=outMap.get(e.to);
      e=cand?cand.find(c=>!used.has(c)):null;
      guard++;
    }while(e&&e!==e0&&guard<100000);
    if(ring.length>=3)out.push(ring);
  }
  return out;
}
G.unionContours=(a,b)=>booleanOp([a,b||[]],'union');
G.subtractContours=(a,b)=>booleanOp([a,b||[]],'diff');
G.intersectContours=(a,b)=>booleanOp([a,b||[]],'inter');

/* ---------- 挤出 (含倒角) ---------- */
G.extrude=function(contours,opts){
  opts=opts||{};
  const depth=opts.depth!==undefined?opts.depth:100;
  const bevel=opts.bevel!==undefined?opts.bevel:0;
  const bevelSeg=opts.bevelSeg||1;
  const t=G.triangulate(contours);
  const pos=t.pos, idx=t.idx, nv=pos.length/2;
  const posArr=[],norArr=[],uvArr=[],idxArr=[];
  // 归一化方向
  const rings=contours.map(c=>({pts:c.slice(),area:G.area(c)})).filter(r=>Math.abs(r.area)>1e-9);
  for(const r of rings)if(r.area<0)r.pts.reverse();
  // 前面/后面
  const layers=[]; // {z, scale}
  if(bevel>0){
    layers.push({z:-depth/2-bevel,s:1+bevel/100});
    for(let i=1;i<=bevelSeg;i++)layers.push({z:-depth/2-bevel+(bevel+bevel)*(i/(bevelSeg+1)),s:1-bevel/100*(i/(bevelSeg+1))});
  }
  layers.push({z:-depth/2,s:1});
  layers.push({z:depth/2,s:1});
  if(bevel>0){
    for(let i=0;i<bevelSeg;i++)layers.push({z:depth/2+bevel*(i+1)/(bevelSeg+1),s:1-bevel/100*(1-(i+1)/(bevelSeg+1))});
    layers.push({z:depth/2+bevel,s:1+bevel/100});
  }
  let base=0;
  const capP=[],capN=[],capI=[];
  const sideP=[],sideN=[],sideI=[];
  // 顶盖 & 底盖(使用 triangulate 的索引, 需要按环拆分)
  // 简化: 每个环单独扇形三角化(渲染用 nonzero, 不受重叠影响)
  let ringBase=0;
  const ringTris=[];
  for(const r of rings){
    const n=r.pts.length;
    for(let i=1;i<n-1;i++){
      const p0=r.pts[0],p1=r.pts[i],p2=r.pts[i+1];
      const cr=(p1.x-p0.x)*(p2.y-p0.y)-(p1.y-p0.y)*(p2.x-p0.x);
      if(cr>0)ringTris.push([ringBase+0,ringBase+i,ringBase+i+1]);
      else ringTris.push([ringBase+0,ringBase+i+1,ringBase+i]);
    }
    ringBase+=n;
  }
  // 前面 z=+depth/2, 后面 z=-depth/2
  let vbase=0;
  const pushVerts=(z,s)=>{
    let o=vbase;
    for(const r of rings)for(const p of r.pts){
      posArr.push(p.x*s,p.y*s,z); norArr.push(0,0,1); uvArr.push(p.x/1000,p.y/1000);
      vbase++;
    }
    return o;
  };
  // 为每个 z 层写一份顶点
  const layerInfo=[];
  for(const L of layers){
    const start=vbase;
    for(const r of rings)for(const p of r.pts){
      posArr.push(p.x*L.s,p.y*L.s,L.z);
      norArr.push(0,0,1);uvArr.push(p.x/1000,p.y/1000);
      vbase++;
    }
    layerInfo.push({start,L});
  }
  // 盖面: 首层(前) 与 末层(后)
  const first=layerInfo[0].start, last=layerInfo[layerInfo.length-1].start;
  for(const tri of ringTris){
    capI.push(first+tri[0],first+tri[1],first+tri[2]);
    capI.push(last+tri[2],last+tri[1],last+tri[0]);
  }
  // 修正盖面法线: 首层 z 最大 => 法线 +z; 末层 z 最小 => -z
  // (norArr 初始化为 +z, 末层需改为 -z)
  for(let i=last;i<last+ringBase;i++){norArr[i*3+2]=-1;}
  // 侧壁
  let si=vbase;
  for(let li=0;li<layerInfo.length-1;li++){
    const A=layerInfo[li],B=layerInfo[li+1];
    for(const r of rings){
      const n=r.pts.length;
      for(let i=0;i<n;i++){
        const j=(i+1)%n;
        const p0=r.pts[i],p1=r.pts[j];
        // 四边形 A_i,B_i,B_j,A_j
        const ax=p0.x*A.L.s,ay=p0.y*A.L.s,az=A.L.z;
        const bx=p1.x*A.L.s,by=p1.y*A.L.s,bz=A.L.z;
        const cx=p1.x*B.L.s,cy=p1.y*B.L.s,cz=B.L.z;
        const dx=p0.x*B.L.s,dy=p0.y*B.L.s,dz=B.L.z;
        const ux=cx-ax,uy=cy-ay,uz=cz-az, vx=dx-ax,vy=dy-ay,vz=dz-az;
        let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
        const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
        const s0=si;
        for(const p of [[ax,ay,az],[bx,by,bz],[cx,cy,cz],[dx,dy,dz]]){
          posArr.push(p[0],p[1],p[2]);norArr.push(nx,ny,nz);uvArr.push(0,0);
        }
        si+=4;
        sideI.push(s0,s0+1,s0+2, s0,s0+2,s0+3);
      }
    }
  }
  const P=new Float32Array(posArr),N=new Float32Array(norArr),UV=new Float32Array(uvArr);
  const I=new Uint32Array(capI.concat(sideI));
  return {pos:P,nor:N,uv:UV,idx:I};
};

/* ---------- 网格变换工具 ---------- */
G.transformMesh=function(mesh,m){
  const p=mesh.pos;
  for(let i=0;i<p.length;i+=3){
    const w=m[3]*p[i]+m[7]*p[i+1]+m[11]*p[i+2]+m[15]||1;
    const x=(m[0]*p[i]+m[4]*p[i+1]+m[8]*p[i+2]+m[12])/w;
    const y=(m[1]*p[i]+m[5]*p[i+1]+m[9]*p[i+2]+m[13])/w;
    const z=(m[2]*p[i]+m[6]*p[i+1]+m[10]*p[i+2]+m[14])/w;
    p[i]=x;p[i+1]=y;p[i+2]=z;
  }
  return mesh;
};
G.computeNormals=function(mesh){
  const p=mesh.pos,n=mesh.nor,idx=mesh.idx;
  n.fill(0);
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
    const ax=p[a],ay=p[a+1],az=p[a+2],bx=p[b],by=p[b+1],bz=p[b+2],cx=p[c],cy=p[c+1],cz=p[c+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    n[a]+=nx;n[a+1]+=ny;n[a+2]+=nz;n[b]+=nx;n[b+1]+=ny;n[b+2]+=nz;n[c]+=nx;n[c+1]+=ny;n[c+2]+=nz;
  }
  for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}
  return mesh;
};
/* 复制网格 */
G.cloneMesh=function(m){
  return {pos:new Float32Array(m.pos),nor:new Float32Array(m.nor),uv:new Float32Array(m.uv),idx:new Uint32Array(m.idx)};
};
/* 从三角化结果构造平面网格(z=0) */
G.planeMesh=function(tris,z){
  z=z||0;
  const pos=new Float32Array(tris.pos.length/2*3);
  for(let i=0,j=0;i<tris.pos.length;i+=2,j+=3){
    pos[j]=tris.pos[i];pos[j+1]=tris.pos[i+1];pos[j+2]=z;
  }
  const uv=new Float32Array(pos.length);
  for(let i=0;i<pos.length;i+=3){uv[i]=pos[i]/1000+0.5;uv[i+1]=pos[i+1]/1000+0.5;uv[i+2]=0;}
  const nor=new Float32Array(pos.length);
  const mesh={pos,nor,uv,idx:new Uint32Array(tris.idx)};
  return G.computeNormals(mesh);
};
/* 合并多个网格 */
G.mergeMeshes=function(ms){
  let np=0,ni=0;for(const m of ms){np+=m.pos.length;ni+=m.idx.length;}
  const pos=new Float32Array(np),nor=new Float32Array(np),uv=new Float32Array(np),idx=new Uint32Array(ni);
  let po=0,io=0,vo=0;
  for(const m of ms){
    pos.set(m.pos,po);nor.set(m.nor,po);uv.set(m.uv,po);
    for(let i=0;i<m.idx.length;i++)idx[io+i]=m.idx[i]+vo;
    po+=m.pos.length;io+=m.idx.length;vo+=m.pos.length/3;
  }
  return {pos,nor,uv,idx};
};
})();
