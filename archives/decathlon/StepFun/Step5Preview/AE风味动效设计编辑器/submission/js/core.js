/* ============ 锻火 FORGE · core.js : 数学 / 工具 / 撤销 ============ */
(function(){
const APP = window.APP = window.APP || {};
APP.core = {};

const C = APP.core;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
C.clamp=clamp; C.lerp=lerp;
C.TAU=Math.PI*2;

/* ---------- 向量 ---------- */
C.v2=(x,y)=>({x:x||0,y:y||0});
C.v3=(x,y,z)=>({x:x||0,y:y||0,z:z||0});
C.v2add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
C.v2sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
C.v2mul=(a,s)=>({x:a.x*s,y:a.y*s});
C.v2len=a=>Math.hypot(a.x,a.y);
C.v2norm=a=>{const l=Math.hypot(a.x,a.y)||1;return{x:a.x/l,y:a.y/l};};
C.v2dot=(a,b)=>a.x*b.x+a.y*b.y;
C.v2dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
C.v2lerp=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});

/* ---------- 矩阵 4x4 (列主序) ---------- */
C.m4=function(){return new Float32Array(16);};
C.m4id=function(m){m=m||new Float32Array(16);m.fill(0);m[0]=m[5]=m[10]=m[15]=1;return m;};
C.m4mul=function(a,b,out){
  out=out||new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return out;
};
C.m4mulAll=function(...ms){let m=C.m4id();for(const x of ms)m=C.m4mul(m,x);return m;};
C.m4trs=function(tx,ty,tz,sx,sy,sz,rx,ry,rz){
  // 旋转顺序 ZXY(类似AE), 单位:度
  const m=new Float32Array(16);
  const cx=Math.cos(rx*Math.PI/180),sx_=Math.sin(rx*Math.PI/180);
  const cy=Math.cos(ry*Math.PI/180),sy_=Math.sin(ry*Math.PI/180);
  const cz=Math.cos(rz*Math.PI/180),sz_=Math.sin(rz*Math.PI/180);
  // R = Rz*Ry*Rx
  const r00=cz*cy, r01=cz*sy_*sx_-sz_*cx, r02=cz*sy_*cx+sz_*sx_;
  const r10=sz_*cy, r11=sz_*sy_*sx_+cz*cx, r12=sz_*sy_*cx-cz*sx_;
  const r20=-sy_,  r21=cy*sx_,          r22=cy*cx;
  m[0]=r00*sx; m[1]=r10*sx; m[2]=r20*sx; m[3]=0;
  m[4]=r01*sy; m[5]=r11*sy; m[6]=r21*sy; m[7]=0;
  m[8]=r02*sz; m[9]=r12*sz; m[10]=r22*sz; m[11]=0;
  m[12]=tx; m[13]=ty; m[14]=tz; m[15]=1;
  return m;
};
C.m4persp=function(fovY,aspect,near,far){
  const f=1/Math.tan(fovY*Math.PI/360), m=new Float32Array(16);
  m[0]=f/aspect; m[5]=f; m[11]=-1;
  m[10]=(far+near)/(near-far); m[14]=2*far*near/(near-far);
  return m;
};
C.m4ortho=function(l,r,b,t,n,f){
  const m=new Float32Array(16);
  m[0]=2/(r-l);m[5]=2/(t-b);m[10]=-2/(f-n);m[15]=1;
  m[12]=-(r+l)/(r-l);m[13]=-(t+b)/(t-b);m[14]=-(f+n)/(f-n);
  return m;
};
C.m4lookAt=function(ex,ey,ez,tx,ty,tz,ux,uy,uz){
  let zx=ex-tx,zy=ey-ty,zz=ez-tz;let zl=Math.hypot(zx,zy,zz)||1;zx/=zl;zy/=zl;zz/=zl;
  let xx=uy*zz-uz*zy,xy=uz*zx-ux*zz,xz=ux*zy-uy*zx;let xl=Math.hypot(xx,xy,xz);
  if(xl<1e-6){xx=1;xy=0;xz=0;}else{xx/=xl;xy/=xl;xz/=xl;}
  const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
  const m=new Float32Array(16);
  m[0]=xx;m[1]=yx;m[2]=zx;m[3]=0;
  m[4]=xy;m[5]=yy;m[6]=zy;m[7]=0;
  m[8]=xz;m[9]=yz;m[10]=zz;m[11]=0;
  m[12]=-(xx*ex+xy*ey+xz*ez);m[13]=-(yx*ex+yy*ey+yz*ez);m[14]=-(zx*ex+zy*ey+zz*ez);m[15]=1;
  return m;
};
C.m4inv=function(m){
  const inv=new Float32Array(16);
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
  if(!det)return C.m4id();
  det=1/det;
  for(let i=0;i<16;i++)inv[i]*=det;
  return inv;
};
C.m4transformPoint=function(m,x,y,z){
  const w=m[3]*x+m[7]*y+m[11]*z+m[15]||1;
  return {x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,
          y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w,
          z:(m[2]*x+m[6]*y+m[10]*z+m[14])/w,w};
};

/* ---------- 颜色 ---------- */
C.hex2rgb=h=>{h=h.replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n=parseInt(h,16);return{r:(n>>16&255)/255,g:(n>>8&255)/255,b:(n&255)/255,a:1};};
C.rgb2hex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(clamp(v,0,1)*255).toString(16).padStart(2,'0')).join('');
C.hsv2rgb=(h,s,v)=>{h=(h%360)/60;const c=v*s;const x=c*(1-Math.abs(h%2-1));
  let r=0,g=0,b=0;const i=Math.floor(h);
  if(i===0){r=c;g=x;}else if(i===1){r=x;g=c;}else if(i===2){g=c;b=x;}
  else if(i===3){g=x;b=c;}else if(i===4){r=x;b=c;}else{r=c;b=x;}
  const m=v-c;return{r:r+m,g:g+m,b:b+m,a:1};};
C.rgb2hsv=(r,g,b)=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  let h=0;if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}
  return{h,s:mx?d/mx:0,v:mx};};

/* ---------- 缓动 ---------- */
// AE 风格: influence(0..1) / speed(单位/秒) -> 立方贝塞尔
C.easeFunc=function(kIn,kOut){
  // kIn={infl,speed} kOut={infl,speed}; 返回 f(t)->0..1
  const i0=clamp(kIn&&kIn.i!==undefined?kIn.i:0.333,0.0001,0.9999), i1=clamp(kOut&&kOut.i!==undefined?kOut.i:0.333,0.0001,0.9999);
  const s0=kIn&&kIn.s!==undefined?kIn.s:0, s1=kOut&&kOut.s!==undefined?kOut.s:0;
  // 控制点: x 由 influence 决定, y 由 speed 决定(相对跨度)
  const p1x=i0, p2x=1-i1;
  const dy=1;
  let p1y,p2y;
  if(s0<=0&&s1<=0){p1y=0;p2y=1;} else {
    const sp=Math.max(Math.abs(s0),Math.abs(s1),0.0001);
    p1y=clamp(s0/sp,0.05,0.95); p2y=1-clamp(s1/sp,0.05,0.95);
  }
  const _x=t=>3*p1x*t*(1-t)*(1-t)+3*p2x*t*t*(1-t)+t*t*t;
  const _y=t=>3*p1y*t*(1-t)*(1-t)+3*p2y*t*t*(1-t)+t*t*t;
  const _dx=t=>3*p1x*(1-t)*(1-t)-6*p1x*t*(1-t)+6*p2x*t*(1-t)-3*p2x*t*t+3*t*t;
  return function(t){
    t=clamp(t,0,1);
    let lo=0,hi=1,mid=t;
    for(let i=0;i<20;i++){mid=(lo+hi)/2;if(_x(mid)<t)lo=mid;else hi=mid;}
    return _y((lo+hi)/2);
  };
};
// 标准 CSS 风格 cubic-bezier(x1,y1,x2,y2)
C.bezier=function(x1,y1,x2,y2){
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx;
  const cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const sx=t=>((ax*t+bx)*t+cx)*t, sy=t=>((ay*t+by)*t+cy)*t;
  const dx=t=>(3*ax*t+2*bx)*t+cx;
  return function(t){t=clamp(t,0,1);let lo=0,hi=1,mid=t;
    for(let i=0;i<24;i++){mid=(lo+hi)/2;if(sx(mid)<t)lo=mid;else hi=mid;}
    return sy((lo+hi)/2);};
};
C.EASE={linear:t=>t,
  quadIn:t=>t*t, quadOut:t=>1-(1-t)*(1-t), quadInOut:t=>t<.5?2*t*t:1-2*(1-t)*(1-t),
  cubicIn:t=>t*t*t, cubicOut:t=>1-(1-t)**3, cubicInOut:t=>t<.5?4*t*t*t:1-4*(1-t)**3,
  sineIn:t=>1-Math.cos(t*Math.PI/2), sineOut:t=>Math.sin(t*Math.PI/2), sineInOut:t=>-(Math.cos(Math.PI*t)-1)/2,
  expoOut:t=>t===1?1:1-Math.pow(2,-10*t), backOut:t=>1+2.70158*Math.pow(t-1,3)+1.70158*Math.pow(t-1,2),
  elasticOut:t=>t===0||t===1?t:Math.pow(2,-10*t)*Math.sin((t*10-0.75)*(2*Math.PI/3))+1,
  bounceOut:t=>{const n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d)return n*(t-=1.5/d)*t+.75;
    if(t<2.5/d)return n*(t-=2.25/d)*t+.9375;return n*(t-=2.625/d)*t+.984375;}
};

/* ---------- 噪声 (确定性) ---------- */
C.hash=function(x,y,z){let n=Math.sin(x*127.1+y*311.7+(z||0)*74.7)*43758.5453;return n-Math.floor(n);};
C.noise2=function(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=C.hash(xi,yi),b=C.hash(xi+1,yi),c=C.hash(xi,yi+1),d=C.hash(xi+1,yi+1);
  return lerp(lerp(a,b,u),lerp(c,d,u),v);
};
C.fbm2=function(x,y,oct){oct=oct||4;let s=0,a=.5,f=1;for(let i=0;i<oct;i++){s+=a*C.noise2(x*f,y*f);f*=2;a*=.5;}return s;};
C.noise3=function(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
  const xf=x-xi,yf=y-yi,zf=z-zi;
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
  const c=(i,j,k)=>C.hash(xi+i,yi+j,zi+k);
  const x00=lerp(c(0,0,0),c(1,0,0),u),x10=lerp(c(0,1,0),c(1,1,0),u);
  const x01=lerp(c(0,0,1),c(1,0,1),u),x11=lerp(c(0,1,1),c(1,1,1),u);
  return lerp(lerp(x00,x10,v),lerp(x01,x11,v),w);
};
// mulberry32 确定性随机
C.rng=function(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};

/* ---------- 工具 ---------- */
let _idc=1; C.uid=p=>(p||'id')+(_idc++).toString(36)+Math.floor(Math.random()*1e6).toString(36);
C.fmtTime=(t,fps)=>{const f=Math.round(t*fps);const s=Math.floor(f/fps);const ff=f-s*fps;
  return s+':'+String(ff).padStart(2,'0')+':'+String(Math.floor((t%1)*fps)).padStart(2,'0');};
C.deepClone=o=>JSON.parse(JSON.stringify(o));
C.round=(v,n)=>Math.round(v*Math.pow(10,n||3))/Math.pow(10,n||3);
C.escapeHtml=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
C.debounce=function(fn,ms){let t;return function(){clearTimeout(t);t=setTimeout(fn,ms);};};

/* ---------- 事件总线 ---------- */
C.bus={_h:{},on(k,f){(this._h[k]=this._h[k]||[]).push(f);return this;},
  emit(k,...a){(this._h[k]||[]).forEach(f=>f(...a));}};

/* ---------- 撤销管理 ---------- */
C.undo={
  stack:[],index:-1,limit:120,batch:null,
  reset(){this.stack.length=0;this.index=-1;},
  snapshot(label){
    const proj=APP.project;
    if(!proj)return;
    const data=proj.serialize();
    if(this.index>=0&&JSON.stringify(this.stack[this.index].data)===JSON.stringify(data))return;
    this.stack.length=this.index+1;
    this.stack.push({label,data});
    if(this.stack.length>this.limit)this.stack.shift();
    this.index=this.stack.length-1;
    C.bus.emit('undoChange');
  },
  begin(label){this.batch=label;},
  commit(label){
    const l=this.batch||label;this.batch=null;
    this.snapshot(l||'操作');
    C.bus.emit('projectChanged',{undo:true});
  },
  canUndo(){return this.index>=0;},
  canRedo(){return this.index<this.stack.length-1;},
  undo(){if(!this.canUndo())return;const s=this.stack[this.index];this.index--;
    APP.project.load(s.data,true);C.bus.emit('projectChanged',{undo:true});this.notify();},
  redo(){if(!this.canRedo())return;this.index++;const s=this.stack[this.index];
    APP.project.load(s.data,true);C.bus.emit('projectChanged',{undo:true});this.notify();},
  notify(){C.bus.emit('undoChange');},
  jump(i){if(i>=0&&i<this.stack.length){this.index=i;APP.project.load(this.stack[i].data,true);
    C.bus.emit('projectChanged',{undo:true});this.notify();}}
};

})();
