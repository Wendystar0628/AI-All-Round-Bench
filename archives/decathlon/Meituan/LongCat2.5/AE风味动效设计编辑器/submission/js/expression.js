/* expression.js — 表达式解析与求值（依赖、循环检测、loopOut/wiggle/valueAtTime） */
(function(){
'use strict';
const E = {};
window.Expression = E;

const State = {
  time: 0,
  value: 0,
  layer: null,
  comp: null,
  propPath: '',
  keys: null,
  seed: 1,
  deps: [],      // [{layerId, path, compId}]
  stack: [],     // 求值栈，用于循环检测
  errors: [],
  inEval: false,
};
E.State = State;

/* ---------- 可复现噪声 ---------- */
function hash1(n, seed){
  let h = (n|0) ^ Math.imul(seed|0, 0x9E3779B1);
  h = Math.imul(h ^ (h>>>16), 0x85EBCA6B);
  h = Math.imul(h ^ (h>>>13), 0xC2B2AE35);
  h ^= h>>>16;
  return (h>>>0)/4294967296;
}
function vnoise(t, seed){
  const i = Math.floor(t), f = t - i;
  const u = f*f*(3-2*f);
  return (hash1(i,seed) + (hash1(i+1,seed)-hash1(i,seed))*u)*2-1;
}
function fbm(t, seed){
  return vnoise(t,seed)*0.65 + vnoise(t*2.13+7.3,seed^0x1234)*0.35;
}

/* ---------- 属性代理 ---------- */
function isVec(v){ return Array.isArray(v); }

class PropProxy{
  constructor(layer, path, comp){
    this.__layer = layer; this.__path = path; this.__comp = comp;
    this.__isProp = true;
  }
  __resolve(t){
    return Model.evalProperty(this.__layer, this.__path, t===undefined?State.time:t, this.__comp);
  }
  valueOf(){ return this.__resolve(State.time); }
  toString(){ const v=this.__resolve(State.time); return v===undefined?'undefined':String(v); }
  get value(){ return this.__resolve(State.time); }
  set value(v){ Model.setStaticValue(this.__layer, this.__path, v); }
  valueAtTime(t){ return this.__resolve(t); }
  get valueAtTimeFn(){ return (t)=>this.__resolve(t); }
  get transform(){ return new GroupProxy(this.__layer, this.__path.concat(['transform']), this.__comp); }
  get [Symbol.toPrimitive](){ return ()=>this.__resolve(State.time); }
}
// 用 Proxy 支持任意嵌套访问与向量分量
function makePropProxy(layer, path, comp){
  const base = {
    value: undefined,
    valueAtTime: (t)=>Model.evalProperty(layer, path, t===undefined?State.time:t, comp),
    get value(){ return Model.evalProperty(layer, path, State.time, comp); },
    set value(v){ Model.setStaticValue(layer, path, v); },
    toString(){ const v=Model.evalProperty(layer,path,State.time,comp); return v==null?'':String(v); },
    valueOf(){ return Model.evalProperty(layer, path, State.time, comp); },
  };
  return new Proxy(base, {
    get(t, prop, recv){
      if(prop in t){
        const v=t[prop];
        return typeof v==='function'? v.bind(t) : v;
      }
      if(prop===Symbol.toPrimitive) return ()=>Model.evalProperty(layer,path,State.time,comp);
      if(prop==='valueOf') return ()=>Model.evalProperty(layer,path,State.time,comp);
      if(prop==='toString') return ()=>{const v=Model.evalProperty(layer,path,State.time,comp);return v==null?'':String(v);};
      if(prop==='length'){ const v=Model.evalProperty(layer,path,State.time,comp); return Array.isArray(v)?v.length:undefined; }
      if(typeof prop==='string' && /^\d+$/.test(prop)){
        const v=Model.evalProperty(layer,path,State.time,comp);
        return Array.isArray(v)? v[+prop] : undefined;
      }
      if(prop==='constructor'||prop==='prototype'||prop==='then') return undefined;
      // 记录依赖
      if(State.inEval && layer) State.deps.push({layerId:layer.id, path, compId: comp?comp.id:null});
      return makeGroupProxy(layer, path.concat([String(prop)]), comp);
    },
    has(){ return true; }
  });
}
function makeGroupProxy(layer, path, comp){
  const base = {
    toString(){ return '[Group '+(path.join('.'))+' ]'; },
    valueOf(){ return Model.evalProperty(layer, path, State.time, comp); },
  };
  return new Proxy(base, {
    get(t, prop){
      if(prop in t){ const v=t[prop]; return typeof v==='function'?v.bind(t):v; }
      if(prop===Symbol.toPrimitive) return ()=>Model.evalProperty(layer,path,State.time,comp);
      if(prop==='valueOf') return ()=>Model.evalProperty(layer,path,State.time,comp);
      if(prop==='toString') return ()=>'[Group '+path.join('.')+']';
      if(prop==='length'){ const v=Model.evalProperty(layer,path,State.time,comp); return Array.isArray(v)?v.length:undefined; }
      if(typeof prop==='string' && /^\d+$/.test(prop)){
        const v=Model.evalProperty(layer,path,State.time,comp);
        return Array.isArray(v)? v[+prop] : undefined;
      }
      if(prop==='constructor'||prop==='prototype'||prop==='then') return undefined;
      if(State.inEval && layer) State.deps.push({layerId:layer.id, path, compId:comp?comp.id:null});
      return makeGroupProxy(layer, path.concat([String(prop)]), comp);
    },
    has(){ return true; }
  });
}
E.makePropProxy = makePropProxy;
E.makeGroupProxy = makeGroupProxy;

/* ---------- 合成 / 图层代理 ---------- */
function makeCompProxy(comp){
  const base = {
    id: comp.id, name: comp.name, width: comp.width, height: comp.height,
    fps: comp.fps, duration: comp.duration,
    layer: (nameOrIndex)=>{
      const l = Model.findLayer(comp, nameOrIndex);
      if(!l) return makeGroupProxy(null, ['__missing__'], comp);
      return makeGroupProxy(l, [], comp);
    },
    layers: comp.layers.slice(),
  };
  return new Proxy(base, {
    get(t, prop){
      if(prop in t) return t[prop];
      if(prop==='numLayers') return comp.layers.length;
      if(prop==='duration') return comp.duration;
      if(prop==='frameDuration') return 1/comp.fps;
      if(prop==='time') return State.time;
      if(prop==='bgColor'||prop==='bg') return comp.bgColor||[0,0,0];
      return undefined;
    },
    has(){ return true; }
  });
}

/* ---------- loopOut ---------- */
class LoopValue{
  constructor(type, count){ this.type=type; this.count=count||0; }
  valueOf(){ return computeLoop(this.type, this.count); }
  toString(){ return String(computeLoop(this.type,this.count)); }
}
function computeLoop(type, count){
  const keys = State.keys;
  if(!keys || keys.length<2) return State.value;
  let ks = keys.slice();
  if(count>0) ks = ks.slice(-count);
  if(ks.length<2) return ks.length? ks[ks.length-1].v : State.value;
  const t0 = ks[0].t, t1 = ks[ks.length-1].t;
  const period = t1-t0;
  if(period<=1e-9) return ks[ks.length-1].v;
  const local = State.time - t0;
  let ph, rev=false;
  if(type==='cycle' || type==='offset' || type==='continue'){
    ph = ((local % period)+period)%period;
    if(type==='offset') ph = local; // 近似
  } else if(type==='pingpong'){
    const k = Math.floor(local/period);
    ph = ((local % period)+period)%period;
    rev = (k%2===1);
    if(rev) ph = period - ph;
  } else {
    ph = ((local % period)+period)%period;
  }
  return U.evalKeys(ks, t0+ph);
}

/* ---------- 环境 ---------- */
function buildEnv(){
  const env = {
    time: State.time,
    value: State.value,
    thisComp: makeCompProxy(State.comp),
    thisLayer: State.layer ? makeGroupProxy(State.layer, [], State.comp) : null,
    thisProperty: null,
    comp: (name)=> Model.getComp(name)? makeCompProxy(Model.getComp(name)) : null,
    layer: (name)=> State.comp? makeCompProxy(State.comp).layer(name) : null,
    Math: Math,
    wiggle: (freq, amp)=>{
      freq = +freq||1; amp = (amp===undefined)?1:amp;
      const seed = State.seed;
      const t = State.time*freq;
      const mk = (s)=> fbm(t, s)*amp;
      if(Array.isArray(amp)) return amp.map((a,i)=> fbm(t, seed+i*17)*a);
      return fbm(t, seed)*amp;
    },
    loopOut: (type, count)=> new LoopValue(type||'cycle', count||0),
    loopIn: (type, count)=> new LoopValue(type||'cycle', count||0),
    linear: (t,a,b,c,d)=>{
      if(a===undefined) return +t;
      if(b===undefined) return U.lerp(a,c===undefined?0:c, U.clamp(+t,0,1));
      t=+t;a=+a;b=+b;
      if(t<=a) return Array.isArray(c)? c.slice() : c;
      if(t>=b) return Array.isArray(d)? d.slice() : d;
      const p=(t-a)/(b-a);
      if(Array.isArray(c)) return c.map((cv,i)=>U.lerp(cv,d[i],p));
      return U.lerp(c,d,p);
    },
    ease: (t,a,b,c,d)=>{
      t=+t;a=+a;b=+b;
      if(t<=a) return Array.isArray(c)?c.slice():c;
      if(t>=b) return Array.isArray(d)?d.slice():d;
      const p=U.easeInOutCubic((t-a)/(b-a));
      if(Array.isArray(c)) return c.map((cv,i)=>U.lerp(cv,d[i],p));
      return U.lerp(c,d,p);
    },
    easeIn: (t,a,b,c,d)=>{
      t=+t;a=+a;b=+b; if(t<=a)return c; if(t>=b)return d;
      const p=U.easeInCubic((t-a)/(b-a));
      return Array.isArray(c)?c.map((cv,i)=>U.lerp(cv,d[i],p)):U.lerp(c,d,p);
    },
    easeOut: (t,a,b,c,d)=>{
      t=+t;a=+a;b=+b; if(t<=a)return c; if(t>=b)return d;
      const p=U.easeOutCubic((t-a)/(b-a));
      return Array.isArray(c)?c.map((cv,i)=>U.lerp(cv,d[i],p)):U.lerp(c,d,p);
    },
    random: (a,b)=>{
      if(a===undefined) return hash1(Math.floor(State.time*1000), State.seed);
      if(b===undefined) return hash1(Math.floor(State.time*1000), State.seed)*a;
      return a + hash1(Math.floor(State.time*1000), State.seed)*(b-a);
    },
    seedRandom: (seed)=>{ State.seed = (seed|0)||1; },
    posterizeTime: (fps)=>{ State.time = Math.floor(State.time*fps)/fps; return State.time; },
    valueAtTime: (t)=>{
      const v = State.layer ? Model.evalProperty(State.layer, State.propPath, +t, State.comp) : State.value;
      return v;
    },
    nearestKey: (t)=>{
      const ks=State.keys; if(!ks||!ks.length) return {time:0,value:0,index:0};
      let best=ks[0],bd=1e18;
      for(const k of ks){const d=Math.abs(k.t-t);if(d<bd){bd=d;best=k;}}
      return {time:best.t, value:best.v, index:ks.indexOf(best)};
    },
    key: (i)=>{
      const ks=State.keys; if(!ks||!ks.length) return {time:0,value:0};
      return {time:ks[i].t, value:ks[i].v, index:i};
    },
    numKeys: (State.keys? State.keys.length : 0),

    length: (a,b)=>{
      if(Array.isArray(a)){ if(Array.isArray(b)) return Math.hypot(a[0]-b[0],a[1]-b[1],(a[2]||0)-(b[2]||0)); return Math.hypot(a[0],a[1],a[2]||0); }
      return Math.abs(a-b);
    },
    lookAt: (a,b)=>{
      const dx=b[0]-a[0],dy=b[1]-a[1],dz=(b[2]||0)-(a[2]||0);
      return [Math.atan2(dy,dx), Math.atan2(dz,Math.hypot(dx,dy))];
    },
    degreesToRadians: d=>d*Math.PI/180,
    radiansToDegrees: r=>r*180/Math.PI,
    gaussianNoise: (t)=> fbm(t, State.seed),
    noise: (t)=> fbm(t, State.seed),
    sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, pow: Math.pow,
    exp: Math.exp, log: Math.log, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, min: Math.min, max: Math.max, atan2: Math.atan2, atan: Math.atan,
    PI: Math.PI,
    toWorld: (p)=>p,
    fromWorld: (p)=>p,
    clamp: (v,a,b)=>U.clamp(v,a,b),
    linearTween: (t,a,b,c,d)=>env.linear(t,a,b,c,d),
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
  };
  // 惰性求值，避免在构建环境时递归
  Object.defineProperty(env,'velocity',{get:()=>{
    const dt=1/(State.comp?State.comp.fps:30);
    const a=Model.evalProperty(State.layer,State.propPath,Math.max(0,State.time-dt),State.comp);
    const b=Model.evalProperty(State.layer,State.propPath,State.time+dt,State.comp);
    if(Array.isArray(a)) return a.map((v,i)=>(b[i]-v)/(2*dt));
    return (b-a)/(2*dt);
  }});
  Object.defineProperty(env,'speed',{get:()=>{
    const dt=1/(State.comp?State.comp.fps:30);
    const a=Model.evalProperty(State.layer,State.propPath,Math.max(0,State.time-dt),State.comp);
    const b=Model.evalProperty(State.layer,State.propPath,State.time+dt,State.comp);
    if(Array.isArray(a)){ let s=0; for(let i=0;i<a.length;i++) s+=Math.pow((b[i]-a[i])/(2*dt),2); return Math.sqrt(s); }
    return Math.abs((b-a)/(2*dt));
  }});
  return env;
}

/* ---------- 编译 / 求值 ---------- */
E.compile = function(src){
  const body = 'with(__env){ return ('+src+'); }';
  let fn;
  try{
    fn = new Function('__env', body);
  }catch(err){
    throw new Error('语法错误: '+err.message);
  }
  return fn;
};

E.evalExpression = function(src, ctx){
  // ctx: {time, value, layer, comp, propPath, keys, seed}
  const fn = E.compile(src);
  State.time = ctx.time;
  State.value = ctx.value;
  State.layer = ctx.layer;
  State.comp = ctx.comp;
  State.propPath = ctx.propPath;
  State.keys = ctx.keys;
  State.seed = ctx.seed||1;
  State.deps = [];
  State.errors = [];
  State.inEval = true;
  const env = buildEnv();
  let result, error=null;
  const stackKey = ctx.layer? ctx.layer.id+':'+ctx.propPath : 'global';
  if(State.stack.indexOf(stackKey)>=0){
    State.inEval = false;
    return {value: ctx.value, error: new Error('循环引用: '+stackKey), deps: []};
  }
  State.stack.push(stackKey);
  try{
    result = fn(env);
    if(result && result.__isProp){ result = result.valueOf(); }
    if(result instanceof LoopValue){ result = result.valueOf(); }
  }catch(err){
    error = err;
    result = ctx.value;
  }
  State.stack.pop();
  State.inEval = false;
  return {value: result, error, deps: State.deps.slice()};
};

/* 检查表达式是否包含某标识符（用于依赖预扫） */
E.scanRefs = function(src){
  const refs = [];
  const re = /(?:thisComp\.layer\(\s*["']([^"']+)["']\s*\)|\blayer\(\s*["']([^"']+)["']\s*\))/g;
  let m;
  while((m=re.exec(src))) refs.push(m[1]||m[2]);
  return refs;
};

})();
