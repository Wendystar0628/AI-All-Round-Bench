/* ============ 锻火 FORGE · expr.js : 表达式引擎 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const E=APP.expr={};

/* ---------- 词法 ---------- */
function tokenize(src){
  const toks=[];let i=0;
  while(i<src.length){
    const c=src[i];
    if(c===' '||c==='\t'||c==='\n'||c==='\r'){i++;continue;}
    if(c==='/'&&src[i+1]==='/'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(c==='/'&&src[i+1]==='*'){i+=2;while(i<src.length&&!(src[i]==='*'&&src[i+1]==='/'))i++;i+=2;continue;}
    if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(src[i+1]||''))){
      let j=i;while(j<src.length&&/[0-9.eE+\-]/.test(src[j])){
        if((src[j]==='+'||src[j]==='-')&&!/[eE]/.test(src[j-1]))break;j++;}
      toks.push({t:'num',v:parseFloat(src.slice(i,j))});i=j;continue;
    }
    if(c==='"'||c==="'"){
      let j=i+1,s='';
      while(j<src.length&&src[j]!==c){if(src[j]==='\\'){s+=src[j+1];j+=2;}else s+=src[j++];}
      toks.push({t:'str',v:s});i=j+1;continue;
    }
    if(/[A-Za-z_$]/.test(c)){
      let j=i;while(j<src.length&&/[A-Za-z0-9_$]/.test(src[j]))j++;
      toks.push({t:'id',v:src.slice(i,j)});i=j;continue;
    }
    const three=src.substr(i,3);
    if(three==='==='||three==='!=='){toks.push({t:'op',v:three});i+=3;continue;}
    const two=src.substr(i,2);
    if(['==','!=','<=','>=','&&','||'].includes(two)){toks.push({t:'op',v:two});i+=2;continue;}
    if('+-*/%^<>=!?:.,()[]'.includes(c)){toks.push({t:'op',v:c});i++;continue;}
    throw new Error('表达式无法识别的字符: '+c);
  }
  toks.push({t:'eof'});
  return toks;
}
/* ---------- 语法 ---------- */
function parse(src){
  const toks=tokenize(src);let p=0;
  const peek=()=>toks[p];
  const next=()=>toks[p++];
  const expect=v=>{const t=next();if(t.t==='eof'||t.v!==v)throw new Error('表达式缺少 '+v);return t;};
  function primary(){
    const t=peek();
    if(t.t==='num'){next();return{op:'num',v:t.v};}
    if(t.t==='str'){next();return{op:'str',v:t.v};}
    if(t.t==='op'&&t.v==='('){next();const e=expr();expect(')');return e;}
    if(t.t==='op'&&t.v==='['){ // 数组字面量
      next();const items=[];
      if(peek().v!==']'){items.push(expr());while(peek().v===','){next();items.push(expr());}}
      expect(']');return{op:'arr',items};
    }
    if(t.t==='op'&&t.v==='-'){next();return{op:'neg',a:primary()};}
    if(t.t==='op'&&t.v==='!'){next();return{op:'not',a:unary()};}
    if(t.t==='id'){
      next();
      let node={op:'id',v:t.v};
      // 函数调用
      if(peek().v==='('){
        next();const args=[];
        if(peek().v!==')'){args.push(expr());while(peek().v===','){next();args.push(expr());}}
        expect(')');
        node={op:'call',name:t.v,args};
      }
      // 成员/索引链
      for(;;){
        if(peek().v==='.'){next();const m=next();if(m.t!=='id')throw new Error('成员名无效');
          if(peek().v==='('){ // 方法调用如 layer("x")
            next();const args=[];if(peek().v!==')'){args.push(expr());while(peek().v===','){next();args.push(expr());}}
            expect(')');node={op:'mcall',obj:node,name:m.v,args};
          } else node={op:'member',obj:node,name:m.v};
        }
        else if(peek().v==='['){next();const idx=expr();expect(']');node={op:'index',obj:node,idx};}
        else break;
      }
      return node;
    }
    throw new Error('表达式不完整: '+JSON.stringify(t));
  }
  function unary(){
    if(peek().v==='-'){next();return{op:'neg',a:unary()};}
    if(peek().v==='!'){next();return{op:'not',a:unary()};}
    if(peek().v==='+'){next();return unary();}
    return primary();
  }
  function power(){let a=unary();while(peek().v==='^'){next();a={op:'bin',o:'^',a,b:unary()};}return a;}
  function term(){let a=power();
    while(['*','/','%'].includes(peek().v)){const o=next().v;a={op:'bin',o,a,b:power()};}return a;}
  function arith(){let a=term();
    while(['+','-'].includes(peek().v)){const o=next().v;a={op:'bin',o,a,b:term()};}return a;}
  function rel(){let a=arith();
    while(['<','>','<=','>=','==','!=','===','!=='].includes(peek().v)){const o=next().v;a={op:'bin',o,a,b:arith()};}return a;}
  function land(){let a=rel();while(peek().v==='&&'){next();a={op:'and',a,b:rel()};}return a;}
  function lor(){let a=land();while(peek().v==='||'){next();a={op:'or',a,b:land()};}return a;}
  function expr(){
    let a=lor();
    if(peek().v==='?'){next();const b=expr();expect(':');const c=expr();return{op:'cond',a,b,c};}
    return a;
  }
  const ast=expr();
  if(peek().t!=='eof')throw new Error('表达式末尾多余内容');
  return ast;
}
/* ---------- 求值 ---------- */
function numOf(v){if(Array.isArray(v))return v.length?v[0]:0;return typeof v==='number'?v:(v?1:0);}
function vecOf(v,n){if(Array.isArray(v)){const o=[];for(let i=0;i<n;i++)o.push(v[i]!==undefined?v[i]:(v.length?v[v.length-1]:0));return o;}const o=[];for(let i=0;i<n;i++)o.push(numOf(v));return o;}
function binOp(o,a,b){
  const va=Array.isArray(a),vb=Array.isArray(b);
  if(o==='+'){
    if(va&&vb)return a.map((x,i)=>x+(b[i]!==undefined?b[i]:0));
    if(va)return a.map(x=>x+numOf(b));
    if(vb)return b.map(x=>numOf(a)+x);
    return numOf(a)+numOf(b);
  }
  if(o==='-'){if(va&&vb)return a.map((x,i)=>x-(b[i]!==undefined?b[i]:0));
    if(va)return a.map(x=>x-numOf(b));
    if(vb)return b.map(x=>numOf(a)-x);
    return numOf(a)-numOf(b);}
  if(o==='*'){if(va&&vb)return a.map((x,i)=>x*(b[i]!==undefined?b[i]:0));
    if(va)return a.map(x=>x*numOf(b));if(vb)return b.map(x=>numOf(a)*x);
    return numOf(a)*numOf(b);}
  if(o==='/'){if(va)return a.map(x=>x/numOf(b));if(vb)return b.map(x=>numOf(a)/x);return numOf(a)/numOf(b);}
  if(o==='%'){return numOf(a)%numOf(b);}
  if(o==='^'){return Math.pow(numOf(a),numOf(b));}
  if(o==='<')return numOf(a)<numOf(b);
  if(o==='>')return numOf(a)>numOf(b);
  if(o==='<=')return numOf(a)<=numOf(b);
  if(o==='>=')return numOf(a)>=numOf(b);
  if(o==='=='||o==='==='){if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((x,i)=>x===b[i]);return a===b;}
  if(o==='!='||o==='!=='){if(Array.isArray(a)&&Array.isArray(b))return !(a.length===b.length&&a.every((x,i)=>x===b[i]));return a!==b;}
  throw new Error('不支持的运算 '+o);
}
/* wiggle: 可复现 */
const wiggleSeed={};
function wiggleVal(t,freq,amp,seed,oct){
  oct=oct||2;
  let s=0,a=amp;
  for(let i=0;i<oct;i++){
    s+=a*(C.noise2(t*freq*(i+1)*1.7+seed*13.7+i*57.3, seed*3.3+i*11.1)*2-1);
    a*=0.5;
  }
  return s;
}
function loopTime(keys,type){
  if(!keys||keys.length<2)return null;
  const t0=keys[0].t,t1=keys[keys.length-1].t;
  const span=t1-t0;
  if(span<=0)return null;
  return {t0,t1,span};
}
const MATHFN={
  sin:x=>Math.sin(numOf(x)*Math.PI/180),cos:x=>Math.cos(numOf(x)*Math.PI/180),
  tan:x=>Math.tan(numOf(x)*Math.PI/180),
  sqrt:Math.sqrt,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,
  exp:Math.exp,log:Math.log,pow:(a,b)=>Math.pow(numOf(a),numOf(b)),
  min:(...a)=>Math.min(...a.map(numOf)),max:(...a)=>Math.max(...a.map(numOf)),
  atan2:(y,x)=>Math.atan2(numOf(y),numOf(x))*180/Math.PI,
  asin:x=>Math.asin(numOf(x))*180/Math.PI,acos:x=>Math.acos(numOf(x))*180/Math.PI,
  atan:x=>Math.atan(numOf(x))*180/Math.PI,
  random:function(a,b){if(a===undefined)return Math.random();if(b===undefined)return Math.random()*numOf(a);return numOf(a)+Math.random()*(numOf(b)-numOf(a));},
  noise:(x,y,z)=>C.noise3(numOf(x),numOf(y)||0,numOf(z)||0),
  degrees:r=>numOf(r)*180/Math.PI,radians:d=>numOf(d)*Math.PI/180,
  clamp:(v,a,b)=>C.clamp(numOf(v),numOf(a),numOf(b)),
  length:(v)=>Array.isArray(v)?Math.hypot(...v):Math.abs(numOf(v)),
  pi:Math.PI
};
/* 求值环境 */
function evalNode(n,env){
  switch(n.op){
    case 'num':return n.v;
    case 'str':return n.v;
    case 'arr':return n.items.map(it=>numOf(evalNode(it,env)));
    case 'neg':{const v=evalNode(n.a,env);return Array.isArray(v)?v.map(x=>-x):-numOf(v);}
    case 'not':return !truthy(evalNode(n.a,env));
    case 'and':return truthy(evalNode(n.a,env))?evalNode(n.b,env):false;
    case 'or':{const a=evalNode(n.a,env);return truthy(a)?a:evalNode(n.b,env);}
    case 'cond':return truthy(evalNode(n.a,env))?evalNode(n.b,env):evalNode(n.c,env);
    case 'bin':return binOp(n.o,evalNode(n.a,env),evalNode(n.b,env));
    case 'member':{
      const o=evalNode(n.obj,env);
      return memberOf(o,n.name);
    }
    case 'index':{
      const o=evalNode(n.obj,env);const i=numOf(evalNode(n.idx,env));
      if(Array.isArray(o))return o[Math.round(i)];
      return undefined;
    }
    case 'id':return env.lookup(n.v);
    case 'call':return callFn(n.name,n.args,env);
    case 'mcall':return callMethod(n.obj,n.name,n.args,env);
  }
  throw new Error('无法求值的表达式节点');
}
function truthy(v){return Array.isArray(v)?v.some(x=>!!x):!!v;}
function memberOf(o,name){
  if(o===null||o===undefined)throw new Error('读取不存在的对象的属性 '+name);
  if(Array.isArray(o)){
    if(name==='x'||name==='0')return o[0];
    if(name==='y'||name==='1')return o[1];
    if(name==='z'||name==='2')return o[2];
    if(name==='w'||name==='3')return o[3];
    if(name==='length')return o.length;
    return undefined;
  }
  if(typeof o==='object'&&o.__proxy)return o.get(name);
  if(typeof o==='object')return o[name];
  return undefined;
}
function callFn(name,args,env){
  // 全局函数
  if(name==='linear'){const[a,b,c,d,e]=args.map(x=>numOf(evalNode(x,env)));
    if(e<=a)return b;if(e>=c)return d;return b+(d-b)*(e-a)/(c-a);}
  if(name==='ease'){const[a,b,c,d,e]=args.map(x=>numOf(evalNode(x,env)));
    if(e<=a)return b;if(e>=c)return d;const t=(e-a)/(c-a);const s=t*t*(3-2*t);return b+(d-b)*s;}
  if(name==='easeIn'){const[a,b,c,d,e]=args.map(x=>numOf(evalNode(x,env)));
    if(e<=a)return b;if(e>=c)return d;const t=(e-a)/(c-a);return b+(d-b)*t*t;}
  if(name==='easeOut'){const[a,b,c,d,e]=args.map(x=>numOf(evalNode(x,env)));
    if(e<=a)return b;if(e>=c)return d;const t=(e-a)/(c-a);return b+(d-b)*(1-(1-t)*(1-t));}
  if(name==='clamp'){const[a,b,c]=args.map(x=>numOf(evalNode(x,env)));return C.clamp(a,b,c);}
  if(name==='length'){const v=evalNode(args[0],env);return Array.isArray(v)?Math.hypot(...v):Math.abs(numOf(v));}
  if(name==='degrees'||name==='radians'||name==='random'||name==='noise'){
    return MATHFN[name](...args.map(x=>numOf(evalNode(x,env))));
  }
  if(name==='wiggle'){
    const f=numOf(evalNode(args[0],env)),a=numOf(evalNode(args[1],env));
    const base=numOf(evalNode(n_id('value'),env));
    return base+wiggleVal(env.time,f,a,env.seed||1);
  }
  if(name==='loopOut'||name==='loopIn'){
    return env.doLoop(name,args);
  }
  if(name==='valueAtTime'){
    const t=numOf(evalNode(args[0],env));
    return env.valueAtTime(t);
  }
  if(name==='thisComp'||name==='thisLayer')return env.lookup(name);
  if(name==='time')return env.time;
  if(name==='value')return env.value;
  if(MATHFN[name]!==undefined){
    if(typeof MATHFN[name]==='function')return MATHFN[name](...args.map(x=>evalNode(x,env)));
    return MATHFN[name];
  }
  if(name==='Math'){return {__proxy:true,get:n=>{const f=MATHFN[n];return typeof f==='function'?f:(n==='PI'?Math.PI:undefined);}};}
  throw new Error('未知函数 '+name+'()');
}
function n_id(v){return {op:'id',v};}
function callMethod(objNode,name,args,env){
  const o=evalNode(objNode,env);
  if(o&&o.__proxy)return o.get(name)(...args.map(x=>evalNode(x,env)));
  if(o&&typeof o.callMethod==='function')return o.callMethod(name,args,env);
  throw new Error('不支持的方法 '+name);
}
/* ---------- 编译与执行 ---------- */
const cache=new Map();
E.compile=function(code){
  let e=cache.get(code);
  if(!e){e=parse(code);cache.set(code,e);}
  return e;
};
/* env: {time, value, seed, lookup(name), valueAtTime(t), doLoop(kind,args)} */
E.run=function(code,env){
  const ast=E.compile(code);
  return evalNode(ast,env);
};
/* 求值某个属性的表达式(带依赖与循环检测) */
E.evalPropExpr=function(prop,ctx){
  // ctx = {time, comp, layer, stack:[]}
  if(!prop.expr||!prop.expr.on||!prop.expr.code)return APP.anim.keyValue(prop,ctx.time,ctx);
  const key=prop.__eid||(prop.__eid=C.uid('e'));
  if(ctx.stack.includes(key))throw new Error('表达式循环依赖: 属性引用了自身');
  const stack=ctx.stack.concat([key]);
  const seed=prop.__seed||(prop.__seed=Math.random()*1000);
  const self={prop,ctx,stack,seed};
  const env={
    time:ctx.time,
    value:APP.anim.keyValue(prop,ctx.time,ctx),
    seed,
    lookup:name=>lookupName(name,self),
    valueAtTime:t=>APP.anim.keyValue(prop,t,ctx),
    doLoop:(kind,args)=>doLoop(kind,args,self)
  };
  try{
    const r=E.run(prop.expr.code,env);
    return r;
  }catch(err){
    if(/表达式循环依赖/.test(err.message))throw err;
    throw new Error('表达式错误: '+err.message);
  }
};
function doLoop(kind,args,self){
  const prop=self.prop,ctx=self.ctx;
  const keys=prop.keys;
  if(!keys||keys.length<2)return APP.anim.keyValue(prop,ctx.time,ctx);
  const t0=keys[0].t,t1=keys[keys.length-1].t,span=t1-t0;
  if(span<=0)return APP.anim.keyValue(prop,ctx.time,ctx);
  const type=args[0]?String(args[0].v||args[0]):'cycle';
  const t=ctx.time;
  let tt;
  if(kind==='loopOut'){
    if(t<=t1)return APP.anim.keyValue(prop,t,ctx);
    const d=(t-t1)%span;
    if(type==='pingpong'){
      const cycles=Math.floor((t-t1)/span);
      tt=cycles%2===0?t1-d:t0+d;
    }else if(type==='offset'){
      return APP.anim.keyValue(prop,t1,ctx);
    }else tt=t0+d;
  }else{
    if(t>=t0)return APP.anim.keyValue(prop,t,ctx);
    const d=(t0-t)%span;
    if(type==='pingpong'){
      const cycles=Math.floor((t0-t)/span);
      tt=cycles%2===0?t0-d:t1-d;
    }else tt=t1-d;
  }
  return APP.anim.keyValue(prop,tt,ctx);
}
/* 名称解析: thisLayer / thisComp / time / value / 数字 */
function lookupName(name,self){
  const ctx=self.ctx;
  if(name==='time')return ctx.time;
  if(name==='value')return APP.anim.keyValue(self.prop,ctx.time,ctx);
  if(name==='thisLayer'){
    if(!ctx.layer)throw new Error('表达式找不到 thisLayer');
    return layerProxy(ctx.layer,ctx.comp,self);
  }
  if(name==='thisComp'){
    return compProxy(ctx.comp,self);
  }
  if(name==='thisProject'){
    return {__proxy:true,get:n=>n==='name'?APP.app.project.name:undefined};
  }
  if(MATHFN[name]!==undefined){
    if(typeof MATHFN[name]==='function')return MATHFN[name];
    return MATHFN[name];
  }
  if(name==='Math')return {__proxy:true,get:n=>{const f=MATHFN[n];return typeof f==='function'?f:(n==='PI'?Math.PI:undefined);}};
  if(name==='wiggle')return (f,a)=>numOf(APP.anim.keyValue(self.prop,ctx.time,ctx))+wiggleVal(ctx.time,numOf(f),numOf(a),self.seed);
  if(name==='linear'||name==='ease'||name==='clamp'||name==='length'||name==='degrees'||name==='radians')return null;
  if(/^[0-9.]/.test(name))return parseFloat(name);
  throw new Error('表达式中的未知名称: '+name);
}
/* 图层代理: thisLayer.transform.position 等 */
const TRANSFORM_MAP={
  anchorPoint:'anchor',position:'pos',scale:'scale',rotation:'rot',opacity:'opacity',
  xRotation:['rot',0],yRotation:['rot',1],zRotation:['rot',2],
  xPosition:['pos',0],yPosition:['pos',1],zPosition:['pos',2],
  xScale:['scale',0],yScale:['scale',1],zScale:['scale',2],
  orientation:['rot']
};
function layerProxy(layer,comp,self){
  const cache={};
  return {__proxy:true,
    get(name){
      if(name==='name')return layer.name;
      if(name==='index')return comp.layers.indexOf(layer)+1;
      if(name==='width')return comp.w;
      if(name==='height')return comp.h;
      if(name==='time')return self.ctx.time;
      if(name==='content')return {__proxy:true,get:n=>0};
      if(name==='transform'){
        return {__proxy:true,get:n=>{
          const m=TRANSFORM_MAP[n];
          if(!m)return undefined;
          const path=Array.isArray(m)?m:[m];
          const prop=layer.t[path[0]];
          const v=evalPropInCtx(prop,{time:self.ctx.time,comp,layer,stack:self.stack});
          if(path.length>1)return Array.isArray(v)?v[path[1]]:v;
          return v;
        }};
      }
      if(name==='effect'){
        return (ename)=>({__proxy:true,get:n=>{
          const ef=layer.effects.find(e=>e.name===ename||e.type===ename);
          if(!ef)return 0;
          const p=ef.props[n];
          return p?evalPropInCtx(p,{time:self.ctx.time,comp,layer,stack:self.stack}):0;
        }});
      }
      if(name==='mask'){
        return (mname)=>({__proxy:true,get:n=>{
          const mk=layer.masks.find(m=>m.name===mname);
          if(!mk)return 0;
          const p=mk.props&&mk.props[n];
          return p?evalPropInCtx(p,{time:self.ctx.time,comp,layer,stack:self.stack}):0;
        }});
      }
      // 图层自定义可动画属性 (depth, intensity, rate ...)
      const p=layer.props&&layer.props[name];
      if(p)return evalPropInCtx(p,{time:self.ctx.time,comp,layer,stack:self.stack});
      if(name==='source'&&layer.text)return layer.text.src;
      if(name==='marker')return {__proxy:true,get:()=>0};
      return undefined;
    },
    callMethod(name,args,env){
      if(name==='valueAtTime'){
        const t=numOf(evalNode(args[0],env));
        return {__proxy:true,get:n=>{
          const m=TRANSFORM_MAP[n];
          if(!m)return undefined;
          const path=Array.isArray(m)?m:[m];
          const prop=layer.t[path[0]];
          const v=evalPropInCtx(prop,{time:t,comp,layer,stack:self.stack});
          return path.length>1?(Array.isArray(v)?v[path[1]]:v):v;
        }};
      }
      throw new Error('thisLayer 不支持的方法 '+name);
    }
  };
}
function compProxy(comp,self){
  return {__proxy:true,
    get(name){
      if(name==='width')return comp.w;
      if(name==='height')return comp.h;
      if(name==='duration')return comp.duration;
      if(name==='numLayers')return comp.layers.length;
      if(name==='frameDuration')return 1/comp.fps;
      if(name==='name')return comp.name;
      return undefined;
    },
    callMethod(name,args,env){
      if(name==='layer'){
        const a=args[0];
        let target=null;
        if(a.op==='num')target=comp.layers[Math.round(a.v)-1];
        else if(a.op==='str')target=comp.layers.find(l=>l.name===a.v);
        else{const v=evalNode(a,env);target=typeof v==='string'?comp.layers.find(l=>l.name===v):comp.layers[Math.round(numOf(v))-1];}
        if(!target)throw new Error('thisComp.layer 找不到图层');
        return layerProxy(target,comp,self);
      }
      throw new Error('thisComp 不支持的方法 '+name);
    }
  };
}
function evalPropInCtx(prop,ctx){return E.evalPropExpr(prop,ctx);}
/* 表达式错误信息(给 UI 用) */
E.check=function(prop){
  if(!prop.expr||!prop.expr.on||!prop.expr.code)return null;
  try{E.compile(prop.expr.code);return null;}
  catch(e){return e.message;}
};
})();
