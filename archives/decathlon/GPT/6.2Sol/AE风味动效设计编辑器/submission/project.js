'use strict';
const F = (() => {
const T=THREE, clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)), lerp=(a,b,t)=>a+(b-a)*t, smooth=x=>x*x*(3-2*x), mod=(x,n)=>((x%n)+n)%n, rad=x=>x*Math.PI/180;
const copy=x=>JSON.parse(JSON.stringify(x));
let sequence=0;
const uid=(prefix='id')=>prefix+'-'+Date.now().toString(36)+'-'+(++sequence).toString(36);
const prop=(v,keys=[],expr='')=>({v,keys:keys.map(k=>Array.isArray(k)?{t:k[0],v:k[1],in:k[2]||'linear',out:k[2]||'linear'}:k),expr});
const descriptors={
 text:['文字','type','#c2a0eb'],shape:['形状','square','#8cd9bc'],geometry:['三维实体','cube','#e99562'],particle:['粒子','spark','#e5bc71'],camera:['摄像机','camera','#8abde9'],light:['灯光','sun','#ebaa77'],null:['空对象','anchor','#b9a3ea'],adjust:['调整','sliders','#c7a5db'],precomp:['预合成','comp','#7ccab8'],audio:['音色','sound','#90c592'],field:['空间场','field','#aca2f4'],stage:['环境','grid','#91a8bb'],hammer:['锻锤','cube','#a8b1c5'],plate:['标记','type','#d1a18a']
};
const labels={position:'位置',anchor:'锚点',scale:'缩放',rotation:'旋转',opacity:'不透明度',text:'源文字',size:'字号',leading:'行距',tracking:'字距',align:'对齐',fill:'填充色',stroke:'描边色',strokeWidth:'描边宽度',width:'宽度',height:'高度',depth:'挤出深度',bevel:'倒角',metal:'金属度',rough:'粗糙度',heat:'发光强度',emission:'发光色',reveal:'笔画进度',ghost:'底稿强度',bend:'弯曲',twist:'扭转',intensity:'强度',radius:'作用半径',noise:'噪声细度',target:'目标点',fov:'视角',focus:'对焦距离',aperture:'光圈',rate:'发射速率',speed:'初速度',life:'寿命',drag:'阻力',gravity:'重力',seed:'随机种子',bounce:'反弹',friction:'摩擦',trail:'拖尾长度',trailWidth:'拖尾宽度',particleSize:'粒径',endColor:'终止色',spread:'散布',force:'方向力',frequency:'频率',volume:'音量',remap:'时间重映射',rangeStart:'范围起点',rangeEnd:'范围终点',rangeOffset:'范围偏移',rangeSoft:'软边',letterPos:'字符位移',letterRot:'字符旋转',letterScale:'字符缩放',letterAlpha:'字符透明度'};
const common={position:[0,0,0],anchor:[0,0,0],scale:[100,100,100],rotation:[0,0,0],opacity:100};
const init={
 text:{text:'火',size:330,leading:1.18,tracking:0,align:'center',fill:'#efb267',stroke:'#ffca8b',strokeWidth:0,reveal:100,ghost:0,rangeStart:0,rangeEnd:100,rangeOffset:0,rangeSoft:0,letterPos:[0,0,0],letterRot:0,letterScale:100,letterAlpha:100},
 shape:{width:250,height:155,fill:'#8cd9bc',stroke:'#e9faf2',strokeWidth:0},geometry:{depth:52,bevel:5,fill:'#b97d68',metal:.72,rough:.35,heat:0,emission:'#ff4829',bend:0,twist:0},
 particle:{rate:95,speed:160,life:1.3,drag:.34,gravity:185,seed:172,bounce:.54,friction:.18,trail:.18,trailWidth:1.4,trailColor:'#ff852f',trailFade:1.4,particleSize:3,endSize:35,particleFade:1,inheritMotion:.18,fill:'#fff0b5',endColor:'#fa3b0e',spread:2.1,force:[0,0,0]},
 field:{intensity:35,radius:160,noise:1.5},camera:{target:[0,0,0],fov:39,focus:870,aperture:0},light:{intensity:4,fill:'#fff2e5',target:[0,0,0]},precomp:{remap:0},audio:{frequency:65,volume:.38},stage:{fill:'#301610',height:-192},hammer:{depth:144,fill:'#777279',metal:.82,rough:.36,heat:0},plate:{text:'锻字',fill:'#ffd4b7'}
};
function layer(type,name,comp,id=uid('layer')){
 const p=Object.fromEntries(Object.entries({...common,...init[type]}).map(([k,v])=>[k,prop(copy(v))]));
 const l={id,type,name:name||descriptors[type][0],p,start:0,end:comp.duration,visible:true,locked:false,parent:null,masks:[],effects:[],ops:[],pins:[],blend:'source-over',motion:false,cast:true,receive:true,source:null,node:null,fields:[],colliders:[],shape:'rect',fieldType:'distance',lightType:'directional',textUnit:'glyph',voice:'tone'};
 if(type==='camera')p.position.v=[0,55,900];
 if(type==='light')p.position.v=[-320,360,450];
 if(type==='hammer')p.position.v=[55,430,6];
 return l;
}
function comp(name='合成 01',id=uid('comp')){return {id,name,width:1920,height:1080,fps:30,duration:15,work:[0,15],layers:[],nodes:[],chapters:[],shutter:180,phase:-90,blur:false}}
function empty(){const c=comp();return {name:'未命名工程',active:c.id,comps:[c],v:1}}
function demo(){
 const c=comp('锻字','main'), sub=comp('铸造台','furnace');
 const a={name:'锻字',active:'main',comps:[c,sub],v:1};
 c.chapters=[{t:0,name:'01  写成',color:'#ddad72'},{t:3.5,name:'02  成块',color:'#e69467'},{t:7,name:'03  锻打',color:'#ed7866'},{t:11,name:'04  冷却',color:'#91b1cc'}];
 const add=(typ,name,id)=>{const l=layer(typ,name,c,id);c.layers.push(l);return l};
 const title=add('plate','图记 · 锻字','title');title.locked=true;
 const cam=add('camera','主摄像机','camera');cam.p.position=prop([30,85,930],[[0,[20,72,928]],[3.45,[45,67,894],'bezier'],[6.85,[195,113,868],'bezier'],[7.28,[127,101,809],'bezier'],[7.48,[153,104,844],'bezier'],[9.93,[111,94,798],'bezier'],[12,[44,76,868],'bezier'],[14,[23,73,926],'bezier']]);cam.p.target.v=[-102,2,0];
 const light=add('light','主光 · 熔炉暖光','light');light.p.position.v=[-302,391,480];light.p.fill.v='#ffd5aa';light.p.intensity=prop(4.2,[[0,3.9],[5,5.7,'bezier'],[9.91,6.5],[10.18,4.9],[13.5,3.55,'bezier']]);
 const spark=add('particle','火星 · 表面发射','spark');spark.start=6.8;spark.end=12.8;spark.node='n-deform';spark.colliders=['furnace','solid'];spark.fields=['impact'];spark.p.rate.v=0;spark.p.speed.v=355;spark.p.life.v=1.68;spark.p.gravity.v=310;spark.p.drag.v=.64;spark.p.trail.v=.2;spark.p.trailWidth.v=2.1;spark.bursts=[[7.25,138],[8.62,96],[9.78,168]];
 const hammer=add('hammer','锻锤 · 钨钢','hammer');hammer.start=5.15;hammer.end=11.43;
 hammer.p.position=prop([60,430,0],[[5.15,[72,490,4]],[6.43,[48,281,2],'bezier'],[6.72,[44,292,4],'bezier'],[7.02,[48,343,2],'bezier'],[7.25,[21,201,9]],[7.31,[22,205,8]],[7.94,[78,313,4],'bezier'],[8.37,[84,351,4],'bezier'],[8.62,[49,198,9]],[8.69,[53,228,9]],[9.25,[38,300,5],'bezier'],[9.55,[36,361,8],'bezier'],[9.78,[17,197,8]],[9.85,[18,210,8]],[10.32,[24,306,5],'bezier'],[11.43,[41,515,4],'bezier']]);
 hammer.p.rotation=prop([0,0,-8],[[5.15,[0,0,-13]],[7.02,[2,7,-15]],[7.25,[0,1,1]],[8.37,[5,4,-11]],[8.62,[0,0,0]],[9.55,[1,-7,-13]],[9.78,[0,1,0]],[11.43,[0,0,-14],'bezier']]);
 hammer.p.heat=prop(0,[[0,0],[7.24,0],[7.25,.3],[7.4,.02,'bezier'],[8.61,.02],[8.62,.27],[8.81,0,'bezier'],[9.77,0],[9.78,.5],[10.15,0,'bezier']]);
 const solid=add('geometry','字块 · 热锻金属','solid');solid.start=2.25;solid.source='glyph';solid.node='n-deform';solid.p.position.v=[78,7,0];
 solid.p.depth=prop(1,[[2.25,1],[3.57,14,'bezier'],[5.6,76,'bezier'],[6.9,72,'bezier'],[7.25,92],[7.75,70,'bezier'],[8.62,82],[9.01,64,'bezier'],[9.78,85],[10.47,64,'bezier'],[13,59,'bezier']]);
 solid.p.bevel.v=6;solid.p.fill=prop('#df7835',[[2.25,'#d87235'],[5.45,'#f78236','bezier'],[9.78,'#ff6f35'],[11.3,'#89574a','bezier'],[13.9,'#8a97a6','bezier']]);solid.p.emission.v='#ff4513';
 solid.p.heat=prop(.64,[[2.25,.58],[5.9,1.22,'bezier'],[7.25,2.55],[7.64,1.11,'bezier'],[8.62,1.9],[8.94,1.01,'bezier'],[9.78,2.8],[10.14,1.32,'bezier'],[11.15,.6,'bezier'],[13.8,.035,'bezier']]);solid.p.rough=prop(.34,[[2.25,.39],[6,.26],[13.8,.38,'bezier']]);
 solid.p.scale=prop([100,100,100],[[0,[100,100,100]],[7.22,[100,100,100]],[7.25,[110,89,104]],[7.68,[101,99,100],'bezier'],[8.59,[101,99,100]],[8.62,[107,93,103]],[9.23,[101,98,100],'bezier'],[9.75,[101,98,100]],[9.78,[114,86,110]],[10.36,[104,96,100],'bezier'],[12.6,[103,97,100],'bezier']]);
 solid.p.rotation=prop([0,0,-1],[[0,[0,0,0]],[3.4,[0,0,0]],[5.8,[3,-13,-5],'bezier'],[7.25,[3,-7,-1]],[7.85,[0,-9,-2],'bezier'],[9.78,[0,1,1]],[10.6,[1,-5,-2],'bezier'],[13.7,[0,-6,0],'bezier']]);
 const glyph=add('text','火 · 字形源','glyph'); glyph.p.position.v=[78,7,3];glyph.p.size.v=376;glyph.p.reveal=prop(0,[[0,9],[.57,27,'bezier'],[1.02,49,'bezier'],[1.85,75,'bezier'],[2.7,100,'bezier']]);
 glyph.p.ghost=prop(48,[[0,48],[2,31],[3,0]]);glyph.p.opacity=prop(100,[[0,100],[2.27,100],[3.28,0,'bezier']]);glyph.p.fill.v='#ffaa53';glyph.forged=true;
 const impact=add('field','冲击 · 距离场','impact');impact.p.position.v=[106,148,55];impact.p.radius.v=214;impact.p.intensity=prop(0,[[0,0],[7.21,0],[7.25,35],[7.62,0,'bezier'],[8.59,0],[8.62,24],[8.9,0,'bezier'],[9.74,0],[9.78,59],[10.19,0,'bezier']]);
 const stage=layer('stage','铸造台 · 场景',sub,'furnace');stage.locked=true;sub.layers.push(stage);
 const env=add('precomp','铸造台 · 预合成','stage');env.source='furnace';env.sharedSpace=true;env.locked=true;
 const audio=add('audio','炉鸣 · 锻打音色','audio');audio.voice='forge';audio.p.volume.v=.44;audio.hits=[7.25,8.62,9.78];
 c.nodes=[
 {id:'n-glyph',type:'source',name:'字形轮廓',x:43,y:41,source:'glyph'},
 {id:'n-field',type:'field',name:'冲击场',x:43,y:165,source:'impact'},
 {id:'n-deform',type:'deform',name:'网格变形',x:246,y:60,input:'n-glyph',field:'n-field',param:prop(1)},
 {id:'n-display',type:'output',name:'挤出 · 金属',x:459,y:25,input:'n-deform'},
 {id:'n-emit',type:'output',name:'表面 · 发射',x:459,y:129,input:'n-deform'}
 ];
 return a
}
const mix=(a,b,u)=>{
 if(Array.isArray(a)&&Array.isArray(b))return a.map((v,i)=>mix(v,b[i]??v,u));
 if(a?.points&&b?.points){
  const n=Math.max(a.points.length,b.points.length);
  const ap=a.points.length===n?a.points:resample(a,n),bp=b.points.length===n?b.points:resample(b,n);
  const handles=ap.map((p,i)=>{
   const aHandle=a.handles?.[i],bHandle=b.handles?.[i];
   return {in:mix(aHandle?.in||[0,0],bHandle?.in||[0,0],u),out:mix(aHandle?.out||[0,0],bHandle?.out||[0,0],u)}
  });
  return {...a,closed:u<.5?a.closed:b.closed,points:ap.map((v,i)=>mix(v,bp[i],u)),handles}
 }
 if(typeof a==='number'&&typeof b==='number')return lerp(a,b,u);
 if(typeof a==='string'&&typeof b==='string'&&/^#[\da-f]{6}$/i.test(a)&&/^#[\da-f]{6}$/i.test(b)){
  const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16);
  return '#'+[16,8,0].map(s=>Math.round(lerp(x>>s&255,y>>s&255,u)).toString(16).padStart(2,'0')).join('')
 }
 return u<1?a:b
};
function bez(a,b,c,d,u){const q=1-u;return q*q*q*a+3*q*q*u*b+3*q*u*u*c+u*u*u*d}
function base(p,t){
 const k=p.keys;
 if(!k.length)return p.v;
 if(t<=k[0].t)return k[0].v;
 if(t>=k.at(-1).t)return k.at(-1).v;
 const j=k.findIndex(x=>x.t>t), a=k[j-1], b=k[j];
 if(t===a.t)return a.v;
 if(a.out==='hold')return a.v;
 if(b.in==='hold')return b.v;
 const u=(t-a.t)/(b.t-a.t);
 let eased=u;
 if(a.out==='bezier'||b.in==='bezier'){
  const x1=a.out==='bezier'?(a.easeOutX??1/3):1/3,x2=1-(b.in==='bezier'?(b.easeInX??1/3):1/3);
  let lo=0,hi=1;
  for(let i=0;i<13;i++){const m=(lo+hi)/2;if(bez(0,x1,x2,1,m)<u)lo=m;else hi=m}
  eased=bez(0,a.out==='bezier'?(a.easeOut??0):1/3,b.in==='bezier'?1-(b.easeIn??0):2/3,1,(lo+hi)/2)
 }
 if(Array.isArray(a.v)&&typeof a.v[0]==='number'&&(a.spatialOut||b.spatialIn)&&a.v.length===3){
  const ac=a.v.map((x,i)=>x+(a.spatialOut?.[i]||0)),bc=b.v.map((x,i)=>x+(b.spatialIn?.[i]||0));
  const at=w=>a.v.map((x,i)=>bez(x,ac[i],bc[i],b.v[i],w));
  const lens=[0];let prior=a.v;
  const samples=80;
  for(let i=1;i<=samples;i++){const next=at(i/samples);lens.push(lens.at(-1)+Math.hypot(...next.map((v,n)=>v-prior[n])));prior=next}
  const s=lens.at(-1)*eased;
  const idx=lens.findIndex((v,i)=>i&&v>=s);
  return idx<1?at(eased):at((idx-1+(s-lens[idx-1])/(lens[idx]-lens[idx-1]||1))/samples)
 }
 return mix(a.v,b.v,eased)
}
const isref=x=>x&&x.ref;
const raw=x=>isref(x)?x.scalar?x.read()?.[2]:x.read():x;
const operation=(a,b,fn)=>{a=raw(a);b=raw(b);return Array.isArray(a)?a.map((v,i)=>fn(v,Array.isArray(b)?b[i]:b)):Array.isArray(b)?b.map(v=>fn(a,v)):fn(a,b)};
const parsed=new Map();
function compile(src){
 if(parsed.has(src))return parsed.get(src);
 const re=/\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?|[\p{L}_$][\p{L}\p{N}_$]*|[+\-*/%^(),.\[\]])/uy;
 const tokens=[];let cursor=0;
 while(cursor<src.length){re.lastIndex=cursor;const m=re.exec(src);if(!m)throw Error('不支持的符号 '+src.slice(cursor,cursor+8));tokens.push(m[0].trim());cursor=re.lastIndex}
 let i=0;const take=s=>tokens[i]===s?(i++,true):false;
 const req=s=>{if(!take(s))throw Error('缺少 '+s)};
 function args(end){const a=[];if(!take(end)){do{a.push(expr(0))}while(take(','));req(end)}return a}
 const pri={'+':1,'-':1,'*':2,'/':2,'%':2,'^':3};
 function expr(min){
  let tok=tokens[i++], left;
  if(tok==='-'||tok==='+'){const inner=expr(4);left=e=>operation(0,inner(e),tok==='-'?(a,b)=>-b:(a,b)=>+b)}
  else if(tok==='('){left=expr(0);req(')')}
  else if(tok==='['){const list=args(']');left=e=>list.map(x=>raw(x(e)))}
  else if(/^["']/.test(tok||'')){left=()=>tok[0]==='"'?JSON.parse(tok):tok.slice(1,-1).replace(/\\'/g,"'")}
  else if(/^(\d|\.\d)/.test(tok||'')){left=()=>Number(tok)}
  else if(/^[\p{L}_$]/u.test(tok||'')){left=e=>{if(!Object.hasOwn(e,tok))throw Error('未知变量 '+tok);return e[tok]}}
  else throw Error('表达式不完整');
  for(;;){
   const prev=left;
   if(take('.')){const part=tokens[i++];left=e=>getMember(prev(e),part)}
   else if(take('[')){const part=expr(0);req(']');left=e=>getMember(prev(e),raw(part(e)))}
   else if(take('(')){const list=args(')');left=e=>{const func=prev(e);if(typeof func!=='function')throw Error('无法调用此属性');return func(...list.map(x=>raw(x(e))))}}
   else {const op=tokens[i],w=pri[op];if(!w||w<min)break;i++;const next=expr(w+1);const ops={'+':(a,b)=>a+b,'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'%':(a,b)=>a%b,'^':(a,b)=>a**b};left=e=>operation(prev(e),next(e),ops[op])}
  }
  return left
 }
 const fn=expr(0);if(i!==tokens.length)throw Error('多余的符号 '+tokens[i]);parsed.set(src,fn);return fn
}
function getMember(obj,name){
 if(isref(obj)){if(name==='valueAtTime')return obj.read;if(name==='value')return raw(obj);const v=obj.read();if(Array.isArray(v))return getMember(v,name)}
 if(Array.isArray(obj)){
  if(name==='length')return obj.length;
  const i=['x','y','z','w'].includes(name)?['x','y','z','w'].indexOf(name):/^\d+$/.test(name)?+name:-1;
  if(i>=0&&i<obj.length)return obj[i];
  throw Error('向量没有分量 '+name)
 }
 if(obj&&Object.hasOwn(obj,name))return obj[name];
 throw Error('未知属性 '+name)
}
const hash=x=>{const n=Math.sin(x*127.1+311.7)*43758.5453123;return n-Math.floor(n)};
function sampler(project,comp,time,dependencies=null){
 const scope=dependencies||{memo:new Map(),stack:new Set(),failures:new Map()};
 const {memo,stack,failures}=scope,errors=new Map(),matrixMemo=new Map(),nodeMemo=new Map(),nodeStack=new Set(),fieldMemo=new Map();
 const refKey=(c,l,k,t)=>c.id+'|'+l.id+'|'+k+'|'+t;
 function val(l,k,t=time){
  const p=l?.p?.[k];if(!p)return undefined;
  const id=refKey(comp,l,k,t),errorId=l.id+':'+k,stackId=comp.id+'|'+errorId;
  if(memo.has(id)){if(t===time&&failures.has(id))errors.set(errorId,failures.get(id));return memo.get(id)}
  const v=base(p,t);
  if(!p.expr){memo.set(id,v);return v}
  if(stack.has(stackId))throw Error('循环引用 · '+comp.name+' / '+l.name+' / '+(labels[k]||k));
  stack.add(stackId);
  let output=v;
  try{
   const link=(o,propName,owner)=>({ref:true,scalar:propName==='rotation'&&typeof v==='number',read:(s=t)=>{
    if(!o?.p?.[propName])throw Error('找不到属性 '+propName);
    const get=owner===comp?val:sampler(project,owner,s,scope).val,result=get(o,propName,s);
    const error=failures.get(refKey(owner,o,propName,s));if(error)throw Error(error);return result
   }});
   function proxy(o,owner=comp){
    if(!o)throw Error('找不到图层');
    const refs=Object.fromEntries(Object.keys(o.p).map(n=>[n,link(o,n,owner)]));
    return {...refs,transform:refs,name:o.name}
   }
   const ownerProxy=c=>({layer:name=>proxy(c.layers.find(layer=>layer.name===name||layer.id===name),c),width:c.width,height:c.height,duration:c.duration});
   let axis=0;
   const wiggle=(freq,amp)=>operation(v,amp,(x,a)=>{
    const u=t*freq,i=Math.floor(u),seed=(axis++)*91.37+(typeof x==='number'?x*.023:0);
    return x+a*(lerp(hash(i+seed),hash(i+1+seed),smooth(u-i))*2-1)
   });
   const loopOut=mode=>{const first=p.keys[0]?.t,last=p.keys.at(-1)?.t,d=last-first;if(!(d>0)||t<=last)return v;const dt=t-first,q=mod(dt,mode==='pingpong'?d*2:d);return base(p,first+(mode==='pingpong'&&q>d?2*d-q:q))};
   const env={time:t,value:v,wiggle,loopOut,linear:(s,a,b,c,d)=>mix(c,d,clamp((s-a)/(b-a))),ease:(s,a,b,c,d)=>mix(c,d,smooth(clamp((s-a)/(b-a)))),thisLayer:proxy(l),thisComp:ownerProxy(comp),comp:name=>{
    const owner=project.comps.find(q=>q.name===name||q.id===name);if(!owner)throw Error('找不到合成 '+name);return ownerProxy(owner)
   },valueAtTime:s=>base(p,s),sin:Math.sin,cos:Math.cos,abs:Math.abs,min:Math.min,max:Math.max,clamp,pi:Math.PI};
   if(k==='rotation'&&typeof v==='number')env.value=v;
   output=raw(compile(p.expr.trim())(env));
   if(output===undefined||output===null||typeof output==='number'&&!Number.isFinite(output))throw Error('结果无效');
   if(Array.isArray(v)&&!Array.isArray(output)&&typeof output==='number'&&k==='rotation')output=[v[0],v[1],output];
   if(Array.isArray(v)&&(!Array.isArray(output)||output.length!==v.length||output.some(x=>!Number.isFinite(x))))throw Error('表达式结果的向量维度不匹配');
   if(typeof v==='number'&&(typeof output!=='number'||!Number.isFinite(output)))throw Error('表达式应返回数值');
  }catch(e){failures.set(id,e.message);if(t===time)errors.set(errorId,e.message);output=v}
  finally{stack.delete(stackId)}
  memo.set(id,output);return output
 }
 function local(l){
  const vector=(k)=>new T.Vector3(...val(l,k));
  const e=new T.Euler(...val(l,'rotation').map(rad),'ZYX');
  const m=new T.Matrix4().compose(vector('position'),new T.Quaternion().setFromEuler(e),vector('scale').multiplyScalar(.01));
  if(l.affine)m.multiply(new T.Matrix4().fromArray(l.affine));
  return m.multiply(new T.Matrix4().makeTranslation(...vector('anchor').negate()));
 }
 function matrix(l,seen=new Set()){
  if(matrixMemo.has(l.id))return matrixMemo.get(l.id);
  const m=local(l); const parent=comp.layers.find(x=>x.id===l.parent);
  if(parent&&!seen.has(parent.id)){seen.add(l.id);m.premultiply(matrix(parent,seen))}
  if(seen.size===0||!matrixMemo.has(l.id))matrixMemo.set(l.id,m);
  return m
 }
 const s={project,comp,time,active:l=>l.visible&&time>=l.start&&time<=l.end,val,matrix,local,errors,nodeMemo,nodeStack,fieldMemo};
 return s
}
const set=(l,k,t,v)=>{const p=l.p[k];if(!p.keys.length){p.v=v;return}const f=p.keys.find(x=>Math.abs(x.t-t)<.00001);if(f)f.v=v;else{p.keys.push({t,v,in:'linear',out:'linear'});p.keys.sort((a,b)=>a.t-b.t)}};
const ring=(points,closed=true)=>({points,closed});
const curve=(start,commands,steps=9)=>{
 const pts=[start];let cursor=start;
 for(const c of commands){
  if(c.length===2)pts.push(c);
  else for(let i=1;i<=steps;i++){const f=i/steps;pts.push([bez(cursor[0],c[0],c[2],c[4],f),bez(cursor[1],c[1],c[3],c[5],f)])}
  cursor=c.slice(-2)
 }
 return ring(pts)
};
const fire=[
 curve([-133,106],[[-143,137,-122,138,-115,113],[-104,88,-76,60,-67,40],[-58,18,-69,5,-83,11],[-111,22,-130,64,-133,106]]),
 curve([109,120],[[126,139,153,113,142,96],[121,72,83,43,54,34],[42,30,37,38,50,50],[73,70,103,101,109,120]]),
 curve([-32,153],[[-36,177,-4,185,17,162],[29,152,23,122,20,99],[15,42,0,-14,-32,-57],[-59,-96,-108,-133,-154,-151],[-168,-153,-177,-145,-164,-135],[-109,-95,-72,-51,-54,-7],[-35,40,-26,103,-32,153]]),
 curve([-4,30],[[17,-9,48,-63,104,-97],[129,-114,155,-119,175,-134],[188,-144,176,-156,157,-158],[121,-160,79,-137,54,-115],[17,-82,-9,-39,-26,7],[-31,21,-17,46,-4,30]])
];
const fontCache=new Map();
let glyphCtx;
const cleanPoints=pts=>pts.filter((p,i)=>i===0||Math.abs(p[0]-pts[i-1][0])+Math.abs(p[1]-pts[i-1][1])>.0001);
function traceGlyph(ch){
 if(fontCache.has(ch))return fontCache.get(ch);
 if(!glyphCtx){const c=document.createElement('canvas');c.width=192;c.height=192;glyphCtx=c.getContext('2d',{willReadFrequently:true})}
 const ctx=glyphCtx,w=192,h=192;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='white';ctx.font='900 145px "Noto Sans SC Variable", "Microsoft YaHei", "SimHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ch,96,93,173);
 const pixels=ctx.getImageData(0,0,w,h).data;
 const on=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&pixels[(x+y*w)*4+3]>125;
 const edges=new Map(), key=(x,y)=>x+y*(w+1);
 const add=(x,y,u,v)=>{const from=key(x,y);if(!edges.has(from))edges.set(from,[]);edges.get(from).push([u,v])};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(on(x,y)){
  if(!on(x,y-1))add(x,y,x+1,y);
  if(!on(x+1,y))add(x+1,y,x+1,y+1);
  if(!on(x,y+1))add(x+1,y+1,x,y+1);
  if(!on(x-1,y))add(x,y+1,x,y)
 }
 const result=[];
 while(edges.size){
  const start=edges.keys().next().value;let x=start%(w+1),y=Math.floor(start/(w+1)),points=[];
  for(let i=0;i<9000;i++){const k=key(x,y), list=edges.get(k);if(!list?.length)break;points.push([x,y]);[x,y]=list.pop();if(!list.length)edges.delete(k);if(key(x,y)===start)break}
  if(points.length<7)continue;
  let min=points[0],max=points[0];for(const p of points){if(p[0]<min[0])min=p;if(p[0]>max[0])max=p}
  const keep=points.filter((p,i)=>i%3===0||p===min||p===max).map(([a,b])=>[(a-96)/150,(96-b)/150]);
  if(keep.length>=3)result.push(ring(keep))
 }
 fontCache.set(ch,result);return result
}
const wordsSegmenter=new Intl.Segmenter('zh-CN',{granularity:'word'});
function textRings(s,l){
 const {val}=s, size=Math.max(1,val(l,'size')),txt=String(val(l,'text')).slice(0,512),lines=txt.split('\n'),all=[], glyphs=lines.reduce((n,row)=>n+[...row].length,0);
 const wordSlots=[];let words=0;
 for(const row of lines){
  const slots=[];
  for(const part of wordsSegmenter.segment(row)){
   const id=part.isWordLike?words++:Math.max(0,words-1);
   slots.push(...[...part.segment].map(()=>id))
  }
  wordSlots.push(slots)
 }
 const advance=size*.94+val(l,'tracking'),leading=val(l,'leading')*size;
 const rot=rad(val(l,'letterRot'));
 const start=(val(l,'rangeStart')+val(l,'rangeOffset'))/100,end=(val(l,'rangeEnd')+val(l,'rangeOffset'))/100,soft=val(l,'rangeSoft')/100;
 let index=0;
 lines.forEach((line,row)=>{
  const chars=[...line]; const span=(chars.length-1)*advance, align=val(l,'align');
  chars.forEach((char,i)=>{
   const slot=l.textUnit==='line'?row/Math.max(1,lines.length-1):l.textUnit==='word'?wordSlots[row][i]/Math.max(1,words-1):index/Math.max(1,glyphs-1);
   const w=slot>=start&&slot<=end?1:soft?clamp(1-Math.min(Math.abs(slot-start),Math.abs(slot-end))/soft):0;
   const x=i*advance-(align==='left'?0:align==='right'?span:span/2),y=(lines.length/2-.5-row)*leading;
   const local=char==='火'?fire.map(r=>ring(r.points.map(p=>p.map(v=>v/376)))):traceGlyph(char);
   for(const r of local){
    const factor=size*lerp(1,val(l,'letterScale')/100,w),cs=Math.cos(rot*w),sn=Math.sin(rot*w),offset=val(l,'letterPos');
    const p=r.points.map(([a,b])=>[x+factor*(a*cs-b*sn)+offset[0]*w,y+factor*(a*sn+b*cs)+offset[1]*w,offset[2]*w]);
    all.push({...ring(p),glyph:index,alpha:lerp(1,val(l,'letterAlpha')/100,w)})
   }
   index++
  });
 });
 return all
}
function shapeRings(s,l){
 const w=s.val(l,'width')/2,h=s.val(l,'height')/2;
 if(l.shape==='path'){
  const raw=s.val(l,'path')||[];
  return raw.map(r=>{
   if(!r.handles)return r;
   const commands=[];
   const len=r.points.length;
   for(let j=0;j<(r.closed?len:len-1);j++){
    const a=r.points[j],b=r.points[(j+1)%len],m=r.handles[j]?.out||[0,0],n=r.handles[(j+1)%len]?.in||[0,0];
    commands.push(m.some(Boolean)||n.some(Boolean)?[a[0]+m[0],a[1]+m[1],b[0]+n[0],b[1]+n[1],...b]:b)
   }
   return {...curve(r.points[0],commands,13),closed:r.closed}
  })
 }
 if(l.shape==='ellipse')return [ring(Array.from({length:72},(_,i)=>[w*Math.cos(i*Math.PI/36),h*Math.sin(i*Math.PI/36)]))];
 return [ring([[-w,-h],[w,-h],[w,h],[-w,h]])]
}
function inside(p,pts){
 let result=false;
 for(let i=0,j=pts.length-1;i<pts.length;j=i++){
  const a=pts[i],b=pts[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result
 }
 return result
}
function area(r){return r.points.reduce((v,a,i)=>{const b=r.points[(i+1)%r.points.length];return v+a[0]*b[1]-a[1]*b[0]},0)/2}
function polygons(rings){
 const closed=rings.filter(r=>r.closed&&r.points.length>2&&Math.abs(area(r))>.01).sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
 const parents=new Map(), groups=new Map(),out=[];
 for(let i=0;i<closed.length;i++){
  const r=closed[i];let parent=null;for(let j=i-1;j>=0;j--)if(closed[j].glyph===r.glyph&&r.points.every(p=>inside(p,closed[j].points))){parent=closed[j];break}
  const d=parent?parents.get(parent)+1:0;parents.set(r,d);
  if(d%2){groups.get(parent)?.push(r.points)}else{const p=[r.points];groups.set(r,p);out.push(p)}
 }
 return out
}
function measure(r){
 const pts=r.closed?[...r.points,r.points[0]]:r.points, len=[0];
 for(let i=1;i<pts.length;i++)len.push(len[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1],(pts[i][2]||0)-(pts[i-1][2]||0)));
 return {pts,len,total:len.at(-1)}
}
function trim(r,start,end){
 const {pts,len,total}=measure(r);if(!total||start>=end)return ring([],false);
 const lo=start*total,hi=end*total,result=[];
 for(let i=1;i<pts.length;i++){
  if(len[i]<lo||len[i-1]>hi||len[i]===len[i-1])continue;
  const d=len[i]-len[i-1];
  for(const s of [Math.max(lo,len[i-1]),Math.min(hi,len[i])]){const f=(s-len[i-1])/d;result.push(pts[i-1].map((v,k)=>lerp(v,pts[i][k],f)))}
 }
 return {...r,points:cleanPoints(result),closed:r.closed&&start===0&&end===1}
}
function fieldVector(s,l,p){
 if(!s.fieldMemo.has(l.id)){
  const matrix=s.matrix(l),range=Math.max(1,s.val(l,'radius'));
  s.fieldMemo.set(l.id,{linear:new T.Matrix3().setFromMatrix4(matrix),inverse:matrix.clone().invert(),range,intensity:s.val(l,'intensity'),grain:s.val(l,'noise')/range})
 }
 const {linear,inverse,range,intensity,grain}=s.fieldMemo.get(l.id),d=p.clone().applyMatrix4(inverse);
 const f=smooth(clamp(1-d.length()/range))*intensity;
 if(l.fieldType==='vortex')d.set(-d.y,d.x,0).normalize();
 else if(l.fieldType==='noise')d.set(Math.sin(d.y*grain+2*s.time),Math.cos(d.x*grain-2*s.time),Math.sin((d.x+d.y)*grain));
 else d.normalize();
 return d.multiplyScalar(f).applyMatrix3(linear)
}
function deform(s,l,rings,fields=[],amount=1,spaceLayer=l){
 const pins=l?.pins||[];
 fields=fields.filter(field=>s.val(field,'intensity')!==0);
 if((!fields.length||!amount)&&!pins.length)return rings;
 const mat=spaceLayer?s.matrix(spaceLayer):new T.Matrix4(),inv=mat.clone().invert();
 const pinData=pins.map(pin=>{
  const ang=rad(base(pin.rotation,s.time));
  return {origin:pin.origin,to:base(pin.position,s.time),cs:Math.cos(ang),sn:Math.sin(ang),scale:base(pin.scale,s.time)/100,radius:Math.max(1,pin.radius?.keys?base(pin.radius,s.time):pin.radius||135)}
 });
 function apply(p){
  const q=new T.Vector3(p[0],p[1],p[2]||0).applyMatrix4(mat),change=new T.Vector3();
  for(const field of fields)change.add(fieldVector(s,field,q));
  const result=q.addScaledVector(change,amount).applyMatrix4(inv);
  let pinWeight=0;const shift=new T.Vector3();
  for(const {origin,to,cs,sn,scale,radius} of pinData){
   const x=p[0]-origin[0],y=p[1]-origin[1],w=Math.exp(-((x*x+y*y)/(radius*radius)));
   shift.x+=w*(to[0]+scale*(x*cs-y*sn)-p[0]);shift.y+=w*(to[1]+scale*(x*sn+y*cs)-p[1]);
   shift.z+=w*((to[2]||0)-(origin[2]||0));pinWeight+=w
  }
  result.addScaledVector(shift,1/Math.max(1,pinWeight));
  return [result.x,result.y,result.z]
 }
 const result=rings.map(r=>({...r,points:r.points.map(apply)}));
 result.rest=rings.rest||rings;
 result.deformVertex=rings.deformVertex?p=>apply(rings.deformVertex(p)):apply;
 result.deformKey=[rings.deformKey||null,mat.elements,amount,pinData,fields.map(field=>[
  field.id,field.fieldType,s.matrix(field).elements,s.val(field,'intensity'),s.val(field,'radius'),s.val(field,'noise'),field.fieldType==='noise'?s.time:0
 ])];
 return result
}
function resample(r,n){
 const m=measure(r);const out=[];
 for(let i=0,j=1;i<n;i++){
  const d=m.total*i/(r.closed?n:Math.max(1,n-1));
  while(j<m.len.length-1&&m.len[j]<d)j++;
  out.push(m.pts[j-1].map((v,k)=>lerp(v,m.pts[j][k],(d-m.len[j-1])/(m.len[j]-m.len[j-1]||1))))
 }
 return out
}
function matchRings(a,b){
 const meta=list=>list.map((r,i)=>{
  const center=r.points.reduce((a,p)=>[a[0]+p[0]/r.points.length,a[1]+p[1]/r.points.length],[0,0]),size=Math.max(1,Math.abs(area(r)));
  const depth=r.closed?list.filter(q=>q!==r&&q.closed&&q.points.length>3&&Math.abs(area(q))>size&&r.points.every(p=>inside(p,q.points))).length:0;
  return {r,i,center,size,role:r.closed?depth%2:2}
 });
 const x=meta(a),y=meta(b),used=new Set(),out=[];
 for(const u of x){
  let best=Infinity,chosen;
  for(const v of y)if(!used.has(v.i)&&u.role===v.role){
   const score=Math.abs(Math.log(u.size/v.size))*.85+Math.hypot(u.center[0]-v.center[0],u.center[1]-v.center[1])/300;
   if(score<best){best=score;chosen=v}
  }
  if(chosen)used.add(chosen.i);out.push(chosen?.r||null)
 }
 return out
}
function geometry(s,l,visited=new Set(),skipNode=false){
 if(!l)return [];
 const token=skipNode?l.id+'@原始':l.id;
 if(visited.has(token))return [];
 visited=new Set(visited);visited.add(token);
 let r=[];
 const source=s.comp.layers.find(x=>x.id===l.source&&x.id!==l.id);
 if(l.node&&!skipNode)r=nodeValue(s,l.node,visited)||[];
 else if(source)r=geometry(s,source,visited);
 else if(l.type==='text')r=textRings(s,l);
 else if(l.type==='shape')r=shapeRings(s,l);
 else if(l.type==='geometry')r=[ring([[-95,-70],[95,-70],[95,70],[-95,70]])];
 if(skipNode)return r;
 for(const op of l.ops||[]){
  const amount=base(op.amount,s.time);
  if(op.type==='trim'){
   const lengths=r.map(p=>measure(p).total), total=lengths.reduce((a,b)=>a+b,0);let distance=0;
   r=r.map((p,i)=>{const a=clamp((total*(op.start?base(op.start,s.time)/100:0)-distance)/(lengths[i]||1)),b=clamp((total*amount/100-distance)/(lengths[i]||1));distance+=lengths[i];return trim(p,a,b)}).filter(p=>p.points.length>1)
  }else if(op.type==='repeat'){
   const offset=base(op.offset,s.time);
   r=Array.from({length:clamp(Math.floor(amount),0,64)},(_,i)=>r.map(p=>({...p,points:p.points.map(([x,y,z])=>[x+i*offset[0],y+i*offset[1],z||0])}))).flat()
  }else if(op.type==='morph'){
   const goal=s.comp.layers.find(a=>a.id===op.source);if(!goal)continue;
   const other=geometry(s,goal,visited).filter(p=>p.points.length>=2),q=clamp(amount/100);
   if(q===0)continue;
   if(q===1){r=other;continue}
   r=r.filter(p=>p.points.length>=2);
   const matched=matchRings(r,other);
   const shrink=(p,weight)=>{
    const center=p.points.reduce((sum,v)=>sum.map((x,i)=>x+(v[i]||0)/p.points.length),[0,0,0]);
    return {...p,points:p.points.map(v=>mix(center,v,weight))}
   };
   const incoming=other.filter(p=>!matched.includes(p)).map(p=>shrink(p,q));
   r=r.map((p,i)=>{const b=matched[i];if(!b)return shrink(p,1-q);const n=Math.min(600,Math.max(p.points.length,b.points.length,32)),pts=resample(p,n),next=resample(area(p)*area(b)<0?{...b,points:[...b.points].reverse()}:b,n);let offset=0;
    if(p.closed&&b.closed){let best=Infinity;for(let j=0;j<n;j++){const cost=pts.reduce((sum,v,k)=>sum+(v[0]-next[(k+j)%n][0])**2+(v[1]-next[(k+j)%n][1])**2,0);if(cost<best){best=cost;offset=j}}}
    return {...p,points:pts.map((v,k)=>mix(v,next[(k+offset)%n],q))}
   }).concat(incoming)
  }else if(['union','difference','intersection'].includes(op.type)){
   const other=s.comp.layers.find(a=>a.id===op.source);if(!other)continue;
   const conversion=s.matrix(l).clone().invert().multiply(s.matrix(other));
   const factor=clamp(amount/100,0,8);
   if(factor===0){if(op.type==='intersection')r=[];continue}
   const q=geometry(s,other,visited).map(p=>({...p,points:p.points.map(a=>{const v=new T.Vector3(a[0]*factor,a[1]*factor,0).applyMatrix4(conversion);return [v.x,v.y]})}));
   try{const a=polygons(r),b=polygons(q);const result=polygonClipping[op.type](a,b);r=result.flatMap(p=>p.map((q)=>ring(q.slice(0,-1))))}catch(e){s.errors.set(l.id+':geometry','形状操作 · '+e.message)}
  }
 }
 if(l.pins?.length||l.fields?.length){
  const fs=(l.fields||[]).map(id=>s.comp.layers.find(x=>x.id===id)).filter(Boolean);
  r=deform(s,l,r,fs)
 }
 return r
}
const nodeInfo={
 source:['轮廓输入',null,'geometry'],field:['空间场输入',null,'field'],number:['数值',null,'scalar'],vector:['向量',null,'vector'],color:['颜色',null,'color'],rect:['矩形生成',null,'geometry'],transform:['几何变换','geometry','geometry'],repeat:['几何分布','geometry','geometry'],deform:['场变形','geometry','geometry'],trim:['修剪路径','geometry','geometry'],style:['设置颜色','geometry','geometry'],output:['几何输出','geometry','geometry'],group:['节点组','geometry','geometry']
};
function nodeDepends(comp,from,wanted,seen=new Set()){
 if(!from||seen.has(from))return false;
 if(from===wanted)return true;
 seen.add(from);
 const node=comp.nodes.find(n=>n.id===from);
 return !!node&&['input','field','scalar','vector','color','internal'].some(k=>nodeDepends(comp,node[k],wanted,seen))
}
function nodeValue(s,id,visited=new Set(),overrides){
 if(!overrides&&s.nodeMemo.has(id))return s.nodeMemo.get(id);
 const n=s.comp.nodes.find(x=>x.id===id);
 if(!n||s.nodeStack.has(id))return null;
 s.nodeStack.add(id);
 const wire=k=>overrides&&Object.hasOwn(overrides,k)?overrides[k]:n[k];
 const inputId=wire('input');
 const l=s.comp.layers.find(x=>x.id===n.source),v=n.param?base(n.param,s.time):1,input=inputId?nodeValue(s,inputId,visited):[];
 let result=input;
 if(n.type==='source')result=geometry(s,l,visited,nodeDepends(s.comp,l?.node,n.id));
 else if(n.type==='field')result=l||null;
 else if(['number','vector','color'].includes(n.type))result=v;
 else if(n.type==='rect'){const d=Math.max(1,wire('scalar')?nodeValue(s,wire('scalar')):v)/2;result=[ring([[-d,-d],[d,-d],[d,d],[-d,d]])]}
 else if(n.type==='transform'&&Array.isArray(input)){const d=(wire('vector')&&nodeValue(s,wire('vector')))||[v,0,0];result=input.map(p=>({...p,points:p.points.map(([x,y,z])=>[x+d[0],y+d[1],(z||0)+(d[2]||0)])}))}
 else if(n.type==='repeat'&&Array.isArray(input)){const spacing=(wire('vector')&&nodeValue(s,wire('vector')))||[36,22,0],count=wire('scalar')?nodeValue(s,wire('scalar')):v;result=Array.from({length:clamp(Math.floor(count),0,64)},(_,i)=>input.map(p=>({...p,points:p.points.map(([x,y,z])=>[x+i*spacing[0],y+i*spacing[1],(z||0)+i*(spacing[2]||0)])}))).flat()}
 else if(n.type==='trim'&&Array.isArray(input))result=input.map(r=>trim(r,0,clamp(v/100)));
 else if(n.type==='style'&&Array.isArray(input)){const tint=wire('color')?nodeValue(s,wire('color')):v;result=input.map(r=>({...r,tint}))}
 else if(n.type==='deform'&&Array.isArray(input)){
  const f=wire('field')?nodeValue(s,wire('field')):null;
  const src=s.comp.nodes.find(q=>q.id===inputId), owner=l||s.comp.layers.find(q=>q.id===src?.source);
  result=f?deform(s,owner,input,[f],v):input
 }else if(n.type==='group'&&n.internal){
  const external=Object.fromEntries((n.inputs||[['input','geometry']]).map(([key])=>[key,wire(key)||null]));
  result=nodeValue(s,n.internal,visited,external)
 }
 s.nodeStack.delete(id);if(!overrides)s.nodeMemo.set(id,result);return result
}
return {T,clamp,lerp,smooth,mod,rad,copy,uid,prop,descriptors,labels,layer,comp,empty,demo,base,sampler,set,ring,curve,mix,hash,textRings,geometry,nodeValue,nodeInfo,fieldVector,polygons,measure,trim,area,resetGlyphs:()=>fontCache.clear()};
})();
