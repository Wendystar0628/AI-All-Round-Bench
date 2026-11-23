import assert from 'node:assert/strict';
import {DEFAULT_KERNEL,EXAMPLES,parseKernel,initVM,spawn,runVM} from './runtime.mjs';
const s={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{}};
let sum=spawn(s.vm,EXAMPLES['/Programs/累加.os']);let busy=spawn(s.vm,EXAMPLES['/Programs/持续计算.os']);
for(let i=0;i<200;i++)runVM(s,8);
assert.equal(sum.state,'ended');assert.equal(sum.vars.sum,5050);assert.ok(busy.work>0);assert.ok(s.vm.used<=8);
let receiver=spawn(s.vm,JSON.stringify({code:[{op:'receive',to:'v'},{op:'end'}]}));runVM(s,20);assert.equal(receiver.state,'waiting-message');spawn(s.vm,JSON.stringify({code:[{op:'send',pid:receiver.pid,value:'hello'},{op:'end'}]}));for(let i=0;i<5;i++)runVM(s,20);assert.equal(receiver.vars.v,'hello');
let caller=spawn(s.vm,JSON.stringify({code:[{op:'call',name:'double',value:21,to:'x'},{op:'end'}]}));for(let i=0;i<5;i++)runVM(s,20);assert.equal(caller.vars.x,42);
console.log('runtime checks passed');
const modified=parseKernel(JSON.stringify({...JSON.parse(DEFAULT_KERNEL),messagePrefix:'[内核] ',filePrefix:'/sandbox',calls:{triple:'value * 3'}}));
const t={vm:initVM(),kernel:modified,time:0,files:{}};
let recv=spawn(t.vm,JSON.stringify({code:[{op:'receive',to:'v'},{op:'end'}]}));
spawn(t.vm,JSON.stringify({code:[{op:'send',pid:recv.pid,value:'测试'},{op:'write',path:'/a',value:'hello'},{op:'call',name:'triple',value:7,to:'x'},{op:'end'}]}));
for(let i=0;i<10;i++)runVM(t,4);
assert.equal(recv.vars.v,'[内核] 测试');assert.equal(t.files['/sandbox/a'],'hello');assert.equal(t.vm.processes[1].vars.x,21);
assert.throws(()=>parseKernel('{bad json'));
let quota={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{},memoryLimit:10000,storageLimit:12};
let writer=spawn(quota.vm,JSON.stringify({code:[{op:'write',path:'/long',value:'this will not fit'},{op:'end'}]}));
for(let i=0;i<10&&writer.state!=='ended';i++)runVM(quota,10);assert.equal(writer.vars.result,false);assert.equal(quota.files['/long'],undefined);
assert.throws(()=>spawn(quota.vm,JSON.stringify({code:[{op:'end'}]}),'',1),/内存配额/);
let sys2={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{'/Programs/child.os':JSON.stringify({name:'child',code:[{op:'set',to:'x',value:7},{op:'end'}]})},memoryLimit:50000,storageLimit:50000};
let parent=spawn(sys2.vm,JSON.stringify({code:[{op:'spawn',path:'/Programs/child.os',to:'child'},{op:'wait',seconds:.1},{op:'end'}]}));for(let i=0;i<20&&!parent.vars.child;i++)runVM(sys2,20);assert.equal(parent.vars.child,2);assert.equal(sys2.vm.processes.length,2);sys2.time=.1;runVM(sys2,20);assert.equal(sys2.vm.processes[1].vars.x,7);
let limits={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{}};let lp=spawn(limits.vm,EXAMPLES['/Programs/持续计算.os']);lp.limit=3;assert.equal(runVM(limits,100),3);assert.equal(lp.work,3);assert.equal(runVM(limits,100),3);

let large={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{},memoryLimit:50000,storageLimit:50000};let job=spawn(large.vm,JSON.stringify({code:[{op:'write',path:'/big',value:'x'.repeat(100)},{op:'end'}]}));runVM(large,5);assert.equal(large.files['/big'],undefined);assert.equal(job.pending.done,5);for(let i=0;i<20&&job.state!=='ended';i++)runVM(large,10);assert.equal(large.files['/big'],'x'.repeat(100));

let original={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{},memoryLimit:50000,storageLimit:50000};let partial=spawn(original.vm,JSON.stringify({code:[{op:'write',path:'/snapshot',value:'abc'.repeat(40)},{op:'end'}]}));runVM(original,13);let copy=structuredClone(original);for(let i=0;i<20;i++){runVM(original,10);runVM(copy,10)}assert.deepEqual(original,copy);assert.equal(copy.files['/snapshot'],'abc'.repeat(40));
let compilerModule=await import('./compiler.mjs');let cs={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{'/System/compiler.os':compilerModule.DEFAULT_COMPILER},memoryLimit:100000,storageLimit:100000};spawn(cs.vm,compilerModule.compileProgram(cs.files['/System/compiler.os']));for(let i=0;i<100&&cs.vm.processes[0].state!=='ended';i++)runVM(cs,100);assert.equal(JSON.parse(cs.files['/Documents/compiler-built.os']).name,'系统编译器');
let {initCarrier,runCarrier}=await import('./runtime.mjs');let kernel=parseKernel(DEFAULT_KERNEL),host={kernel,time:0,files:{},memoryLimit:100000,storageLimit:100000},child={carrierVM:initCarrier(kernel)};let dispatch=runCarrier(host,child,20);assert.equal(dispatch.dispatch,true);assert.equal(dispatch.used,1);let nextDispatch=runCarrier(host,child,20);assert.equal(nextDispatch.dispatch,true);assert.equal(nextDispatch.used,2);let blocked={...kernel,code:[{op:'jump',target:0}]},blockedChild={carrierVM:initCarrier(blocked)};assert.equal(runCarrier(host,blockedChild,5).dispatch,false);let broken={...kernel,code:[{op:'invalid'}]},brokenChild={carrierVM:initCarrier(broken)};assert.match(runCarrier(host,brokenChild,5).error,/未知指令/);

let tight={carrierVM:initCarrier(kernel)};let a1=runCarrier(host,tight,1),a2=runCarrier(host,tight,1);assert.equal(a1.used,1);assert.equal(a1.dispatch,true);assert.equal(a2.used,0);assert.equal(a2.dispatch,true);
let named={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{}};spawn(named.vm,JSON.stringify({name:'other',code:[{op:'wait',seconds:100}]}));let target=spawn(named.vm,EXAMPLES['/Programs/接收消息.os']);spawn(named.vm,EXAMPLES['/Programs/发送消息.os']);for(let i=0;i<30;i++)runVM(named,20);assert.equal(target.output[0],'你好，来自发送进程');
let effects=0,guarded={vm:initVM(),kernel:parseKernel(DEFAULT_KERNEL),time:0,files:{},memoryAccept:()=>false,acceptInput:()=>{effects++;return true}};let denied=spawn(guarded.vm,JSON.stringify({code:[{op:'accept',value:'x'},{op:'end'}]}));runVM(guarded,10);assert.equal(denied.state,'error');assert.equal(effects,0);
