/* util.js — 数学、颜色、随机、几何与三角化 */
(function(){
'use strict';
const U = {};
window.U = U;

/* ---------------- 基础数学 ---------------- */
U.clamp = (v,a,b)=> v<a?a:(v>b?b:v);
U.lerp = (a,b,t)=> a+(b-a)*t;
U.invlerp = (a,b,v)=> (v-a)/(b-a);
U.smoothstep = (a,b,v)=>{ const t=U.clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); };
U.TAU = Math.PI*2;
U.deg2rad = d=> d*Math.PI/180;
U.rad2deg = r=> r*180/Math.PI;
U.sign = v=> v<0?-1:(v>0?1:0);

U.ease = {
  linear: t=>t,
  easeInQuad: t=>t*t,
  easeOutQuad: t=>t*(2-t),
  easeInOutQuad: t=> t<.5?2*t*t:-1+(4-2*t)*t,
  easeInCubic: t=>t*t*t,
  easeOutCubic: t=>(--t)*t*t+1,
  easeInOutCubic: t=> t<.5?4*t*t*t:(t-1)*(2*t-2)*(2*t-2)+1,
  easeInQuart: t=>t*t*t*t,
  easeOutQuart: t=>1-(--t)*t*t*t,
  easeInOutQuart: t=> t<.5?8*t*t*t*t:1-8*(--t)*t*t*t,
  easeOutBack: t=>{const c=1.70158;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);},
  easeOutExpo: t=> t>=1?1:1-Math.pow(2,-10*t),
  easeOutBounce: t=>{const n=7.5625,d=2.75;
    if(t<1/d)return n*t*t; if(t<2/d)return n*(t-=1.5/d)*t+.75;
    if(t<2.5/d)return n*(t-=2.25/d)*t+.9375; return n*(t-=2.625/d)*t+.984375;},
  easeInOutSine: t=> -(Math.cos(Math.PI*t)-1)/2,
};

/* ---------------- 向量 ---------------- */
U.v3 = (x=0,y=0,z=0)=>[x,y,z];
U.vadd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
U.vsub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
U.vscale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
U.vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
U.vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
U.vlen=a=>Math.hypot(a[0],a[1],a[2]);
U.vdist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
U.vnorm=a=>{const l=U.vlen(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
U.vlerp=(a,b,t)=>[U.lerp(a[0],b[0],t),U.lerp(a[1],b[1],t),U.lerp(a[2],b[2],t)];

/* ---------------- 矩阵 (列主序 mat4) ---------------- */
U.m4ident=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
U.m4mul=(a,b)=>{
  const o=new Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return o;
};
U.m4mulV=(m,v)=>{
  const x=v[0],y=v[1],z=v[2],w=v[3]===undefined?1:v[3];
  return [
    m[0]*x+m[4]*y+m[8]*z+m[12]*w,
    m[1]*x+m[5]*y+m[9]*z+m[13]*w,
    m[2]*x+m[6]*y+m[10]*z+m[14]*w,
    m[3]*x+m[7]*y+m[11]*z+m[15]*w
  ];
};
U.m4trans=(x,y,z)=>[1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
U.m4scale=(x,y,z)=>[x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];
U.m4rotX=a=>{const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];};
U.m4rotY=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];};
U.m4rotZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];};
U.m4persp=(fovy,aspect,near,far)=>{
  const f=1/Math.tan(fovy/2), nf=1/(near-far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
};
U.m4ortho=(l,r,b,t,n,f)=>[
  2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0,
  -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1];
U.m4lookAt=(eye,center,up)=>{
  const z=U.vnorm(U.vsub(eye,center));
  const x=U.vnorm(U.vcross(up,z));
  const y=U.vcross(z,x);
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -U.vdot(x,eye),-U.vdot(y,eye),-U.vdot(z,eye),1];
};
U.m4invert=m=>{
  const inv=new Array(16);
  inv[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
  inv[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
  inv[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
  inv[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
  inv[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
  inv[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
  inv[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
  inv[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
  inv[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
  inv[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
  inv[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
  inv[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
  inv[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
  inv[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
  inv[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
  inv[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
  let det=m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
  if(!det) return U.m4ident();
  det=1/det;
  for(let i=0;i<16;i++) inv[i]*=det;
  return inv;
};
U.m4transpose=m=>[m[0],m[4],m[8],m[12], m[1],m[5],m[9],m[13], m[2],m[6],m[10],m[14], m[3],m[7],m[11],m[15]];
U.normalMat3=m=>{
  const inv=U.m4invert(m), t=U.m4transpose(inv);
  return [t[0],t[1],t[2], t[4],t[5],t[6], t[8],t[9],t[10]];
};
U.m4fromTRS=(t,r,s)=>{
  let m=U.m4mul(U.m4rotY(r[1]),U.m4rotX(r[0]));
  m=U.m4mul(U.m4rotZ(r[2]),m);
  m=U.m4mul(U.m4scale(s[0],s[1],s[2]),m);
  m=U.m4mul(U.m4trans(t[0],t[1],t[2]),m);
  return m;
};

/* ---------------- 颜色 ---------------- */
U.hex2rgb=h=>{
  h=h.replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const n=parseInt(h,16);
  return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];
};
U.rgb2hex=(r,g,b)=>{
  const c=v=>U.clamp(Math.round(v*255),0,255).toString(16).padStart(2,'0');
  return '#'+c(r)+c(g)+c(b);
};
U.rgb2css=(r,g,b,a=1)=>`rgba(${Math.round(U.clamp(r,0,1)*255)},${Math.round(U.clamp(g,0,1)*255)},${Math.round(U.clamp(b,0,1)*255)},${a})`;
U.hsl2rgb=(h,s,l)=>{
  h=((h%360)+360)%360/360;
  const q=l<.5? l*(1+s) : l+s-l*s, p=2*l-q;
  const f=t=>{ t=((t%1)+1)%1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p; };
  return [f(h+1/3),f(h),f(h-1/3)];
};
U.rgb2hsl=(r,g,b)=>{
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
  if(mx===mn) return [0,0,l];
  const d=mx-mn, s=l>.5? d/(2-mx-mn) : d/(mx+mn);
  let h;
  if(mx===r) h=(g-b)/d+(g<b?6:0);
  else if(mx===g) h=(b-r)/d+2;
  else h=(r-g)/d+4;
  return [h*60,s,l];
};
U.colorLerp=(a,b,t)=>[U.lerp(a[0],b[0],t),U.lerp(a[1],b[1],t),U.lerp(a[2],b[2],t)];

/* ---------------- 随机（可复现） ---------------- */
U.mulberry32=function(seed){
  let a=seed>>>0;
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
};
U.hashStr=s=>{let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
U.makeRng=seed=>U.mulberry32(typeof seed==='string'?U.hashStr(seed):seed);

/* ---------------- 多边形 ---------------- */
U.polyArea=pts=>{
  let a=0;
  for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];a+=p[0]*q[1]-q[0]*p[1];}
  return a/2;
};
U.polyCentroid=pts=>{
  let x=0,y=0;
  for(const p of pts){x+=p[0];y+=p[1];}
  return [x/pts.length,y/pts.length];
};
U.polyBBox=pts=>{
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const p of pts){if(p[0]<x0)x0=p[0];if(p[1]<y0)y0=p[1];if(p[0]>x1)x1=p[0];if(p[1]>y1)y1=p[1];}
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};
};
U.pointInPoly=(pt,pts)=>{
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i][0],yi=pts[i][1],xj=pts[j][0],yj=pts[j][1];
    if(((yi>pt[1])!==(yj>pt[1])) && (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
};
U.distToSeg=(p,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const l2=dx*dx+dy*dy;
  if(l2===0) return Math.hypot(p[0]-a[0],p[1]-a[1]);
  let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2;
  t=U.clamp(t,0,1);
  return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));
};
U.polyLength=pts=>{let l=0;for(let i=0;i<pts.length-1;i++)l+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);return l;};
U.polyPerimeter=pts=>{let l=U.polyLength(pts);if(pts.length>2)l+=Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1]);return l;};

/* Douglas-Peucker 简化 */
U.simplify=(pts,eps)=>{
  if(pts.length<=2) return pts.slice();
  const keep=new Array(pts.length).fill(false);
  keep[0]=keep[pts.length-1]=true;
  const stack=[[0,pts.length-1]];
  while(stack.length){
    const [a,b]=stack.pop();
    let maxD=0,idx=-1;
    for(let i=a+1;i<b;i++){
      const d=U.distToSeg(pts[i],pts[a],pts[b]);
      if(d>maxD){maxD=d;idx=i;}
    }
    if(maxD>eps && idx>0){keep[idx]=true;stack.push([a,idx]);stack.push([idx,b]);}
  }
  const out=[];
  for(let i=0;i<pts.length;i++) if(keep[i]) out.push(pts[i]);
  return out;
};

/* 按弧长重采样闭合/开放折线 */
U.resample=(pts,n,closed=false)=>{
  if(pts.length<2) return pts.slice();
  const seg=[];let total=0;
  const m=pts.length;
  const count=closed?m:m-1;
  for(let i=0;i<count;i++){
    const a=pts[i],b=pts[(i+1)%m];
    const l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    seg.push(l);total+=l;
  }
  if(total===0) return Array.from({length:n},()=>pts[0].slice());
  const out=[];
  let segIdx=0,segStart=0;
  for(let i=0;i<n;i++){
    const target=total*i/n;
    while(segIdx<seg.length-1 && segStart+seg[segIdx]<target){segStart+=seg[segIdx];segIdx++;}
    const a=pts[segIdx],b=pts[(segIdx+1)%m];
    const t=seg[segIdx]>0?(target-segStart)/seg[segIdx]:0;
    out.push([U.lerp(a[0],b[0],t),U.lerp(a[1],b[1],t)]);
  }
  return out;
};

/* ---------------- 扫描线三角化（支持孔洞） ---------------- */
function intervalsAtY(contours,y){
  const xs=[];
  for(const c of contours){
    const pts=c.pts, n=pts.length, closed=c.closed!==false;
    const m=closed?n:n-1;
    for(let i=0;i<m;i++){
      const a=pts[i],b=pts[(i+1)%n];
      if((a[1]<=y && b[1]>y)||(b[1]<=y && a[1]>y)){
        const t=(y-a[1])/(b[1]-a[1]);
        xs.push(a[0]+t*(b[0]-a[0]));
      }
    }
  }
  xs.sort((a,b)=>a-b);
  const out=[];
  for(let i=0;i+1<xs.length;i+=2) out.push([xs[i],xs[i+1]]);
  return out;
}
/* 扫描线三角化：逐条带配对区间（支持孔洞与凹部） */
U.triangulate=function(contours){
  const ys=new Set();
  for(const c of contours) for(const p of c.pts) ys.add(Math.round(p[1]*1000)/1000);
  if(ys.size<2) return [];
  const yArr=[...ys].sort((a,b)=>a-b);
  const tris=[];
  for(let i=0;i<yArr.length-1;i++){
    const ya=yArr[i], yb=yArr[i+1];
    if(yb-ya<1e-6) continue;
    const ia=intervalsAtY(contours,ya+1e-7), ib=intervalsAtY(contours,yb-1e-7);
    // 收集该条带内所有 x 端点并排序
    const xs=new Set();
    for(const [a,b] of ia){xs.add(a);xs.add(b);}
    for(const [a,b] of ib){xs.add(a);xs.add(b);}
    const xArr=[...xs].sort((a,b)=>a-b);
    for(let j=0;j<xArr.length-1;j++){
      const xa=xArr[j],xb=xArr[j+1];
      if(xb-xa<1e-9) continue;
      const xm=(xa+xb)/2;
      const inA=ia.some(([a,b])=>xm>=a-1e-9&&xm<=b+1e-9);
      const inB=ib.some(([a,b])=>xm>=a-1e-9&&xm<=b+1e-9);
      if(inA&&inB){
        tris.push([xa,ya],[xb,yb],[xb,ya], [xa,ya],[xa,yb],[xb,yb]);
      }else if(inA&&!inB){
        // 顶点在 ya：找出 ib 中最近的端点作为收缩点
        let best=null,bd=1e18;
        for(const [a,b] of ib){for(const x of [a,b]){const d=Math.abs(x-xm);if(d<bd){bd=d;best=x;}}}
        if(best!==null) tris.push([xa,ya],[xb,ya],[best,yb]);
      }else if(!inA&&inB){
        let best=null,bd=1e18;
        for(const [a,b] of ia){for(const x of [a,b]){const d=Math.abs(x-xm);if(d<bd){bd=d;best=x;}}}
        if(best!==null) tris.push([xa,yb],[xb,yb],[best,ya]);
      }
    }
  }
  return tris;
};

/* ---------------- 轮廓追踪（Moore 邻域，用于字形提取） ---------------- */
U.traceMaskContours=function(mask,w,h,threshold=128){
  const at=(x,y)=> (x<0||y<0||x>=w||y>=h)?0:mask[y*w+x];
  const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]; // E SE S SW W NW N NE
  const contours=[];
  const visited=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(at(x,y)<threshold || visited[y*w+x]) continue;
    // 找到边界起点：该像素为实体且西侧为背景
    if(at(x-1,y)>=threshold){ visited[y*w+x]=1; continue; }
    // Moore 追踪
    const contour=[];
    let startX=x,startY=y;
    let cx=x,cy=y;
    let bDir=6; // 从 N 开始搜索（因为西侧是背景）
    let first=true;
    let prevFirst=null;
    const maxIter=w*h*4;
    let iter=0;
    while(iter++<maxIter){
      contour.push([cx,cy]);
      // 从 bDir 之后顺时针找下一个实体像素
      let found=-1;
      for(let k=0;k<8;k++){
        const d=(bDir+1+k)%8;
        const nx=cx+dirs[d][0],ny=cy+dirs[d][1];
        if(at(nx,ny)>=threshold){found=d;break;}
      }
      if(found<0) break;
      const nx=cx+dirs[found][0],ny=cy+dirs[found][1];
      // 记录访问
      visited[cy*w+cx]=1;
      // 回溯方向 = 找到方向的反方向再后退一格
      const back=(found+4)%8;
      bDir=(back+1)%8; // 下一次搜索起点
      const px=cx,py=cy;
      cx=nx;cy=ny;
      if(!first && cx===startX && cy===startY){
        // Jacob 停止准则：再次以相同方向回到起点
        break;
      }
      if(first){prevFirst=[cx,cy];first=false;}
      if(contour.length>4*w*h) break;
    }
    if(contour.length>3) contours.push(contour);
    // 标记内部像素为已访问（泛洪）
    // 简化：将轮廓包围的像素标记
    floodMark(mask,w,h,threshold,visited,contour);
  }
  return contours;
};
function floodMark(mask,w,h,threshold,visited,contour){
  if(contour.length<3) return;
  let x0=1e9,y0=1e9,x1=-1e18,y1=-1e18;
  for(const p of contour){if(p[0]<x0)x0=p[0];if(p[1]<y0)y0=p[1];if(p[0]>x1)x1=p[0];if(p[1]>y1)y1=p[1];}
  const poly=contour;
  for(let y=Math.max(0,Math.floor(y0));y<=Math.min(h-1,Math.ceil(y1));y++){
    for(let x=Math.max(0,Math.floor(x0));x<=Math.min(w-1,Math.ceil(x1));x++){
      if(visited[y*w+x]) continue;
      if(mask[y*w+x]<threshold) continue;
      if(U.pointInPoly([x,y],poly)) visited[y*w+x]=1;
    }
  }
}

/* ---------------- 路径描边轮廓 ---------------- */
U.strokeOutline=function(pts,width,opts={}){
  const closed=!!opts.closed;
  const cap=opts.cap||'round';
  const join=opts.join||'round';
  const hw=width/2;
  const n=pts.length;
  if(n<2) return [];
  const segs=[];
  const m=closed?n:n-1;
  for(let i=0;i<m;i++){
    const a=pts[i],b=pts[(i+1)%n];
    let dx=b[0]-a[0],dy=b[1]-a[1];
    const l=Math.hypot(dx,dy)||1;
    segs.push({a,b,dx:dx/l,dy:dy/l,nx:-dy/l,ny:dx/l});
  }
  const left=[],right=[];
  const pushL=p=>left.push(p), pushR=p=>right.push(p);
  for(let i=0;i<segs.length;i++){
    const s=segs[i];
    const lp=[s.a[0]+s.nx*hw,s.a[1]+s.ny*hw];
    const rp=[s.a[0]-s.nx*hw,s.a[1]-s.ny*hw];
    if(i===0){
      pushL(lp);pushR(rp);
    }else{
      const p=segs[i-1];
      // 角点处平均法线
      let nx=p.nx+s.nx, ny=p.ny+s.ny;
      const nl=Math.hypot(nx,ny);
      if(nl<1e-6){nx=s.nx;ny=s.ny;}
      else{nx/=nl;ny/=nl;}
      const cos=Math.max(0.25, nx*s.nx+ny*s.ny);
      const scale=hw/cos;
      left[left.length-1]=[s.a[0]+nx*scale,s.a[1]+ny*scale];
      right[right.length-1]=[s.a[0]-nx*scale,s.a[1]-ny*scale];
      if(join==='round'){
        // 在角点插入圆弧
        const a0=Math.atan2(p.ny,p.nx), a1=Math.atan2(s.ny,s.nx);
        let da=a1-a0;
        while(da>Math.PI)da-=U.TAU;
        while(da<-Math.PI)da+=U.TAU;
        const steps=Math.max(2,Math.ceil(Math.abs(da)/0.35));
        for(let k=1;k<steps;k++){
          const t=k/steps, ang=a0+da*t;
          left.push([s.a[0]+Math.cos(ang)*hw,s.a[1]+Math.sin(ang)*hw]);
        }
      }
    }
    pushL([s.b[0]+s.nx*hw,s.b[1]+s.ny*hw]);
    pushR([s.b[0]-s.nx*hw,s.b[1]-s.ny*hw]);
  }
  const contour=[];
  if(closed){
    contour.push(...left);
    contour.push(...right.reverse());
    return [{pts:contour,closed:true}];
  }
  // 开放：起点圆帽 -> 左侧 -> 终点圆帽 -> 右侧
  const capPts=(c,dir,normal)=>{
    const out=[];
    if(cap==='round'){
      const a0=Math.atan2(normal[1],normal[0]);
      const steps=Math.max(3,Math.ceil(Math.PI/0.3));
      for(let k=0;k<=steps;k++){
        const ang=a0+dir*Math.PI*(k/steps);
        out.push([c[0]+Math.cos(ang)*hw,c[1]+Math.sin(ang)*hw]);
      }
    }else if(cap==='square'){
      out.push([c[0]+normal[0]*dir*hw*1.2,c[1]+normal[1]*dir*hw*1.2]);
    }
    return out;
  };
  const s0=segs[0], sN=segs[segs.length-1];
  contour.push(...capPts(s0.a,-1,[s0.nx,s0.ny]));
  contour.push(...left);
  contour.push(...capPts(sN.b,1,[sN.nx,sN.ny]));
  contour.push(...right.reverse());
  return [{pts:contour,closed:true}];
};

/* ---------------- 形状路径构建 ---------------- */
U.contourFromPts=(pts,closed=true)=>({pts:pts.map(p=>[p[0],p[1]]),closed});
U.rectContour=(x,y,w,h)=>U.contourFromPts([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true);
U.ellipseContour=(cx,cy,rx,ry,seg=48)=>{
  const pts=[];
  for(let i=0;i<seg;i++){const a=i/seg*U.TAU;pts.push([cx+Math.cos(a)*rx,cy+Math.sin(a)*ry]);}
  return U.contourFromPts(pts,true);
};
U.flattenBezier=(p0,c0,c1,p1,seg=24)=>{
  const out=[];
  for(let i=0;i<=seg;i++){
    const t=i/seg, mt=1-t;
    const x=mt*mt*mt*p0[0]+3*mt*mt*t*c0[0]+3*mt*t*t*c1[0]+t*t*t*p1[0];
    const y=mt*mt*mt*p0[1]+3*mt*mt*t*c0[1]+3*mt*t*t*c1[1]+t*t*t*p1[1];
    out.push([x,y]);
  }
  return out;
};
U.flattenPathData=function(pd,seg=20){
  // pd: {closed, pts:[{p,i,o}]}
  const n=pd.pts.length;
  if(n<2) return [];
  const out=[];
  const count=pd.closed?n:n-1;
  for(let k=0;k<count;k++){
    const a=pd.pts[k], b=pd.pts[(k+1)%n];
    const p0=a.p;
    const c0=a.o||a.p, c1=b.i||b.p, p1=b.p;
    const segPts=U.flattenBezier(p0,c0,c1,p1,seg);
    if(k>0) segPts.shift();
    out.push(...segPts);
  }
  return out;
};
U.pathDataFromPoly=(pts,closed=true)=>({closed,pts:pts.map(p=>({p:[p[0],p[1]],i:null,o:null}))});
U.pathDataBounds=function(pds){
  let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
  for(const pd of pds) for(const q of pd.pts){
    for(const p of [q.p,q.i,q.o]) if(p){if(p[0]<x0)x0=p[0];if(p[1]<y0)y0=p[1];if(p[0]>x1)x1=p[0];if(p[1]>y1)y1=p[1];}
  }
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};
};

/* ---------------- 时间格式 ---------------- */
U.formatTime=function(t,fps){
  t=Math.max(0,t);
  const f=Math.floor(t*fps);
  const fr=f%fps, total=Math.floor(f/fps);
  const s=total%60, m=Math.floor(total/60)%60, h=Math.floor(total/3600);
  const pad=(n,l=2)=>String(n).padStart(l,'0');
  return `${h}:${pad(m)}:${pad(s)}:${pad(fr)}`;
};
U.formatSec=t=>t.toFixed(3)+'s';

/* ---------------- 其他 ---------------- */
U.uid=(()=>{let c=0;return (p='id')=>p+'_'+(++c)+'_'+Math.floor(Math.random()*1e6).toString(36);})();
U.deepClone=o=>{try{return JSON.parse(JSON.stringify(o));}catch(e){return o;}};
U.debounce=(fn,ms)=>{let h;return(...a)=>{clearTimeout(h);h=setTimeout(()=>fn(...a),ms);};};
U.escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* 值曲线：关键点求值（含贝塞尔缓动） */
U.evalKeys=function(keys,t,opts={}){
  if(!keys||!keys.length) return opts.def;
  if(keys.length===1) return keys[0].v;
  const sorted=keys;
  if(t<=sorted[0].t) return sorted[0].v;
  if(t>=sorted[sorted.length-1].t) return sorted[sorted.length-1].v;
  let i=0;
  while(i<sorted.length-1 && sorted[i+1].t<=t) i++;
  const a=sorted[i], b=sorted[i+1];
  if(a.interp==='hold') return a.v;
  const span=b.t-a.t;
  let p= span>1e-9 ? (t-a.t)/span : 1;
  let e;
  if(a.interp==='bezier'){
    e=U.bezierEase(p, a.easeOut||[0.42,0], b.easeIn||[0.58,1]);
  }else{
    e=p;
  }
  if(Array.isArray(a.v)){
    return a.v.map((av,k)=>U.lerp(av,b.v[k],e));
  }
  return U.lerp(a.v,b.v,e);
};
U.bezierEase=function(x,p1,p2){
  // 解三次贝塞尔 x(t)=x, y(t) 作为缓动
  let t=x;
  for(let i=0;i<8;i++){
    const mt=1-t;
    const cx=3*mt*mt*t*p1[0]+3*mt*t*t*p2[0]+t*t*t;
    const cxDer=3*mt*mt*p1[0]+6*mt*t*(p2[0]-p1[0])+3*t*t*(1-p2[0]);
    if(Math.abs(cxDer)<1e-6) break;
    t-= (cx-x)/cxDer;
    t=U.clamp(t,0,1);
  }
  const mt=1-t;
  return 3*mt*mt*t*p1[1]+3*mt*t*t*p2[1]+t*t*t;
};
U.easePreset=(name)=>{
  switch(name){
    case 'linear': return null;
    case 'easeIn': return [[0.42,0],[1,1]];
    case 'easeOut': return [[0,0],[0.58,1]];
    case 'easeInOut': return [[0.42,0],[0.58,1]];
    case 'easeOutCubic': return [[0,0],[0.2,1]];
    case 'hold': return 'hold';
    default: return [[0.42,0],[0.58,1]];
  }
};

})();
