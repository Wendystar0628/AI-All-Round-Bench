for (const f of ['util','geom','mesh','font','model','expr','evalr','shapes','nodes']) require('../js/'+f+'.js');
const {Model,U,Nodes}=AE;
const proj=Model.newProject(); const comp=proj.comps[0];
const T=Model.newLayer('text',comp,{name:'字',text:'金'}); comp.layers.push(T); T.props['text.size'].v=400;
const ev=new AE.Evaluator(()=>proj,()=>0);
const src=Nodes.create(proj,'src.text',0,0,{layer:T.id});
const tess=Nodes.create(proj,'tess'); Nodes.link(proj,tess,'in',src);
const pin=Nodes.create(proj,'pin'); Nodes.link(proj,pin,'in',tess);
const ex=Nodes.create(proj,'extrude'); Nodes.link(proj,ex,'in',pin);
const fd=Nodes.create(proj,'fielddeform'); Nodes.link(proj,fd,'in',ex);
const fl=Nodes.create(proj,'field.falloff'); Nodes.link(proj,fd,'field',fl);
const out=Nodes.create(proj,'output'); Nodes.link(proj,out,'in',fd);
const em=Nodes.create(proj,'emitter'); console.log(Nodes.link(proj,em,'in',out));
console.log('bad link', Nodes.link(proj,src,'in',out));
let t0=Date.now();
let r=Nodes.evalOut(ev,comp,0,out.id); console.log('out', r.info, Date.now()-t0,'ms');
t0=Date.now(); r=Nodes.evalOut(ev,comp,0,out.id); console.log('cached', Date.now()-t0,'ms');
// pins
const a=Nodes.addPin(pin,[0,-100]); const b=Nodes.addPin(pin,[0,200]);
pin.props[`pin.${a}.pos`].v=[0,40];
t0=Date.now(); r=Nodes.evalOut(ev,comp,0,out.id); console.log('pin', r.info, Date.now()-t0,'ms');
const ps=Nodes.evalOut(ev,comp,0,pin.id); console.log(pin.name, ps.info);
const e=Nodes.evalOut(ev,comp,0,em.id); console.log('emitter', e.info, e.out.kind);
console.log(Mesh=AE.Mesh, 0)
