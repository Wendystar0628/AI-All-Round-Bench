/* Expressions evaluate against project data and a deterministic math namespace. */
const expressionCache=new Map();
const operatorRank={'||':1,'&&':2,'==':3,'===':3,'!=':3,'!==':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6,'**':7};
const mathScope=Object.create(null);
for(const key of ['PI','E','abs','acos','asin','atan','atan2','ceil','cos','exp','floor','hypot','log','max','min','pow','round','sign','sin','sqrt','tan','trunc'])mathScope[key]=Math[key];
function parseMotionExpression(source){
  if(expressionCache.has(source))return expressionCache.get(source);
  let i=0,token;
  function scan(){
    while(/\s/.test(source[i]||'!'))i++;
    const at=i,s=source.slice(i),ch=s[0];
    if(!ch)return {kind:'end',at};
    if(ch==='"'||ch==="'"){
      let value='';i++;
      while(i<source.length){const c=source[i++];if(c===ch)return {kind:'literal',value,at};if(c==='\\'){const e=source[i++];value+=({n:'\n',r:'\r',t:'\t'})[e]??e}else value+=c}
      throw Error('字符串缺少结束引号');
    }
    const num=s.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if(num){i+=num[0].length;return {kind:'literal',value:Number(num[0]),at}}
    const name=s.match(/^[\p{L}_$][\p{L}\d_$]*/u);
    if(name){i+=name[0].length;return {kind:'name',value:name[0],at}}
    const op=s.match(/^(?:===|!==|==|!=|<=|>=|\*\*|&&|\|\||[+\-*/%<>()\[\].!,?:;])/);
    if(!op)throw Error('第 '+(at+1)+' 个字符无法识别');
    i+=op[0].length;return {kind:'op',value:op[0],at}
  }
  function take(){let t=token;token=scan();return t}
  function expect(value){if(token.value!==value)throw Error('第 '+(token.at+1)+' 个字符处需要 '+value);take()}
  function args(end){let list=[];if(token.value!==end){list.push(expression(0));while(token.value===','){take();list.push(expression(0))}}expect(end);return list}
  function expression(min){
    const first=take();let node;
    if(first.kind==='literal')node={type:'literal',v:first.value};
    else if(first.kind==='name')node={type:'name',v:first.value};
    else if(first.value==='('){node=expression(0);expect(')')}
    else if(first.value==='[')node={type:'array',args:args(']')};
    else if(['-','+','!'].includes(first.value))node={type:'unary',op:first.value,a:expression(7)};
    else throw Error('第 '+(first.at+1)+' 个字符处需要数值或属性');
    while(true){
      if(token.value==='.'){take();if(token.kind!=='name')throw Error('缺少属性名');node={type:'member',a:node,b:{type:'literal',v:take().value}};continue}
      if(token.value==='['){take();const key=expression(0);expect(']');node={type:'member',a:node,b:key};continue}
      if(token.value==='('){take();node={type:'call',a:node,args:args(')')};continue}
      const rank=operatorRank[token.value];
      if(!rank||rank<min)break;
      const op=take().value;node={type:'binary',op,a:node,b:expression(op==='**'?rank:rank+1)};
    }
    if(min===0&&token.value==='?'){take();const yes=expression(0);expect(':');node={type:'condition',test:node,yes,no:expression(0)}}
    return node;
  }
  token=scan();const tree=expression(0);if(token.value===';')take();if(token.kind!=='end')throw Error('第 '+(token.at+1)+' 个字符后有多余内容');
  if(expressionCache.size>512)expressionCache.clear();
  expressionCache.set(source,tree);return tree;
}
class SampledProperty{
  constructor(sample,time){this.sample=sample;this.time=time}
}
function unwrapValue(v){return v instanceof SampledProperty?v.sample(v.time):v}
function binaryValue(op,a,b){
  if(Array.isArray(a)||Array.isArray(b)){const n=Array.isArray(a)?a.length:b.length;return Array.from({length:n},(_,i)=>binaryValue(op,Array.isArray(a)?a[i]:a,Array.isArray(b)?b[i]:b))}
  switch(op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '**':return a**b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;case '==':case '===':return a===b;case '!=':case '!==':return a!==b}
}
function runMotionExpression(source,scope){
  function visit(n){
    switch(n.type){
      case 'literal':return n.v;
      case 'name':if(Object.hasOwn(scope,n.v))return scope[n.v];throw Error('未知名称「'+n.v+'」');
      case 'member':{
        const o=visit(n.a),k=unwrapValue(visit(n.b));
        if(o instanceof SampledProperty){if(k==='valueAtTime')return t=>o.sample(t);if(/^[012]$/.test(k))return new SampledProperty(tt=>o.sample(tt)[k],o.time)}
        if(o?.readProperty)return o.readProperty(k);
        if(o!=null&&Object.hasOwn(o,k)&&!['__proto__','constructor','prototype','caller','callee','arguments'].includes(k))return o[k];
        throw Error('未知成员「'+k+'」');
      }
      case 'call':{const fn=visit(n.a);if(typeof fn!=='function')throw Error('该属性不可调用');return fn(...n.args.map(a=>unwrapValue(visit(a))))}
      case 'array':return n.args.map(a=>unwrapValue(visit(a)));
      case 'unary':{const v=unwrapValue(visit(n.a));return n.op==='!'?!v:n.op==='-'?binaryValue('*',v,-1):v}
      case 'binary':{const a=unwrapValue(visit(n.a));if(n.op==='&&')return a&&unwrapValue(visit(n.b));if(n.op==='||')return a||unwrapValue(visit(n.b));return binaryValue(n.op,a,unwrapValue(visit(n.b)))}
      case 'condition':return unwrapValue(visit(n.test))?visit(n.yes):visit(n.no)
    }
  }
  return unwrapValue(visit(parseMotionExpression(source)));
}
