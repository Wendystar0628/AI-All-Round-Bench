const parsed = new Map();
const clone = x => x === undefined ? null : structuredClone(x);
export {clone};
export const bytes = x => JSON.stringify(x)?.length * 2 || 0;
export function compile(text, opcode=x=>x) {
  if (parsed.has(text) && opcode === identity) return parsed.get(text);
  const tree = acorn.parse(text,{ecmaVersion:2022});
  const functions = {};
  function assemble(rows) {
    const out = [];
    const emit = (op,arg,extra) => out.push({op:opcode(op),arg,extra});
    const block = node => {
      switch(node.type) {
        case 'BlockStatement': node.body.forEach(block);break;
        case 'EmptyStatement':break;
        case 'VariableDeclaration': for(const d of node.declarations){if(d.id.type!=='Identifier')throw Error('需要变量名称');emit('let',d.id.name,d.init);}break;
        case 'ExpressionStatement':emit('expr',node.expression);break;
        case 'ReturnStatement':emit('return',node.argument);break;
        case 'IfStatement':{
          const i=out.length;emit('branch',node.test,0);block(node.consequent);
          if(node.alternate){const j=out.length;emit('jump',0);out[i].extra=out.length;block(node.alternate);out[j].arg=out.length;}
          else out[i].extra=out.length;
          break;
        }
        case 'WhileStatement':
        case 'ForStatement':{
          if(node.init)block(node.init.type==='VariableDeclaration'?node.init:{type:'ExpressionStatement',expression:node.init});
          const i=out.length;emit('branch',node.test,0);block(node.body);
          if(node.update)emit('expr',node.update);
          emit('jump',i);out[i].extra=out.length;break;
        }
        default:throw Error('不支持的语句 '+node.type);
      }
    };
    rows.forEach(block);emit('return',null);return out;
  }
  const main=[];
  for(const node of tree.body){
    if(node.type==='FunctionDeclaration')functions[node.id.name]={params:node.params.map(p=>p.name),code:assemble(node.body.body)};
    else main.push(node);
  }
  const result={code:assemble(main),functions};
  if(opcode===identity)parsed.set(text,result);
  return result;
}
export function identity(x){return x;}
const math={abs:Math.abs,min:Math.min,max:Math.max,round:Math.round,floor:Math.floor,ceil:Math.ceil,sin:Math.sin,cos:Math.cos,sqrt:Math.sqrt,pow:Math.pow,atan2:Math.atan2,len:x=>x?.length??0,number:Number,string:String,copy:clone};
const binary={
  '+':(a,b)=>{
    if((typeof a==='string'||typeof b==='string')&&String(a).length+String(b).length>2**21)throw Error('字符串超过虚拟机单值上限');
    return a+b;
  },'-':(a,b)=>a-b,'*':(a,b)=>a*b,'/':(a,b)=>a/b,'%':(a,b)=>a%b,'**':(a,b)=>a**b,
  '<':(a,b)=>a<b,'>':(a,b)=>a>b,'<=':(a,b)=>a<=b,'>=':(a,b)=>a>=b,'==':(a,b)=>a===b,'===':(a,b)=>a===b,'!=':(a,b)=>a!==b,'!==':(a,b)=>a!==b
};
const banned = new Set(['__proto__','constructor','prototype']);
function cyclic(value,target,seen=new WeakSet()){
  if(value==null||typeof value!=='object')return false;
  if(value===target)return true;
  if(seen.has(value))return false;
  seen.add(value);
  return Object.values(value).some(v=>cyclic(v,target,seen));
}
function keyOf(n,v,sys,journal) {const key=n.computed?evaluate(n.property,v,sys,journal):n.property.name;if(banned.has(String(key)))throw Error('禁止访问该属性');return key;}
function get(o,k){return o!=null&&Object.hasOwn(Object(o),k)?o[k]:null;}
function evaluate(n,v,sys,journal){
  if(!n)return null;
  const e=x=>evaluate(x,v,sys,journal);
  switch(n.type){
    case 'Literal':return n.value;
    case 'Identifier':return get(v,n.name);
    case 'ArrayExpression':return n.elements.map(e);
    case 'ObjectExpression':return Object.fromEntries(n.properties.map(p=>[p.computed?e(p.key):p.key.name??p.key.value,e(p.value)]).filter(([k])=>!banned.has(k)));
    case 'MemberExpression':return get(e(n.object),keyOf(n,v,sys,journal));
    case 'UnaryExpression':{const x=e(n.argument);switch(n.operator){case '!':return !x;case '-':return -x;case '+':return +x;default:throw Error('未知一元运算');}}
    case 'BinaryExpression':{const op=binary[n.operator];if(!op)throw Error('未知运算符');return op(e(n.left),e(n.right));}
    case 'LogicalExpression':{const l=e(n.left);return n.operator==='&&'?l&&e(n.right):n.operator==='||'?l||e(n.right):l??e(n.right);}
    case 'ConditionalExpression':return e(n.test)?e(n.consequent):e(n.alternate);
    case 'AssignmentExpression':
    case 'UpdateExpression':{
      const a=n.left??n.argument; const obj=a.type==='Identifier'?v:e(a.object);
      const key=a.type==='Identifier'?a.name:keyOf(a,v,sys,journal);
      if(!obj||typeof obj!=='object'||banned.has(String(key))||(Array.isArray(obj)&&(key==='length'||+key>50000)))throw Error('不可写入');
      const old=get(obj,key);
      const value=n.type==='UpdateExpression'?Number(old)+(n.operator==='++'?1:-1):n.operator==='='?e(n.right):binary[n.operator.slice(0,-1)](old,e(n.right));
      if(cyclic(value,obj))throw Error('虚拟机变量不能包含循环引用');
      if(journal)journal.push({obj,key,had:Object.hasOwn(obj,key),old,length:Array.isArray(obj)?obj.length:null});
      obj[key]=value;return n.type==='UpdateExpression'&&!n.prefix?old:value;
    }
    case 'CallExpression':{
      const name=n.callee.name;if(!name)throw Error('只能调用命名服务');
      const args=n.arguments.map(e);
      return Object.hasOwn(math,name)?math[name](...args):sys(name,args);
    }
    default:throw Error('不支持的表达式 '+n.type);
  }
}
export function instruction(machine,code,sys,rollback=false){
  const journal=rollback?[]:null;
  try{return execute(machine,code,sys,journal);}
  catch(err){
    if(journal)for(let i=journal.length-1;i>=0;i--){
      const {obj,key,had,old,length}=journal[i];
      if(had)obj[key]=old;else delete obj[key];
      if(length!==null)obj.length=length;
    }
    throw err;
  }
}
function execute(machine, code, sys, journal){
  const row=code[machine.pc];if(!row)return {done:true,value:null};
  const v=machine.vars, e=n=>evaluate(n,v,sys,journal);
  switch(row.op){
    case 'let': if(!banned.has(row.arg))v[row.arg]=e(row.extra);break;
    case 'expr':e(row.arg);break;
    case 'return':return {done:true,value:e(row.arg)};
    case 'branch':if(row.arg&&!e(row.arg)){machine.pc=row.extra;return null;}break;
    case 'jump':machine.pc=row.arg;return null;
    default:throw Error('未知指令 '+row.op);
  }
  machine.pc++;return null;
}
export function invoke(program,name,args,sys,limit=800){
  const fn=program.functions[name];if(!fn)return null;
  const machine={pc:0,vars:Object.fromEntries(fn.params.map((p,i)=>[p,args[i]]))};
  for(let used=1;used<=limit;used++){
    const out=instruction(machine,fn.code,sys);
    if(out)return {value:out.value,used};
  }
  throw Error('服务函数执行超限 '+name);
}
