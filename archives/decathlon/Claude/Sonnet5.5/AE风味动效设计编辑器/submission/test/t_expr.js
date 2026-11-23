for (const f of ['util','geom','mesh','font','model','expr','evalr']) require('../js/'+f+'.js');
const {Model,U}=AE;
const proj=Model.newProject(); const comp=proj.comps[0];
const A=Model.newLayer('null',comp,{name:'控制器'}); const B=Model.newLayer('shape',comp,{name:'B'});
comp.layers.push(B,A);
A.props['transform.rotation']={v:0,k:[Model.defKey(0,0),Model.defKey(2,90)]};
const ev=new AE.Evaluator(()=>proj,()=>0);
const set=(L,key,x)=>{L.props[key].x=x;};
const T=(L,key,t)=>{ev.invalidate(); const r=ev.value(comp,L,key,t); const e=ev.errorOf(L,key); if(e) console.log("  ERR",e); return r;};
console.log('rot t=1', T(A,'transform.rotation',1));
set(B,'transform.rotation','thisComp.layer("控制器").transform.rotation * 2'); console.log('expr1', T(B,'transform.rotation',1), 'expect 90');
set(B,'transform.position','[time*10, value[1]] + [5, 0]'); console.log('vec', T(B,'transform.position',1), 'expect [15,540,..]');
set(B,'transform.opacity','linear(time, 0, 2, 0, 100)'); console.log('linear', T(B,'transform.opacity',1));
set(B,'transform.scale','[ease(time,0,2,100,200), 100, 100]'); console.log('ease', T(B,'transform.scale',1));
set(B,'transform.opacity','wiggle(2,10)'); console.log('wiggle', T(B,'transform.opacity',1), T(B,'transform.opacity',1));
A.props['transform.position'].k=[Model.defKey(0,[0,0,0],true),Model.defKey(1,[100,0,0],true)];
set(B,'transform.opacity','loopOut("cycle")'); B.props['transform.opacity'].k=[Model.defKey(0,0),Model.defKey(1,100)]; console.log('loop', T(B,'transform.opacity',1.25),'expect 25');
set(B,'transform.opacity','loopOut("pingpong")'); console.log('ping', T(B,'transform.opacity',1.25),'expect 75');
delete B.props['transform.opacity'].k; B.props['transform.opacity'].v=100;
set(B,'transform.rotation','thisComp.layer("控制器").transform.position.valueAtTime(time-1)[0]'); console.log('vat', T(B,'transform.rotation',2), 'expect 100');
// cycle
set(A,'transform.rotation','thisComp.layer("B").transform.rotation'); set(B,'transform.rotation','thisComp.layer("控制器").transform.rotation + 1');
ev.invalidate(); console.log('cycle', T(B,'transform.rotation',1), ev.errorOf(B,'transform.rotation'), '|', ev.errorOf(A,'transform.rotation'));
set(B,'transform.rotation','foo + 1'); ev.invalidate(); console.log('err', T(B,'transform.rotation',1), ev.errorOf(B,'transform.rotation'));
set(B,'transform.rotation','var x = 5; if (x > 3) { x = x * 2 } ; x + time'); ev.invalidate(); console.log('stmt', T(B,'transform.rotation',1));
// 空间路径匀速
const P=Model.newLayer('shape',comp,{name:'P'}); comp.layers.push(P);
const k0=Model.defKey(0,[0,0,0],true),k1=Model.defKey(1,[100,100,0],true),k2=Model.defKey(2,[200,0,0],true);
P.props['transform.position'].k=[k0,k1,k2]; Model.normalizeProp(P.props['transform.position'],Model.propInfo(P,'transform.position'));
const pts=[0,0.25,0.5,0.75,1,1.5].map(t=>T(P,'transform.position',t).map(x=>+x.toFixed(1))); console.log(JSON.stringify(pts));
// 父级
B.parent=A.id; A.props['transform.position'].v=[100,100,0]; delete A.props['transform.position'].k; A.props['transform.rotation'].x=''; A.props['transform.rotation'].v=90; delete A.props['transform.rotation'].k;
B.props['transform.position'].x=''; B.props['transform.position'].v=[50,0,0]; B.props['transform.rotation'].x=''; B.props['transform.rotation'].v=0;
const m=ev.worldMatrix(comp,B,0); console.log('world', U.M.pt(m,[0,0,0]).map(x=>+x.toFixed(2)),'expect [100,150]');
const cam=ev.cameraMatrices(comp,0,16/9); console.log('cam', cam.pos.map(x=>+x.toFixed(1)));
const clip=U.M.pt(cam.vp,[960,540,0]); console.log('center ndc', clip.map(x=>+x.toFixed(3)));
const c2=U.M.pt(cam.vp,[1920,0,0]); console.log('corner ndc', c2.map(x=>+x.toFixed(3)), 'expect [1,1]');
