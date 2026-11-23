/* 铸帧 ForgeFrame · 基础工具：数学 / 随机 / 噪声 / 贝塞尔 / 三角化 / 多边形布尔 */
"use strict";
window.FF = window.FF || {};
(function(){
const FF = window.FF;
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const TAU=Math.PI*2, DEG=Math.PI/180;
let _uid=1; const uid=(p)=>(p||'id')+(_uid++)+'_'+Math.floor(Math.random()*1e6).toString(36);
FF.util={clamp,lerp,smooth,TAU,DEG,uid};

/* ---------- 向量 ---------- */
const V={
  add:(a,b)=>a.map((v,i)=>v+(b[i]||0)),
  sub:(a,b)=>a.map((v,i)=>v-(b[i]||0)),
  mul:(a,s)=>a.map(v=>v*s),
  dot:(a,b)=>a.reduce((s,v,i)=>s+v*(b[i]||0),0),
  len:(a)=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)),
  dist:(a,b)=>V.len(V.sub(a,b)),
  norm:(a)=>{const l=V.len(a)||1; return a.map(v=>v/l);},
  lerp:(a,b,t)=>a.map((v,i)=>lerp(v,b[i]!==undefined?b[i]:v,t)),
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
};
FF.V=V;

/* ---------- 4x4 矩阵（列主序，与 WebGL 一致） ---------- */
const M4={
  ident:()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  mul(a,b){ const o=new Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; }
    return o; },
  translate:(x,y,z)=>[1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1],
  scale:(x,y,z)=>[x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1],
  rotX(a){const c=Math.cos(a),s=Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];},
  rotY(a){const c=Math.cos(a),s=Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];},
  rotZ(a){const c=Math.cos(a),s=Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];},
  perspective(fovy,aspect,near,far){ const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]; },
  ortho(l,r,b,t,n,f){ return [2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]; },
  lookAt(eye,target,up){
    let z=V.norm(V.sub(eye,target)); if(V.len(z)<1e-9) z=[0,0,1];
    let x=V.norm(V.cross(up,z)); if(V.len(x)<1e-9){ x=V.norm(V.cross([0,0,1],z)); if(V.len(x)<1e-9) x=[1,0,0]; }
    const y=V.cross(z,x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1];
  },
  transformPoint(m,p){ const [x,y,z]=p;
    const w=m[3]*x+m[7]*y+m[11]*z+m[15]||1;
    return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w]; },
  transformDir(m,p){ const [x,y,z]=p;
    return [m[0]*x+m[4]*y+m[8]*z, m[1]*x+m[5]*y+m[9]*z, m[2]*x+m[6]*y+m[10]*z]; },
  invert(m){
    const a=m, o=new Array(16);
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],
      a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,
      b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,
      b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if(!det) return M4.ident(); det=1/det;
    o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det;
    o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
    o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det;
    o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
    o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det;
    o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
    o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
    o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
    return o;
  }
};
FF.M4=M4;

/* ---------- 可复现随机与噪声 ---------- */
function hashN(n){ n=(n^61)^(n>>>16); n=(n+(n<<3))|0; n=n^(n>>>4); n=Math.imul(n,0x27d4eb2d); n=n^(n>>>15); return (n>>>0)/4294967295; }
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
function mulberry(seed){ let a=seed>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
// 平滑一维值噪声（可复现）
function noise1(x,seed){ const i=Math.floor(x), f=x-i, u=smooth(f);
  return lerp(hashN(i*374761393+seed*668265263), hashN((i+1)*374761393+seed*668265263), u)*2-1; }
function fbm1(x,seed,oct){ let s=0,a=1,f=1,n=0; for(let i=0;i<(oct||3);i++){ s+=noise1(x*f,seed+i*101)*a; n+=a; a*=.5; f*=2.03; } return s/n; }
function noise3(x,y,z,seed){
  const h=(i,j,k)=>hashN((i*73856093)^(j*19349663)^(k*83492791)^(seed*2654435761));
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
  const u=smooth(x-xi),v=smooth(y-yi),w=smooth(z-zi);
  let s=0;
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    s+=h(xi+i,yi+j,zi+k)*(i?u:1-u)*(j?v:1-v)*(k?w:1-w);
  }
  return s*2-1;
}
FF.rng={hashN,hashStr,mulberry,noise1,fbm1,noise3};

/* ---------- 贝塞尔 ---------- */
function cubicPt(p0,p1,p2,p3,t){ const u=1-t;
  return [u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],
          u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]; }
function cubicPt3(p0,p1,p2,p3,t){ const u=1-t; const o=[];
  for(let i=0;i<3;i++) o[i]=u*u*u*p0[i]+3*u*u*t*p1[i]+3*u*t*t*p2[i]+t*t*t*p3[i]; return o; }
// 由归一化控制点 (x1,y1),(x2,y2) 求 y(x)
function bezierEase(x,x1,y1,x2,y2){
  if(x<=0)return 0; if(x>=1)return 1;
  let t=x;
  for(let i=0;i<8;i++){
    const cx=3*(1-t)*(1-t)*t*x1+3*(1-t)*t*t*x2+t*t*t - x;
    const dx=3*(1-t)*(1-t)*x1+6*(1-t)*t*(x2-x1)+3*t*t*(1-x2);
    if(Math.abs(dx)<1e-7)break;
    t-=cx/dx; t=clamp(t,0,1);
  }
  const u=1-t; return 3*u*u*t*y1+3*u*t*t*y2+t*t*t;
}
FF.bez={cubicPt,cubicPt3,bezierEase};

/* ---------- 路径数据 ----------
  path = { c:[ {closed, p:[[x,y,inX,inY,outX,outY],...] } ] }   手柄为绝对坐标 */
const Path={
  clone(p){ return JSON.parse(JSON.stringify(p)); },
  empty(){ return {c:[]}; },
  rect(x,y,w,h,r){
    r=Math.min(r||0,Math.abs(w)/2,Math.abs(h)/2);
    if(r<=0.01) return {c:[{closed:true,p:[[x,y,x,y,x,y],[x+w,y,x+w,y,x+w,y],[x+w,y+h,x+w,y+h,x+w,y+h],[x,y+h,x,y+h,x,y+h]]}]};
    const k=r*0.5523;
    return {c:[{closed:true,p:[
      [x+r,y, x+r-k,y, x+r+k,y],[x+w-r,y, x+w-r-k,y, x+w-r+k,y],
      [x+w,y+r, x+w,y+r-k, x+w,y+r+k],[x+w,y+h-r, x+w,y+h-r-k, x+w,y+h-r+k],
      [x+w-r,y+h, x+w-r-k,y+h, x+w-r+k,y+h],[x+r,y+h, x+r-k,y+h, x+r+k,y+h],
      [x,y+h-r, x,y+h-r-k, x,y+h-r+k],[x,y+r, x,y+r-k, x,y+r+k]]}]};
  },
  ellipse(cx,cy,rx,ry){ const k=0.5523;
    return {c:[{closed:true,p:[
      [cx+rx,cy, cx+rx,cy-ry*k, cx+rx,cy+ry*k],
      [cx,cy+ry, cx+rx*k,cy+ry, cx-rx*k,cy+ry],
      [cx-rx,cy, cx-rx,cy+ry*k, cx-rx,cy-ry*k],
      [cx,cy-ry, cx-rx*k,cy-ry, cx+rx*k,cy-ry]]}]};
  },
  poly(cx,cy,r,n,rot,inner){ const pts=[]; const m=inner?n*2:n;
    for(let i=0;i<m;i++){ const a=(rot||0)+i*TAU/m; const rr=inner?(i%2?inner:r):r;
      const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr; pts.push([x,y,x,y,x,y]); }
    return {c:[{closed:true,p:pts}]};
  },
  // 将轮廓展平为折线 [x,y,...]
  flatten(contour,tol){
    tol=tol||0.6; const pts=contour.p, out=[]; const n=pts.length;
    const segs=contour.closed?n:n-1;
    for(let i=0;i<segs;i++){
      const a=pts[i], b=pts[(i+1)%n];
      const p0=[a[0],a[1]], p1=[a[4],a[5]], p2=[b[2],b[3]], p3=[b[0],b[1]];
      const flat=Math.abs(p1[0]-p0[0])<1e-6&&Math.abs(p1[1]-p0[1])<1e-6&&Math.abs(p2[0]-p3[0])<1e-6&&Math.abs(p2[1]-p3[1])<1e-6;
      if(flat){ out.push(p0[0],p0[1]); continue; }
      const approx=V.dist(p0,p1)+V.dist(p1,p2)+V.dist(p2,p3);
      const steps=clamp(Math.ceil(approx/(tol*2)),4,64);
      for(let s=0;s<steps;s++){ const q=cubicPt(p0,p1,p2,p3,s/steps); out.push(q[0],q[1]); }
    }
    if(!contour.closed){ const l=pts[n-1]; out.push(l[0],l[1]); }
    return out;
  },
  flattenAll(path,tol){ return path.c.map(c=>Path.flatten(c,tol)); },
  length(flat){ let L=0; for(let i=2;i<flat.length;i+=2) L+=Math.hypot(flat[i]-flat[i-2],flat[i+1]-flat[i-1]); return L; },
  // 按弧长采样折线，返回 [x,y,切向x,切向y]
  sampleFlat(flat,dist,closed){
    const n=flat.length/2; if(n<2) return [flat[0]||0,flat[1]||0,1,0];
    let acc=0;
    for(let i=1;i<n;i++){
      const x0=flat[(i-1)*2],y0=flat[(i-1)*2+1],x1=flat[i*2],y1=flat[i*2+1];
      const L=Math.hypot(x1-x0,y1-y0);
      if(acc+L>=dist||i===n-1){ const t=L>0?clamp((dist-acc)/L,0,1):0;
        const dx=(x1-x0)/(L||1),dy=(y1-y0)/(L||1);
        return [lerp(x0,x1,t),lerp(y0,y1,t),dx,dy]; }
      acc+=L;
    }
    return [flat[0],flat[1],1,0];
  },
  area(flat){ let a=0; const n=flat.length/2;
    for(let i=0;i<n;i++){ const j=(i+1)%n; a+=flat[i*2]*flat[j*2+1]-flat[j*2]*flat[i*2+1]; } return a/2; },
  pointIn(flat,x,y){ let inside=false; const n=flat.length/2;
    for(let i=0,j=n-1;i<n;j=i++){
      const xi=flat[i*2],yi=flat[i*2+1],xj=flat[j*2],yj=flat[j*2+1];
      if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
    } return inside; },
  bounds(flat){ let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
    for(let i=0;i<flat.length;i+=2){ x0=Math.min(x0,flat[i]); x1=Math.max(x1,flat[i]); y0=Math.min(y0,flat[i+1]); y1=Math.max(y1,flat[i+1]); }
    if(x0>x1) return [0,0,0,0]; return [x0,y0,x1,y1]; },
  transform(path,m){ // m: 2D 仿射 [a,b,c,d,e,f]
    const tp=(x,y)=>[m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
    const out={c:path.c.map(c=>({closed:c.closed,p:c.p.map(pt=>{
      const a=tp(pt[0],pt[1]),b=tp(pt[2],pt[3]),d=tp(pt[4],pt[5]);
      return [a[0],a[1],b[0],b[1],d[0],d[1]]; })}))};
    return out;
  },
  affine(px,py,rot,sx,sy,ax,ay){ // 先平移到锚点原点再缩放旋转
    const c=Math.cos(rot),s=Math.sin(rot);
    return [c*sx,s*sx,-s*sy,c*sy, px-ax*c*sx+ay*s*sy, py-ax*s*sx-ay*c*sy];
  },
  // 折线重采样为 n 个点
  resample(flat,n,closed){
    const L=Path.length(flat); const out=[];
    for(let i=0;i<n;i++){ const q=Path.sampleFlat(flat,(closed?i/n:i/(n-1))*L,closed); out.push(q[0],q[1]); }
    return out;
  },
  // 路径形变插值：保持轮廓/孔洞对应
  lerpPaths(a,b,t){
    if(!a||!a.c.length) return Path.clone(b);
    if(!b||!b.c.length) return Path.clone(a);
    const out={c:[]};
    const n=Math.max(a.c.length,b.c.length);
    for(let i=0;i<n;i++){
      const ca=a.c[Math.min(i,a.c.length-1)], cb=b.c[Math.min(i,b.c.length-1)];
      const N=Math.max(ca.p.length, cb.p.length, 8);
      const fa=Path.resample(Path.flatten(ca,0.8),N,ca.closed);
      const fb=Path.resample(Path.flatten(cb,0.8),N,cb.closed);
      // 旋转起点对齐，减少扭转
      let best=0,bd=1e18;
      for(let s=0;s<N;s++){ let d=0;
        for(let k=0;k<N;k+=4){ const j=(k+s)%N; d+=(fa[k*2]-fb[j*2])**2+(fa[k*2+1]-fb[j*2+1])**2; }
        if(d<bd){bd=d;best=s;} }
      const pts=[];
      for(let k=0;k<N;k++){ const j=(k+best)%N;
        const x=lerp(fa[k*2],fb[j*2],t), y=lerp(fa[k*2+1],fb[j*2+1],t);
        pts.push([x,y,x,y,x,y]); }
      // 平滑手柄（Catmull-Rom 转贝塞尔）
      for(let k=0;k<N;k++){ const p=pts[k], prev=pts[(k-1+N)%N], next=pts[(k+1)%N];
        p[2]=p[0]-(next[0]-prev[0])/6; p[3]=p[1]-(next[1]-prev[1])/6;
        p[4]=p[0]+(next[0]-prev[0])/6; p[5]=p[1]+(next[1]-prev[1])/6; }
      out.c.push({closed:ca.closed&&cb.closed,p:pts});
    }
    return out;
  },
  // 折线偏移（用于倒角）：沿角平分线
  offsetPoly(flat,d){
    const n=flat.length/2; if(n<3) return flat.slice();
    const area=Path.area(flat); const sign=area>0?1:-1; const out=[];
    for(let i=0;i<n;i++){
      const p=(i-1+n)%n, q=(i+1)%n;
      let d1x=flat[i*2]-flat[p*2], d1y=flat[i*2+1]-flat[p*2+1];
      let d2x=flat[q*2]-flat[i*2], d2y=flat[q*2+1]-flat[i*2+1];
      const l1=Math.hypot(d1x,d1y)||1, l2=Math.hypot(d2x,d2y)||1;
      d1x/=l1; d1y/=l1; d2x/=l2; d2y/=l2;
      let nx=(-d1y-d2y), ny=(d1x+d2x); const nl=Math.hypot(nx,ny);
      if(nl<1e-6){ nx=-d1y; ny=d1x; }
      else { nx/=nl; ny/=nl; }
      const cosHalf=Math.max(0.35, (nx*-d1y+ny*d1x));
      const dd=sign*d/cosHalf;
      out.push(flat[i*2]+nx*dd, flat[i*2+1]+ny*dd);
    }
    return out;
  },
  // 修剪折线：返回 [startFrac,endFrac] 的子折线（可跨闭合缝）
  trimFlat(flat,s,e,closed){
    const L=Path.length(flat); if(L<=0) return [];
    s=clamp(s,0,1); e=clamp(e,0,1);
    if(e<s){ if(!closed) return []; const a=Path.trimFlat(flat,s,1,true), b=Path.trimFlat(flat,0,e,true);
      return a.concat(b.slice(2)); }
    const d0=s*L, d1=e*L; const out=[]; const n=flat.length/2; let acc=0;
    const segN=closed?n:n-1;
    for(let i=0;i<segN;i++){
      const j=(i+1)%n;
      const x0=flat[i*2],y0=flat[i*2+1],x1=flat[j*2],y1=flat[j*2+1];
      const l=Math.hypot(x1-x0,y1-y0); const a0=acc, a1=acc+l; acc=a1;
      if(a1<d0||a0>d1||l<=0) continue;
      const t0=clamp((d0-a0)/l,0,1), t1=clamp((d1-a0)/l,0,1);
      if(out.length===0) out.push(lerp(x0,x1,t0),lerp(y0,y1,t0));
      out.push(lerp(x0,x1,t1),lerp(y0,y1,t1));
    }
    return out;
  },
  // 折线转描边四边形条带
  strokeQuads(flat,width,closed){
    const n=flat.length/2; if(n<2) return [];
    const hw=width/2, out=[]; const L=[],R=[];
    for(let i=0;i<n;i++){
      const p=(i-1+n)%n, q=(i+1)%n;
      let dx,dy;
      if(!closed&&i===0){ dx=flat[2]-flat[0]; dy=flat[3]-flat[1]; }
      else if(!closed&&i===n-1){ dx=flat[i*2]-flat[p*2]; dy=flat[i*2+1]-flat[p*2+1]; }
      else { dx=flat[q*2]-flat[p*2]; dy=flat[q*2+1]-flat[p*2+1]; }
      const l=Math.hypot(dx,dy)||1; const nx=-dy/l*hw, ny=dx/l*hw;
      L.push(flat[i*2]+nx,flat[i*2+1]+ny); R.push(flat[i*2]-nx,flat[i*2+1]-ny);
    }
    const segs=closed?n:n-1;
    for(let i=0;i<segs;i++){ const j=(i+1)%n;
      out.push(L[i*2],L[i*2+1], R[i*2],R[i*2+1], L[j*2],L[j*2+1]);
      out.push(R[i*2],R[i*2+1], R[j*2],R[j*2+1], L[j*2],L[j*2+1]); }
    return out;
  }
};
FF.Path=Path;

/* ---------- 耳切三角化（支持孔洞） ---------- */
function earcut(rings){
  rings=rings.filter(r=>r.length>=6);
  const verts=[]; const bounds=[];
  for(const r of rings){ bounds.push([verts.length/2, verts.length/2+r.length/2]); for(let i=0;i<r.length;i++) verts.push(r[i]); }
  if(!bounds.length) return {verts:[], idx:[]};
  const X=i=>verts[i*2], Y=i=>verts[i*2+1];
  const area2=(a,b,c)=>(X(b)-X(a))*(Y(c)-Y(a))-(Y(b)-Y(a))*(X(c)-X(a));
  const segCross=(a,b,c,d)=>{
    const d1=area2(c,d,a), d2=area2(c,d,b), d3=area2(a,b,c), d4=area2(a,b,d);
    return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));
  };
  const allEdges=[];
  for(const [s,e] of bounds) for(let i=s;i<e;i++) allEdges.push([i, i+1<e?i+1:s]);
  const bridgeValid=(hi,v)=>{
    for(const [a,b] of allEdges){
      if(a===hi||b===hi||a===v||b===v) continue;
      if(segCross(hi,v,a,b)) return false;
    }
    const mx=(X(hi)+X(v))/2, my=(Y(hi)+Y(v))/2;
    let inside=false;
    for(const [s,e] of bounds){
      const flat=[]; for(let i=s;i<e;i++) flat.push(X(i),Y(i));
      if(Path.pointIn(flat,mx,my)) inside=!inside;
    }
    return inside;
  };
  // 外环方向规范化（面积>0）
  {
    const [s,e]=bounds[0]; let a=0;
    for(let i=s;i<e;i++){ const j=i+1<e?i+1:s; a+=X(i)*Y(j)-X(j)*Y(i); }
    if(a<0){ const seg=verts.slice(s*2,e*2); const rev=[];
      for(let i=seg.length-2;i>=0;i-=2) rev.push(seg[i],seg[i+1]);
      for(let i=0;i<rev.length;i++) verts[s*2+i]=rev[i]; }
  }
  let loop=[]; for(let i=bounds[0][0];i<bounds[0][1];i++) loop.push(i);
  for(let h=1;h<bounds.length;h++){
    const [hs,he]=bounds[h];
    let hi=hs; for(let i=hs;i<he;i++) if(X(i)>X(hi)) hi=i;
    let best=-1, bd=1e18;
    for(const v of loop){
      const d=(X(v)-X(hi))**2+(Y(v)-Y(hi))**2;
      if(d<bd&&bridgeValid(hi,v)){ bd=d; best=v; }
    }
    if(best<0){ for(const v of loop){ const d=(X(v)-X(hi))**2+(Y(v)-Y(hi))**2; if(d<bd){bd=d;best=v;} } }
    if(best<0) continue;
    const bpos=loop.indexOf(best), hpos=hi-hs, hn=he-hs;
    const holeLoop=[]; for(let k=0;k<hn;k++) holeLoop.push(hs+(hpos+k)%hn);
    const dupH=verts.length/2; verts.push(X(hi),Y(hi));
    const dupB=verts.length/2; verts.push(X(best),Y(best));
    loop=loop.slice(0,bpos+1).concat(holeLoop,[dupH,dupB],loop.slice(bpos+1));
  }
  // 耳切
  const n=loop.length;
  const next=new Array(n), prev=new Array(n);
  for(let i=0;i<n;i++){ next[i]=(i+1)%n; prev[i]=(i-1+n)%n; }
  const inTri=(a,b,c,p)=>{
    const d1=area2(a,b,p),d2=area2(b,c,p),d3=area2(c,a,p);
    const neg=(d1<-1e-9)||(d2<-1e-9)||(d3<-1e-9), pos=(d1>1e-9)||(d2>1e-9)||(d3>1e-9);
    return !(neg&&pos);
  };
  const idx=[]; let count=n, cur=0, guard=0, sinceCut=0;
  while(count>3&&guard++<n*n+200){
    const a=loop[prev[cur]], b=loop[cur], c=loop[next[cur]];
    let ok=area2(a,b,c)>1e-9;
    if(ok){
      let v=next[next[cur]];
      while(v!==prev[cur]){
        const pv=loop[v];
        if(area2(loop[prev[v]],pv,loop[next[v]])<0 && inTri(a,b,c,pv)){ ok=false; break; }
        v=next[v];
      }
    }
    if(ok){
      idx.push(a,b,c);
      next[prev[cur]]=next[cur]; prev[next[cur]]=prev[cur];
      cur=next[cur]; count--; sinceCut=0;
    } else {
      cur=next[cur]; sinceCut++;
      if(sinceCut>count){ // 退化兜底
        idx.push(loop[prev[cur]],loop[cur],loop[next[cur]]);
        next[prev[cur]]=next[cur]; prev[next[cur]]=prev[cur];
        cur=next[cur]; count--; sinceCut=0;
      }
    }
  }
  if(count===3) idx.push(loop[prev[cur]],loop[cur],loop[next[cur]]);
  return {verts, idx};
}
FF.earcut=earcut;

/* ---------- 多边形布尔（中点分类法，支持多环与孔洞） ---------- */
function segIntersect(p0,p1,p2,p3){
  const d1x=p1[0]-p0[0],d1y=p1[1]-p0[1],d2x=p3[0]-p2[0],d2y=p3[1]-p2[1];
  const den=d1x*d2y-d1y*d2x;
  if(Math.abs(den)<1e-12) return null;
  const t=((p2[0]-p0[0])*d2y-(p2[1]-p0[1])*d2x)/den;
  const u=((p2[0]-p0[0])*d1y-(p2[1]-p0[1])*d1x)/den;
  const eps=1e-9;
  if(t<=eps||t>=1-eps||u<=eps||u>=1-eps) return null;
  return [p0[0]+d1x*t,p0[1]+d1y*t,t,u];
}
function splitRing(ring, otherRings){
  const n=ring.length/2; const segs=[];
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    const p0=[ring[i*2],ring[i*2+1]], p1=[ring[j*2],ring[j*2+1]];
    const cuts=[];
    for(const or of otherRings){
      const m=or.length/2;
      for(let k=0;k<m;k++){
        const l=(k+1)%m;
        const hit=segIntersect(p0,p1,[or[k*2],or[k*2+1]],[or[l*2],or[l*2+1]]);
        if(hit) cuts.push(hit);
      }
    }
    cuts.sort((a,b)=>a[2]-b[2]);
    let last=p0;
    for(const c of cuts){ segs.push([last,[c[0],c[1]]]); last=[c[0],c[1]]; }
    segs.push([last,p1]);
  }
  return segs;
}
function inRingSet(rings,x,y){ let inside=false; for(const r of rings){ if(Path.pointIn(r,x,y)) inside=!inside; } return inside; }
function chainSegs(segs){
  const key=p=>Math.round(p[0]*64)+'_'+Math.round(p[1]*64);
  const map=new Map();
  segs.forEach((s,idx)=>{ const k=key(s[0]); if(!map.has(k)) map.set(k,[]); map.get(k).push(idx); });
  const used=new Array(segs.length).fill(false);
  const rings=[];
  for(let i=0;i<segs.length;i++){
    if(used[i]) continue;
    const ring=[]; const startKey=key(segs[i][0]);
    let idx=i, guard=0;
    while(idx>=0&&!used[idx]&&guard++<segs.length+2){
      used[idx]=true;
      const s=segs[idx];
      ring.push(s[0][0],s[0][1]);
      const endK=key(s[1]);
      if(endK===startKey&&ring.length>=6) break;
      const cands=map.get(endK)||[];
      let nxt=-1;
      for(const c of cands){ if(!used[c]){ nxt=c; break; } }
      idx=nxt;
    }
    if(ring.length>=6) rings.push(ring);
  }
  return rings;
}
function booleanRings(subj,clip,op){
  if(!subj.length) return op==='intersect'?[]:clip.map(r=>r.slice());
  if(!clip.length) return op==='intersect'?[]:subj.map(r=>r.slice());
  const sSegs=[], cSegs=[];
  for(const r of subj) sSegs.push(...splitRing(r,clip));
  for(const r of clip) cSegs.push(...splitRing(r,subj));
  const sel=[];
  const sInsideOther=s=>inRingSet(clip,(s[0][0]+s[1][0])/2,(s[0][1]+s[1][1])/2);
  const cInsideSubj=s=>inRingSet(subj,(s[0][0]+s[1][0])/2,(s[0][1]+s[1][1])/2);
  if(op==='union'){
    for(const s of sSegs) if(!sInsideOther(s)) sel.push(s);
    for(const s of cSegs) if(!cInsideSubj(s)) sel.push(s);
  } else if(op==='intersect'){
    for(const s of sSegs) if(sInsideOther(s)) sel.push(s);
    for(const s of cSegs) if(cInsideSubj(s)) sel.push(s);
  } else { // subtract
    for(const s of sSegs) if(!sInsideOther(s)) sel.push(s);
    for(const s of cSegs) if(cInsideSubj(s)) sel.push([[s[1][0],s[1][1]],[s[0][0],s[0][1]]]);
  }
  let rings=chainSegs(sel);
  rings=rings.filter(r=>Math.abs(Path.area(r))>0.5);
  return orientRings(rings);
}
// 统一方向：偶数层外环逆时针（面积>0），奇数层孔洞反向
function orientRings(rings){
  if(!rings.length) return rings;
  const depth=rings.map((r,i)=>{
    const x=r[0],y=r[1]; let d=0;
    for(let j=0;j<rings.length;j++){ if(j!==i&&Path.pointIn(rings[j],x,y)) d++; }
    return d;
  });
  return rings.map((r,i)=>{
    const a=Path.area(r); const wantPositive=depth[i]%2===0;
    if((a>0)!==wantPositive){ const o=[]; for(let k=r.length-2;k>=0;k-=2) o.push(r[k],r[k+1]); o.push(o[0],o[1]); return o; }
    return r;
  });
}
FF.poly={boolean:booleanRings, orient:orientRings, inSet:inRingSet};

/* ---------- 颜色 ---------- */
function hexToRgb(h){ h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255]; }
function rgbToHex(c){ const f=v=>clamp(Math.round(v*255),0,255).toString(16).padStart(2,'0');
  return '#'+f(c[0])+f(c[1])+f(c[2]); }
function hslToRgb(h,s,l){ h=((h%360)+360)%360/360;
  if(s===0) return [l,l,l];
  const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
  const f=t=>{ t=((t%1)+1)%1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
  return [f(h+1/3),f(h),f(h-1/3)]; }
function rgbToHsl(c){ const [r,g,b]=c, mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  if(mx===mn) return [0,0,l];
  const d=mx-mn, s=l>.5?d/(2-mx-mn):d/(mx+mn);
  let h; if(mx===r)h=(g-b)/d+(g<b?6:0); else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4;
  return [h*60,s,l]; }
FF.color={hexToRgb,rgbToHex,hslToRgb,rgbToHsl};

/* ---------- 其它 ---------- */
FF.fmtTime=(t,fps)=>{
  const m=Math.floor(t/60), s=Math.floor(t%60), ms=Math.floor((t%1)*1000);
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(ms).padStart(3,'0');
};
FF.deepClone=o=>JSON.parse(JSON.stringify(o));
FF.download=(name,text)=>{
  const blob=new Blob([text],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},500);
};
})();
