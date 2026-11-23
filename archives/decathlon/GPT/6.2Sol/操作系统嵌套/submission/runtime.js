import {compile,invoke,instruction,clone,bytes,identity} from './vm.js';
import {programs,workbook,KERNEL,COMPILER,SCENE} from './fixtures.js';
export const STEP=.04;
export const fileName=p=>p?.split('/').filter(Boolean).at(-1)??'';
export const dirName=p=>p.slice(0,p.lastIndexOf('/'))||'/';
export const join=(a,b)=>(a==='/'?'':a)+'/'+b;
export const stateNames={ready:'就绪',running:'运行',waiting:'等待',suspended:'挂起',ended:'结束',error:'异常',paused:'暂停',stopped:'已停止'};
const terminal=p=>p.state==='ended'||p.state==='error';
const wait=Symbol('wait'),yieldBudget=Symbol('yield-budget');
const deviceWait=Object.freeze({waiting:true});
let sourceScene='', sourceReadme='', logicalStep=0;
export function setFixtures(scene,readme){sourceScene=scene;sourceReadme=readme;}
export const world={serial:0,windowSerial:0,docSerial:0,systems:{}};
export const systems=()=>Object.values(world.systems);
export const byId=id=>world.systems[id];
export function instanceToken(s){return s.instanceToken??=globalThis.crypto.randomUUID();}
export const children=s=>systems().filter(x=>x.parentId===s.id);
export const ancestry=s=>{const a=[];for(let x=s;x;x=byId(x.parentId))a.unshift(x);return a;};
export function effective(s){
  for(const x of ancestry(s)){
    const carrier=byId(x.parentId)?.procs[x.carrier];
    if(carrier?.state==='suspended')return 'suspended';
    if(x.state!=='running'&&!x.stepping)return x.state;
  }
  return 'running';
}
const isRoot=s=>s.id==='outer';
const node=(content='',kind='file')=>({kind,content});
function files(root){
  return {
    '/':node('','dir'),'/Documents':node('','dir'),'/Downloads':node('','dir'),'/Trash':node('','dir'),
    '/Demo':node('','dir'),'/System':node('','dir'),'/Programs':node('','dir'),'/Snapshots':node('','dir'),
    '/Documents/操作说明.txt':node(sourceReadme),
    '/Documents/观测记录.txt':node('层栈观测记录\n高地观测站 · 24 号\n\n风向偏西，场地已清空。'),
    [SCENE]:node(sourceScene),
    ...(root?{'/Demo/sample.sheet':node(JSON.stringify(workbook,null,2))}:{}),
    ...Object.fromEntries(Object.entries(programs).map(([p,v])=>[p,node(v)]))
  };
}
export const bridge={change:()=>{},event:()=>{},stop:()=>{},notify:()=>{},sceneCost:()=>0,eventCost:()=>0,extraMemory:()=>0};
export function fresh(parent=null){
  const id=parent?'inner-'+(++world.serial):'outer';
  const s={id,parentId:parent?.id??null,name:parent?id:'层栈桌面',state:'running',rate:1,time:0,epoch:Date.now(),
    grant:parent?1100:12000,budget:parent?1800:12000,memory:parent?48*1024*1024:256*1024*1024,storage:parent?64*1024*1024:352*1024*1024,
    actual:0,kUsed:0,inUsed:0,cursor:0,pid:0,procs:{},files:files(!parent),wins:{},z:0,focus:null,
    settings:{wallpaper:parent?'ridge':'dawn',accent:parent?['#ef995d','#76c1ae','#ac96f4'][(ancestry(parent).length-1)%3]:'#f3a777',scale:1,dnd:false},
    notes:[],clips:[],note:'',wmpid:null,kernel:null,kernelSource:'',error:'',booted:false};
  world.systems[id]=s;
  if(parent){
    s.kernelPath='/System/'+id+'.str';
    try{
      reserveMemory(parent,ownMemory(s)+768);
      writeFile(parent,s.kernelPath,readFile(parent,KERNEL));
      startCarrier(parent,s);
    }catch(err){delete world.systems[id];delete parent.files[s.kernelPath];throw err;}
  }
  return s;
}
function startCarrier(parent,s){
  s.carrier=spawnNative(parent,'内核 / '+s.id,'carrier',null,{target:s.id}).pid;
  reloadKernel(parent,s);
}
function reloadKernel(parent,s){
  try{
    s.kernelSource=readFile(parent,s.kernelPath);
    const k=compile(s.kernelSource,identity);
    for(const name of ['choose','onCall','boot'])if(!k.functions[name])throw Error('缺少内核入口 '+name);
    s.state='running';s.error='';s.booted=false;s.bootMachine=null;
  }catch(err){s.error=err.message;s.state='error';}
}
function kernel(s,name,args,primitives){
  if(isRoot(s)||!s.kernelSource)return null;
  const out=invoke(compile(s.kernelSource,identity),name,args,primitives);
  if(out)s.kernelDebt=(s.kernelDebt??0)+out.used;
  return out;
}
export function rule(s,pid,name,args,fallback){
  const p=s.procs[pid];if(!p?.source)return fallback;
  const result=invoke(compile(p.source,identity),name,clone(args),()=>null);
  if(result)p.debt=(p.debt??0)+result.used;
  return result?result.value:fallback;
}
function fileRule(s,mode,path,value){return kernel(s,'file',[mode,path,value],()=>null)?.value??value;}
export function readFile(s,path){
  const f=s.files[path];if(!f||f.kind==='dir')throw Error('文件不存在 '+path);
  return String(fileRule(s,'read',path,f.content));
}
export function listFiles(s,path){
  const names=Object.keys(s.files).filter(k=>k!=='/'&&dirName(k)===path);
  const result=fileRule(s,'list',path,names);
  return Array.isArray(result)?result.filter(k=>Object.hasOwn(s.files,k)):names;
}
const ownStorage=s=>Object.values(s.files).reduce((n,f)=>n+f.content.length*2+56,0);
const pMemory=p=>terminal(p)?0:bytes(p.vars)+bytes(p.inbox)+bytes(p.pending)+bytes(p.jobs)+bytes(p.output)+256;
function windowMemory(w){
  if(w.appId==='projection')return 256;
  if(w.appId!=='player'||!w.data.asset)return bridge.sceneCost(w)+bytes(w.data??null);
  const {asset,record,packet,log,assetBytes,...state}=w.data;
  const {resource,...view}=packet??{};
  const logSize=log?(log.frames?.length??0)*140+(log.controls?.length??0)*128+bytes(log.inputs)+bytes(log.initial):0;
  return bridge.sceneCost(w)+(assetBytes??bytes(asset))+bytes(state)+bytes(view)+logSize;
}
const ownMemory=s=>bridge.extraMemory(s)+Object.values(s.procs).reduce((n,p)=>n+pMemory(p),0)+Object.values(s.wins).reduce((n,w)=>n+windowMemory(w),0);
function treeCost(s,fn){return fn(s)+children(s).reduce((n,c)=>n+treeCost(c,fn),0);}
export const storageUsed=s=>treeCost(s,ownStorage);
export const memoryUsed=s=>treeCost(s,ownMemory);
export const procMem=p=>pMemory(p);
export function reserveMemory(s,delta){check(s,delta,memoryUsed,'memory');}
function check(s,delta,used,field){
  if(delta<=0)return;
  for(const a of ancestry(s))if(used(a)+delta>a[field])throw Error(field==='memory'?'内存配额不足':'存储配额不足');
}
export function writeFile(s,path,content,kind='file',extra={}){
  if(typeof path!=='string'||path==='/'||!path.startsWith('/')||path.slice(1).split('/').some(part=>!part||part==='.'||part==='..')||s.files[dirName(path)]?.kind!=='dir')throw Error('目标路径或目录无效');
  if(s.files[path]&&s.files[path].kind!==kind)throw Error('同名项目类型不同');
  content=String(fileRule(s,'write',path,String(content)));
  check(s,2*content.length+56-(s.files[path]?s.files[path].content.length*2+56:0),storageUsed,'storage');
  s.files[path]={kind,content,...extra};return true;
}
export function moveFile(s,from,to){
  if(!s.files[from]||from==='/'||s.files[dirName(to)]?.kind!=='dir'||s.files[to]||to.startsWith(from+'/'))throw Error('无法移动到该位置');
  for(const path of Object.keys(s.files).filter(p=>p===from||p.startsWith(from+'/'))){s.files[to+path.slice(from.length)]=s.files[path];delete s.files[path];}
}
export function deleteFile(s,path){
  if(path==='/')throw Error('不能删除根目录');
  for(const p of Object.keys(s.files))if(p===path||p.startsWith(path+'/'))delete s.files[p];
}
export function transferFiles(origin,target,paths,folder,cut=false,overwrite=false){
  if(target.files[folder]?.kind!=='dir')throw Error('目标目录不存在');
  if(cut&&effective(origin)!=='running')throw Error('源系统已暂停或停止，无法移动文件');
  const selected=[...new Set(paths)].filter(p=>!paths.some(q=>p!==q&&p.startsWith(q+'/')));
  const original=target.files, staged={...original}, removals=[], destinations=new Set();
  let count=0;
  for(const from of selected){
    if(from==='/'||!origin.files[from])throw Error('源文件已移动或删除');
    let to=join(folder,fileName(from));
    if(origin===target&&from===to){
      if(cut)continue;
      to=join(folder,'副本 - '+fileName(from));
      for(let i=2;staged[to];i++)to=join(folder,'副本 '+i+' - '+fileName(from));
    }
    if(destinations.has(to))throw Error('选中的项目在目标目录同名');
    if(staged[to]&&!overwrite)throw Error('目标已出现同名项目，请确认覆盖后重试');
    if(origin===target&&(to.startsWith(from+'/')||selected.some(p=>p!==from&&(p===to||to.startsWith(p+'/')))))throw Error('目标与源目录重叠');
    destinations.add(to);
    const entries=Object.keys(origin.files).filter(p=>p===from||p.startsWith(from+'/'));
    for(const path of entries){
      const key=to+path.slice(from.length), entry=origin.files[path];
      if(staged[key]&&staged[key].kind!==entry.kind)throw Error('同名项目类型不同 · '+fileName(key));
      if(staged[key]&&!overwrite)throw Error('目标目录中有同名项目 · '+fileName(key));
      if(staged[dirName(key)]?.kind!=='dir')throw Error('目标目录不存在');
      const source=entry.kind==='dir'?'':readFile(origin,path);
      const content=String(fileRule(target,'write',key,source));
      staged[key]={kind:entry.kind,content};
    }
    if(cut)removals.push(from);
    count++;
  }
  if(origin===target)for(const from of removals)for(const p of Object.keys(staged))if(p===from||p.startsWith(from+'/'))delete staged[p];
  const delta=ownStorage({files:staged})-ownStorage(target);
  for(const a of ancestry(target)){
    const freed=origin!==target&&cut&&ancestry(origin).includes(a)?Object.entries(origin.files).reduce((n,[p,f])=>n+(removals.some(q=>p===q||p.startsWith(q+'/'))?f.content.length*2+56:0),0):0;
    if(delta>freed&&storageUsed(a)+delta-freed>a.storage)throw Error('存储配额不足，文件传递未提交');
  }
  target.files=staged;
  if(origin!==target)for(const from of removals)deleteFile(origin,from);
  return count;
}
function createProc(s,name,extra){
  const p={pid:++s.pid,name,state:'ready',limit:4096,used:0,total:0,inner:0,kernel:0,pc:0,vars:{},inbox:[],jobs:[],output:[],error:'',...extra};
  check(s,pMemory(p),memoryUsed,'memory');s.procs[p.pid]=p;
  return p;
}
export function spawnNative(s,name,kind,winId,vars={}){
  return createProc(s,name,{kind,winId,vars});
}
const executables=new Map();
function binary(p){return p.executable??executables.get(p.source)??compile(p.source,identity);}
export function spawn(s,path,vars={},winId=null){
  const source=readFile(s,path);
  const compiler=s.compilerProgram??compile(s.compilerSource??programs[COMPILER],identity);
  let compileCost=0;
  const assembled=compile(source,op=>{
    const result=invoke(compiler,'opcode',[op],()=>null,100);
    compileCost+=1+(result?.used??0);
    return result?.value??op;
  });
  s.kernelDebt=(s.kernelDebt??0)+compileCost;
  const p=createProc(s,fileName(path),{kind:'code',path,source,executable:s.compilerSource?assembled:null,vars:clone(vars),winId});
  if(!s.compilerSource)executables.set(source,assembled);
  return p;
}
export function activateCompiler(s,path=COMPILER){
  const source=readFile(s,path);
  const parsed=compile(source,identity);
  if(!Object.hasOwn(parsed.functions,'opcode')||parsed.functions.opcode.params.length!==1)
    throw Error('编译器必须导出 opcode(name)');
  const p=spawn(s,path);
  s.compilerSource=source;s.compilerProgram=clone(binary(p));
  return p;
}
function mailbox(s,pid){
  const p=s.procs[pid];return p&&!terminal(p)?p:null;
}
const missingRecipient=()=>({ok:false,error:'收件进程已结束或不存在'});
function placeMessage(s,pid,data,from){
  const p=mailbox(s,pid);
  if(!p)return missingRecipient();
  check(s,bytes(data)+48,memoryUsed,'memory');
  p.inbox.push({from,value:data});
  return {ok:true};
}
export function enqueue(s,pid,value,from=0){
  if(!mailbox(s,pid))return missingRecipient();
  const original=clone(value),x=kernel(s,'deliver',[pid,original,from],()=>null);
  return placeMessage(s,pid,x?x.value:original,from);
}
export function queue(s,pid,message,cost=1){
  const p=s.procs[pid];if(!p||terminal(p))return false;
  check(s,bytes(message)+32,memoryUsed,'memory');
  p.jobs.push({message:clone(message),left:Math.max(1,Math.ceil(cost))});return true;
}
export function endProc(s,p){
  if(!p||terminal(p))return;
  const target=p.vars.target;
  p.state='ended';p.vars={};p.inbox=[];p.jobs=[];p.pending=null;
  if(p.kind==='carrier')stopTree(byId(target));
  bridge.stop(s,p);
}
export function stopTree(s){
  if(!s)return;
  s.state='stopped';for(const c of children(s))stopTree(c);
  for(const p of Object.values(s.procs))if(!terminal(p)){p.state='ended';p.inbox=[];p.jobs=[];p.pending=null;p.vars={};bridge.stop(s,p);}
}
export function restartTree(s){
  const parent=byId(s.parentId), keep=children(s);
  stopTree(s);
  s.time=0;s.epoch=Date.now();s.visit=-1;s.clockStep=-1;s.stepping=false;s.stepRequested=false;s.cursor=0;s.scheduler=null;s.procs={};s.actual=0;s.kUsed=0;s.inUsed=0;s.wins={};s.z=0;s.focus=null;s.wmpid=null;s.bootMachine=null;s.kernelDebt=0;s.compilerSource=null;s.compilerProgram=null;
  if(parent.procs[s.carrier])parent.procs[s.carrier].state='ended';
  startCarrier(parent,s);s.autoPlayer=s.state==='running';
  for(const c of keep)restartTree(c);
}
function primitive(s,p,name,args){
  const [a,b]=args;
  switch(name){
    case 'clock':return s.time;
    case 'identity':return p.pid;
    case 'waitTime':p.until=s.time+Math.max(0,Number(a)||0);p.state='waiting';return null;
    case 'dequeue':{
      if(p.inbox.length)return p.inbox.shift().value;
      if(a){p.state='waiting';p.until=null;return deviceWait;}return null;
    }
    case 'enqueue':return enqueue(s,a,b,p.pid);
    case 'getFile':return readFile(s,a);
    case 'putFile':return writeFile(s,a,b);
    case 'makeDirectory':return writeFile(s,a,'','dir');
    case 'moveEntry':moveFile(s,a,b);return true;
    case 'fileNames':return listFiles(s,a);
    case 'launch':return spawn(s,a,b??{},null).pid;
    case 'terminate':endProc(s,s.procs[a]);return true;
    case 'report':p.output.push(String(typeof a==='string'?a:JSON.stringify(a)).slice(0,8192));if(p.output.length>80)p.output.shift();return true;
    case 'submit':return bridge.event(s,p,'display',a);
    case 'readSensor':return bridge.event(s,p,'sensor',null);
    case 'writeControl':return bridge.event(s,p,'control',a);
    case 'deviceCommand':
      if(p.path?.startsWith('/System/'))return bridge.event(s,p,a,b);
      throw Error('此程序没有设备命令权限');
    default:throw Error('未知内核原语 '+name);
  }
}
const sysNames={time:'clock',self:'identity',sleep:'waitTime',recv:'dequeue',poll:'dequeue',send:'enqueue',read:'getFile',write:'putFile',mkdir:'makeDirectory',move:'moveEntry',list:'fileNames',spawn:'launch',kill:'terminate',print:'report',display:'submit',sensor:'readSensor',control:'writeControl',event:'deviceCommand'};
function routine(fn,args){
  return {pc:0,vars:Object.fromEntries(fn.params.map((key,i)=>[key,args[i]])),paid:false,calls:[],ops:0};
}
function runRoutine(machine,fn,pay,dispatch,limit){
  while(true){
    if(!machine.paid){
      pay();
      if(++machine.ops>limit)throw Error('服务函数执行超限');
      machine.paid=true;
    }
    let index=0;
    const out=instruction(machine,fn.code,(name,args)=>{
      const call=machine.calls[index]??={name,args};
      index++;
      if(!call.done){
        const value=dispatch(call);
        call.value=value??null;call.done=true;
      }
      return call.value;
    },true);
    machine.paid=false;machine.calls=[];
    if(out)return out.value;
  }
}
function requireValue(result){
  if(result===deviceWait)throw wait;
  return result;
}
function systemCall(s,p,call,pay){
  const {name,args}=call;
  if(isRoot(s))return requireValue(primitive(s,p,sysNames[name],name==='recv'?[true]:name==='poll'?[false]:args));
  const {onCall:fn,deliver}=compile(s.kernelSource,identity).functions;
  call.machine??=routine(fn,[name,args]);
  let deviceError=null;
  try{
    return runRoutine(call.machine,fn,()=>pay(true),request=>{
      if(!Array.isArray(request.args))throw Error('内核调用参数需要数组');
      if(request.name==='enqueue'&&deliver){
        const [pid,value]=request.args;
        if(!mailbox(s,pid))return missingRecipient();
        request.delivery??=routine(deliver,[pid,clone(value),p.pid]);
        const data=runRoutine(request.delivery,deliver,()=>pay(true),()=>{throw Error('投递规则不提供设备原语');},4000);
        try{return placeMessage(s,pid,data,p.pid);}
        catch(err){deviceError=err;throw err;}
      }
      try{return requireValue(primitive(s,p,request.name,request.args));}
      catch(err){if(err===wait||!err.message?.startsWith('未知内核原语'))deviceError=err;throw err;}
    },4000);
  }catch(err){
    if(err!==yieldBudget&&err!==deviceError){
      s.state='error';s.error=err.message;bridge.notify(byId(s.parentId),'内核错误 '+s.id+' · '+s.error,'error');bridge.change();
    }
    throw err;
  }
}
function runnable(p,s){
  if(terminal(p)||p.state==='suspended'||p.used>=p.limit)return false;
  if(p.kind==='carrier'){
    const c=byId(p.vars.target);
    return c?.clockStep===logicalStep&&(c.state==='running'||c.stepping);
  }
  if(p.kind==='job')return p.jobs.length>0;
  if(p.state==='waiting'){
    if(p.until!=null)return s.time+1e-8>=p.until;
    return p.inbox.length>0;
  }
  return true;
}
function expressionUnits(expr,vars){
  if(!expr)return 0;
  switch(expr.type){
    case 'Identifier':return bytes(vars[expr.name]);
    case 'Literal':return bytes(expr.value);
    case 'ArrayExpression':return 2+expr.elements.reduce((n,x)=>n+2+expressionUnits(x,vars),0);
    case 'ObjectExpression':return 2+expr.properties.reduce((n,x)=>n+bytes(x.key?.name??x.key?.value??'')+expressionUnits(x.value,vars)+2,0);
    case 'MemberExpression':{
      const value=expr.object.type==='Identifier'?vars[expr.object.name]:null;
      const key=!expr.computed?expr.property.name:expr.property.type==='Identifier'?vars[expr.property.name]:expr.property.value;
      return value!=null&&Object.hasOwn(Object(value),key)?bytes(value[key]):0;
    }
    case 'BinaryExpression':case 'LogicalExpression':
      return expressionUnits(expr.left,vars)+expressionUnits(expr.right,vars);
    case 'ConditionalExpression':return Math.max(expressionUnits(expr.consequent,vars),expressionUnits(expr.alternate,vars));
    default:return 0;
  }
}
function workSize(p,row,s){
  if(!row)return 1;
  const call=row.op==='expr'&&row.arg?.type==='CallExpression'?row.arg.callee.name:row.op==='let'&&row.extra?.type==='CallExpression'?row.extra.callee.name:null;
  if(call==='recv'&&p.inbox.length)return 1+Math.ceil(bytes(p.inbox[0])/256);
  if(call==='event'||call==='send'||call==='display'||call==='write'){
    const args=(row.op==='expr'?row.arg:row.extra).arguments;
    const get=expr=>expr?.type==='Literal'?expr.value:expr?.type==='Identifier'?p.vars[expr.name]:null;
    const payload=args[call==='display'?0:1],value=get(payload);
    return 1+Math.ceil(expressionUnits(payload,p.vars)/256)+(call==='event'?bridge.eventCost(s,p,get(args[0]),value):0);
  }
  if(call==='read'){const expr=row.extra?.arguments?.[0]??row.arg?.arguments?.[0];const path=expr?.value??p.vars[expr?.name];return 1+Math.ceil((s.files[path]?.content?.length??0)/256);}
  const expression=row.op==='let'?row.extra:row.op==='expr'||row.op==='branch'?row.arg:null;
  if(expression?.type==='AssignmentExpression'&&expression.operator==='+='&&typeof p.vars[expression.left.name]==='string')
    return 1+Math.ceil((bytes(p.vars[expression.left.name])+expressionUnits(expression.right,p.vars))/256);
  if(expression?.type==='BinaryExpression'&&['+','==','===','!=','!=='].includes(expression.operator)){
    const size=expressionUnits(expression,p.vars);
    if(size>256)return 1+Math.ceil(size/256);
  }
  return 1;
}
function userWork(s,p,quota){
  let used=0;
  if(p.kind==='job'){
    const job=p.jobs[0], cost=Math.min(job.left,quota);
    job.left-=cost;if(!job.left){p.jobs.shift();bridge.event(s,p,'job',job.message);}
    p.state=p.jobs.length?'ready':'waiting';return cost;
  }
  const program=binary(p),code=program.code;
  const pay=kernel=>{
    if(used>=quota)throw yieldBudget;
    used++;
    if(kernel){s.kUsed++;p.kernel++;}
  };
  function dispatch(call,depth=0){
    if(!Object.hasOwn(program.functions,call.name))return systemCall(s,p,call,pay);
    if(depth>=16)throw Error('程序函数嵌套超限');
    const fn=program.functions[call.name];
    call.machine??=routine(fn,call.args);
    return runRoutine(call.machine,fn,()=>pay(false),child=>dispatch(child,depth+1),4000);
  }
  while(used<quota){
    if(p.debt){const d=Math.min(p.debt,quota-used);p.debt-=d;used+=d;if(used===quota)break;}
    if(!p.pending)p.pending={left:workSize(p,code[p.pc],s),calls:[]};
    const paid=Math.min(p.pending.left,quota-used);
    used+=paid;p.pending.left-=paid;
    if(p.pending.left)break;
    p.state='running';
    let index=0;
    const calls=p.pending.calls??=[];
    try{
      const result=instruction(p,code,(name,args)=>{
        const call=calls[index]??={name,args};
        index++;
        if(!call.done){call.value=dispatch(call)??null;call.done=true;}
        return call.value;
      },calls.length>0||code[p.pc]?.op!=='jump');
      p.pending=null;
      if(result){if(result.value!==null)p.output.push(JSON.stringify(result.value));endProc(s,p);break;}
    }catch(err){if(err===wait||err===yieldBudget)break;err.vmUsed=used;throw err;}
    if(p.state!=='running')break;
    if(p.total+used>=(p.nextMemoryCheck??16)){
      p.nextMemoryCheck=p.total+used+16;
      if(pMemory(p)>s.memory||Object.values(p.vars).some(v=>typeof v==='object'&&v!==null||typeof v==='string'&&v.length>64)&&ancestry(s).some(a=>memoryUsed(a)>a.memory)){
        const err=Error('系统共享内存配额不足');err.vmUsed=used;throw err;
      }
    }
  }
  if(p.state==='running')p.state='ready';
  return used;
}
function advanceClock(s,delta,allowStep=true){
  const carrier=byId(s.parentId)?.procs[s.carrier];
  if(s.parentId&&(!carrier||terminal(carrier)||carrier.state==='suspended'))return;
  const stepping=allowStep&&s.state==='paused'&&s.stepRequested;
  if(s.state!=='running'&&!stepping)return;
  s.stepping=Boolean(stepping);
  if(stepping)s.stepRequested=false;
  s.clockStep=logicalStep;s.stepDelta=delta*s.rate;s.time+=s.stepDelta;
  s.actual=0;s.kUsed=0;s.inUsed=0;
  for(const p of Object.values(s.procs)){p.used=0;p.kernel=0;p.inner=0;p.allocated=0;}
  for(const child of children(s))advanceClock(child,s.stepDelta,allowStep&&!stepping);
}
function grants(s,incoming){
  if(s.clockStep!==logicalStep||s.state!=='running'&&!s.stepping)return 0;
  if(s.visit!==logicalStep){
    s.visit=logicalStep;
    try{bridge.event(s,null,'tick',s.stepDelta);}catch(err){bridge.notify(s,'系统服务 · '+err.message,'error');}
  }
  let remaining=Math.min(incoming,Math.max(0,s.budget-s.actual));
  const granted=remaining;
  const pay=()=>{const cost=Math.min(remaining,s.kernelDebt??0);s.kernelDebt=(s.kernelDebt??0)-cost;s.kUsed+=cost;remaining-=cost;};
  try{
    if(!s.booted&&!isRoot(s)&&remaining>0){
      pay();
      const fn=compile(s.kernelSource,identity).functions.boot;
      const machine=s.bootMachine??=routine(fn,[]);
      const boot=runRoutine(machine,fn,()=>{
        if(remaining<=0)throw yieldBudget;
        remaining--;s.kUsed++;
      },({name,args:[path]})=>{
        if(name!=='launch')throw Error('未知启动原语 '+name);
        const pid=spawn(s,path).pid;
        if(!machine.wmCandidate||path==='/System/window.str')machine.wmCandidate=pid;
        return pid;
      },4000);
      const pid=Number.isInteger(boot)&&s.procs[boot]?boot:machine.wmCandidate;
      if(!pid)throw Error('启动入口未创建窗口管理进程');
      s.wmpid=pid;s.booted=true;s.bootMachine=null;
    }
    let cycles=0;
    while(remaining>0&&cycles++<1000){
      pay();if(remaining<=0)break;
      const procs=Object.values(s.procs).filter(p=>!terminal(p));

      const actualReady=i=>procs[i]&&runnable(procs[i],s)&&procs[i].blockedStep!==logicalStep&&!(procs[i].kind==='carrier'&&(procs[i].allocated??0)>=(byId(procs[i].vars.target)?.grant??0));
      let index=-1;
      if(!procs.some((_,i)=>actualReady(i)))break;
      if(isRoot(s)){for(let i=0;i<procs.length;i++){const n=(s.cursor+i)%procs.length;if(actualReady(n)){index=n;break;}}}
      else{
        const fn=compile(s.kernelSource,identity).functions.choose;
        if(!s.scheduler){
          const args=[s.cursor%procs.length,procs.length];
          s.scheduler={ids:procs.map(p=>p.pid),pc:0,ops:0,vars:Object.fromEntries(fn.params.map((p,i)=>[p,args[i]]))};
        }
        const m=s.scheduler;
        if(!Object.hasOwn(m,'picked')){
          while(remaining>0){
            if(++m.ops>2000)throw Error('调度函数未在 2000 条指令内返回');
            remaining--;s.kUsed++;
            const result=instruction(m,fn.code,(op,[i])=>{
              if(op!=='ready')throw Error('未知调度原语 '+op);
              return actualReady(procs.findIndex(p=>p.pid===m.ids[i]));
            });
            if(result){
              const choice=result.value;
              if(!Number.isInteger(choice)||choice<-1||choice>=m.ids.length)throw Error('调度返回了无效索引');
              m.picked=choice===-1?null:m.ids[choice];break;
            }
          }
        }
        if(m.picked===undefined||remaining===0)break;
        index=procs.findIndex(p=>p.pid===m.picked);s.scheduler=null;
        if(index<0||!actualReady(index))continue;
      }
      if(index<0)break;
      const p=procs[index];
      s.cursor=(index+1)%procs.length;
      if(!actualReady(index))break;
      let quota=Math.min(remaining,p.limit-p.used,p.kind==='carrier'?160:38),used=0;
      const startKernel=s.kUsed;
      try{
        if(p.kind==='carrier'){
          const c=byId(p.vars.target);quota=Math.min(quota,c.grant-(p.allocated??0));
          const k=c.visit===logicalStep?c.kUsed:0, w=c.visit===logicalStep?c.inUsed:0;
          used=grants(c,quota);
          p.kernel+=c.kUsed-k;p.inner+=c.inUsed-w;p.allocated=(p.allocated??0)+quota;
          if(!used)p.blockedStep=logicalStep;
        }else used=userWork(s,p,quota);
      }catch(err){p.state='error';p.error=err.message;p.pending=null;p.vars={};p.jobs=[];p.inbox=[];bridge.notify(s,p.name+'：'+p.error,'error');used=Math.min(quota,Math.max(1,err.vmUsed??used));}
      p.used+=used;p.total+=used;remaining-=used;s.inUsed+=used-(s.kUsed-startKernel);
      if(!used&&p.kind!=='carrier')p.blockedStep=logicalStep;
      if(s.state==='error')break;
    }
    pay();
  }catch(err){
    if(err!==yieldBudget){s.state='error';s.error=err.message;bridge.notify(byId(s.parentId)??s,'内核错误 '+s.id+' · '+err.message,'error');bridge.change();}
  }
  const consumed=granted-remaining;s.actual+=consumed;return consumed;
}
export function tick(){
  const root=byId('outer');if(!root)return;
  logicalStep++;advanceClock(root,STEP);grants(root,root.budget);
  for(const s of systems())if(s.stepping)s.stepping=false;
}
export function exportWorld(){return clone(world);}
export function loadWorld(data){
  Object.assign(world,data??{serial:0,docSerial:0,windowSerial:0,systems:{}});
  for(const s of systems()){s.visit=-1;s.clockStep=-1;s.stepping=false;for(const p of Object.values(s.procs))p.blockedStep=-1;}
  if(!byId('outer'))fresh();
}
export function snapshot(s){
  const all=[];
  const visit=x=>{all.push(clone(x));children(x).forEach(visit);};
  visit(s);return {version:1,root:s.id,systems:all};
}
export function restoreTree(parent,snap,target=null){
  if(snap.version!==1||!Array.isArray(snap.systems)||snap.systems.length>128)throw Error('无法识别快照');
  const incoming=new Map(snap.systems.map(x=>[x.id,x]));
  if(!incoming.has(snap.root)||incoming.size!==snap.systems.length)throw Error('快照的系统标识不完整');
  for(const s of snap.systems){
    if(!/^inner-[1-9]\d*$/.test(s.id)||!s.files?.['/']||!s.files?.['/System']||!s.wins||!s.procs||typeof s.kernelSource!=='string')throw Error('快照系统数据无效');
    let id=s.id;const seen=new Set();
    while(id!==snap.root){
      if(!incoming.has(id)||seen.has(id))throw Error('快照的父子结构无效');
      seen.add(id);id=incoming.get(id).parentId;
    }
  }
  const prior=target?byId(target):null;
  if(target&&prior?.parentId!==parent.id)throw Error('只能恢复直属子系统');
  const old=new Set();
  function mark(s){old.add(s.id);children(s).forEach(mark);}
  if(prior)mark(prior);
  const outside=systems().filter(s=>!old.has(s.id));
  const usedIds=new Set(outside.map(s=>s.id));
  const usedWindows=new Set(outside.flatMap(s=>Object.keys(s.wins)));
  const idmap=Object.create(null),winmap=Object.create(null);
  let serial=world.serial,windowSerial=world.windowSerial;
  const allocate=(id,used,prefix,increment)=>{
    while(!id||used.has(id))id=prefix+increment();
    used.add(id);return id;
  };
  for(const s of snap.systems){
    const wanted=target?(s.id===snap.root?target:s.id):null;
    idmap[s.id]=allocate(wanted,usedIds,'inner-',()=>++serial);
  }
  for(const s of snap.systems)for(const w of Object.values(s.wins)){
    if(!/^win-[1-9]\d*$/.test(w.id)||Object.hasOwn(winmap,w.id))throw Error('快照窗口标识无效或重复');
    winmap[w.id]=allocate(target?w.id:null,usedWindows,'win-',()=>++windowSerial);
  }
  const states=clone(snap.systems);
  const tokens=Object.fromEntries(states.map(s=>[s.id,globalThis.crypto.randomUUID()]));
  for(const s of states){
    const prev=s.id;s.id=idmap[s.id];s.instanceToken=tokens[prev];s.parentId=prev===snap.root?parent.id:idmap[s.parentId];s.visit=-1;s.clockStep=-1;s.stepping=false;
    if(prev!==s.id){
      if(!target||s.name===prev)s.name=s.id;
      s.kernelPath='/System/'+s.id+'.str';
    }
    const wins={};
    for(const w of Object.values(s.wins)){
      w.id=winmap[w.id];w.systemId=s.id;
      if(w.appId==='system')w.target=idmap[w.target];
      if(w.appId==='projection'){
        w.sourceSystemId=idmap[w.sourceSystemId];w.sourceWindowId=winmap[w.sourceWindowId];
        if(!w.sourceSystemId||!w.sourceWindowId)continue;
      }
      if(w.appId==='charts'){w.data.connectionState='已恢复，待重新连接';w.data.link=null;}
      wins[w.id]=w;
    }
    s.wins=wins;s.focus=winmap[s.focus]??null;
    for(const p of Object.values(s.procs)){
      p.blockedStep=-1;p.winId=winmap[p.winId]??null;
      if(p.kind==='carrier'){
        p.vars.target=idmap[p.vars.target];
        if(p.vars.target)p.name='内核 / '+p.vars.target;
      }
      if(p.displayWindow)p.displayWindow=winmap[p.displayWindow]??null;
      const app=wins[p.winId];
      if(app?.data.controller===p.pid&&p.vars.flightWindow)p.vars.flightWindow=p.winId;
      const isWindowManager=p.pid===s.wmpid;
      const isFiles=app?.appId==='files'&&p.pid===app.pid;
      const isSystems=app?.appId==='systems'&&p.pid===app.pid;
      const isMedia=['charts','player'].includes(app?.appId)&&p.pid===app.pid;
      if(!isWindowManager&&!isFiles&&!isSystems&&!isMedia)continue;
      const seen=new WeakSet();
      function patch(message){
        if(!message||typeof message!=='object'||seen.has(message))return;
        seen.add(message);
        if(isWindowManager&&typeof message.verb==='string'){
          if(winmap[message.id])message.id=winmap[message.id];
          if(message.verb==='system'&&idmap[message.value?.id])message.value.id=idmap[message.value.id];
          if(message.verb==='app'&&message.app==='system'&&idmap[message.data?.target])message.data.target=idmap[message.data.target];
          if(message.verb==='projection'&&idmap[message.value?.sid]){
            message.value.sid=idmap[message.value.sid];message.value.id=winmap[message.value.id];
          }
        }
        if(isSystems&&message.verb?.startsWith?.('system-')&&idmap[message.value?.id])
          message.value.id=idmap[message.value.id];
        if(isFiles&&message.verb==='paste'){
          const sid=message.value?.sid;
          if(idmap[sid]){message.value.sid=idmap[sid];message.value.sourceToken=tokens[sid];}
        }
        if(isMedia&&message.route){
          if(idmap[message.route.system])message.route.system=idmap[message.route.system];
          if(winmap[message.route.window])message.route.window=winmap[message.route.window];
        }
        if(isMedia&&message.verb==='project'&&typeof message.value==='string')
          message.value=idmap[message.value]??(target?message.value:null);
        for(const value of Object.values(message))patch(value);
      }
      p.inbox.forEach(e=>patch(e.value));patch(p.vars);patch(p.pending);
    }
  }
  const root=states.find(s=>s.id===idmap[snap.root]),stateMap=new Map(states.map(s=>[s.id,s]));
  if(prior)root.kernelPath=prior.kernelPath;
  for(const s of states)if(s!==root){
    const p=stateMap.get(s.parentId);
    if(!p.files[s.kernelPath]||!target)p.files[s.kernelPath]=node(s.kernelSource);
  }
  const rootSource=!parent.files[root.kernelPath]||!target?root.kernelSource:null;
  const space=states.reduce((n,s)=>n+ownStorage(s),0)+(rootSource!==null?rootSource.length*2+56:0);
  const ram=states.reduce((n,s)=>n+ownMemory(s),0)+768;
  check(parent,space-(prior?storageUsed(prior):0),storageUsed,'storage');
  check(parent,ram-(prior?memoryUsed(prior):0),memoryUsed,'memory');

  if(rootSource!==null)writeFile(parent,root.kernelPath,rootSource);
  if(prior){for(const id of old)delete world.systems[id];if(parent.procs[prior.carrier])parent.procs[prior.carrier].state='ended';}
  root.carrier=spawnNative(parent,'内核 / '+root.id,'carrier',null,{target:root.id}).pid;
  for(const s of states)world.systems[s.id]=s;
  world.serial=Math.max(serial,...states.map(s=>+s.id.slice(6)));
  world.windowSerial=Math.max(windowSerial,...Object.values(winmap).map(id=>+id.slice(4)));
  if(root.state==='stopped')root.state='running';
  return root;
}
