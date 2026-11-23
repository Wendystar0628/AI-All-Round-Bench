(function(){
  'use strict';
  const F=window.Forge=window.Forge||{};
  let idCounter=1000;
  const listeners={};
  F.util={
    uid(prefix='id'){return prefix+'_'+(++idCounter).toString(36)+Math.random().toString(36).slice(2,6)},
    clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))},
    clamp(v,a,b){return Math.max(a,Math.min(b,v))},
    lerp(a,b,t){return a+(b-a)*t},
    smooth(t){return t*t*(3-2*t)},
    hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0)/4294967295},
    seeded(seed){let s=seed>>>0;return function(){s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}},
    mapVec(a,b,fn){if(Array.isArray(a)||Array.isArray(b)){const aa=Array.isArray(a)?a:[a,a,a],bb=Array.isArray(b)?b:[b,b,b];return aa.map((v,i)=>fn(v,bb[i]||0,i))}return fn(a,b,0)},
    add(a,b){return F.util.mapVec(a,b,(x,y)=>x+y)},
    sub(a,b){return F.util.mapVec(a,b,(x,y)=>x-y)},
    mul(a,b){return F.util.mapVec(a,b,(x,y)=>x*y)},
    color(hex){const c=new THREE.Color(hex);return[c.r,c.g,c.b]},
    hex(value){const c=Array.isArray(value)?new THREE.Color(value[0],value[1],value[2]):new THREE.Color(value);return'#'+c.getHexString()},
    timecode(time,fps=60){time=Math.max(0,time);const h=Math.floor(time/3600),m=Math.floor(time/60)%60,s=Math.floor(time)%60,f=Math.floor((time-Math.floor(time))*fps+1e-5);return[h,m,s,f].map(v=>String(v).padStart(2,'0')).join(':')},
    download(name,data,type='application/json'){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  };
  F.on=(event,fn)=>{(listeners[event]||(listeners[event]=[])).push(fn);return()=>{listeners[event]=listeners[event].filter(x=>x!==fn)}};
  F.emit=(event,data)=>{(listeners[event]||[]).forEach(fn=>{try{fn(data)}catch(e){console.error(e)}})};
  F.project=null;F.time=0;F.selection=[];F.selectedKeys=[];F.selectedNode=null;F.activeTool='select';F.loop=true;F.snap=true;F.motionBlur=true;F.helpers=true;F.grid=false;F.exporting=false;F.expressionErrors={};F.timelineZoom=80;F.curveMode='value';F.curvePath='transform.position';F.playing=false;
  F.anim=value=>({value:F.util.clone(value),keyframes:[],expression:'',expressionEnabled:false,expressionMode:'replace'});
  F.key=(time,value,interp='bezier')=>({id:F.util.uid('key'),time,value:F.util.clone(value),interp,easeIn:[.33,0,.67,1],easeOut:[.33,0,.67,1],spatial:'linear',inHandle:null,outHandle:null});
  F.addKeys=(prop,keys)=>{prop.keyframes=keys.map(k=>F.key(k[0],k[1],k[2]||'bezier'));return prop};
  const layerNames={text:'文字',text3d:'三维文字',shape:'形状',null:'空对象',adjustment:'调整图层',precomp:'预合成',camera:'摄像机',light:'灯光',geometry:'三维几何',particles:'粒子',audio:'音色',field:'空间场',solid:'纯色'};
  const layerIcons={text:'type',text3d:'cube',shape:'pen',null:'anchor',adjustment:'circle',precomp:'layers',camera:'camera',light:'light',geometry:'cube',particles:'particle',audio:'music',field:'field',solid:'square'};
  const layerColors={text:'#8ea9bd',text3d:'#e18b53',shape:'#88a894',null:'#9a9da4',adjustment:'#ae94c9',precomp:'#b69b6c',camera:'#7c9db5',light:'#d4b56f',geometry:'#c18460',particles:'#e39764',audio:'#8c9e87',field:'#a38abc',solid:'#92959c'};
  F.layerName=type=>layerNames[type]||type;F.layerIcon=type=>layerIcons[type]||'layers';F.layerColor=type=>layerColors[type]||'#92959c';
  F.createLayer=function(type,name){
    const layer={id:F.util.uid('layer'),name:name||F.layerName(type),type,visible:true,locked:false,in:0,out:15,parentId:null,blendMode:'normal',motionBlur:true,castShadow:true,receiveShadow:true,masks:[],trackMatte:{mode:'none',layerId:null,invert:false},effects:[],props:{
      'transform.anchor':F.anim([0,0,0]),'transform.position':F.anim([0,0,0]),'transform.scale':F.anim([100,100,100]),'transform.rotation':F.anim([0,0,0]),'transform.opacity':F.anim(100)
    }};
    if(type==='text'||type==='text3d'){
      Object.assign(layer.props,{'text.content':F.anim('铸'),'text.fontSize':F.anim(180),'text.lineHeight':F.anim(1.12),'text.letterSpacing':F.anim(0),'text.align':F.anim('center'),'text.animatorMode':F.anim('character'),'text.animatorStart':F.anim(0),'text.animatorEnd':F.anim(100),'text.animatorOffset':F.anim(0),'text.animatorSoftness':F.anim(35),'text.animatorPosition':F.anim([0,25,0]),'text.animatorRotation':F.anim(0),'text.animatorScale':F.anim(100),'text.animatorOpacity':F.anim(100)});
      layer.text={font:'Forge Serif',fill:'#d8d5cd',stroke:'#ef9a5d',strokeWidth:0};
    }
    if(type==='text'||type==='text3d'||type==='geometry'||type==='shape'){
      Object.assign(layer.props,{'extrude.depth':F.anim(type==='shape'?.05:type==='text'?.025:.65),'extrude.bevel':F.anim(type==='shape'?0:.035),'extrude.bevelSegments':F.anim(4),'deform.bend':F.anim(0),'deform.twist':F.anim(0),'deform.fieldStrength':F.anim(type==='text3d'?1:0),'material.color':F.anim('#b9b9b4'),'material.metalness':F.anim(.92),'material.roughness':F.anim(.28),'material.emissive':F.anim('#f16d2e'),'material.emissiveIntensity':F.anim(0),'material.opacity':F.anim(100)});
      layer.shape={kind:'rect',points:[],closed:true,fill:'#a9adb1',stroke:'#e4e5e2',strokeWidth:1,operations:[]};
    }
    if(type==='camera')Object.assign(layer.props,{'camera.target':F.anim([0,0,0]),'camera.fov':F.anim(42),'camera.focus':F.anim(9),'camera.aperture':F.anim(.00012)});
    if(type==='light')Object.assign(layer.props,{'light.color':F.anim('#ffd5ad'),'light.intensity':F.anim(4),'light.kind':F.anim('directional'),'light.castShadow':F.anim(1)});
    if(type==='field')Object.assign(layer.props,{'field.kind':F.anim('distance'),'field.strength':F.anim(1),'field.radius':F.anim(2.2),'field.falloff':F.anim(2),'field.noiseScale':F.anim(1.4),'field.swirl':F.anim(.45),'field.mix':F.anim(65)});
    if(type==='particles')Object.assign(layer.props,{'particle.rate':F.anim(110),'particle.speed':F.anim(4.8),'particle.life':F.anim(1.8),'particle.drag':F.anim(.15),'particle.gravity':F.anim(-7.5),'particle.seed':F.anim(240517),'particle.size':F.anim(1),'particle.trail':F.anim(.18),'particle.trailWidth':F.anim(1),'particle.friction':F.anim(.64),'particle.bounce':F.anim(.52),'particle.colorStart':F.anim('#fff1b0'),'particle.colorEnd':F.anim('#d74417'),'particle.sourceLayerId':F.anim('glyph'),'particle.colliderLayerId':F.anim('anvil')});
    if(type==='audio')Object.assign(layer.props,{'audio.kind':F.anim(name&&name.includes('锤')?'strike':'ambience'),'audio.volume':F.anim(55),'audio.pitch':F.anim(1),'audio.decay':F.anim(.5),'audio.cutoff':F.anim(1400)});
    return layer;
  };
  F.activeComp=()=>F.project&&F.project.comps.find(c=>c.id===F.project.activeCompId)||F.project&&F.project.comps[0];
  F.compById=id=>F.project.comps.find(c=>c.id===id);
  F.findLayer=(id,comp=F.activeComp())=>comp&&comp.layers.find(l=>l.id===id);
  F.layerByName=(name,comp=F.activeComp())=>comp&&comp.layers.find(l=>l.name===name);
  F.selectedLayers=()=>F.selection.map(id=>F.findLayer(id)).filter(Boolean);
  F.selectedLayer=()=>F.selectedLayers()[0]||null;
  F.getProp=(layer,path)=>layer&&layer.props[path];
  function bezierEase(t,stops){
    if(!stops)return F.util.smooth(t);const x1=stops[0],y1=stops[1],x2=stops[2],y2=stops[3];
    if(t<=0||t>=1)return F.util.clamp(t,0,1);let u=t;for(let i=0;i<7;i++){const x=3*(1-u)*(1-u)*u*x1+3*(1-u)*u*u*x2+u*u*u-t;const dx=3*(1-u)*(1-u)*x1+6*(1-u)*u*(x2-x1)+3*u*u*(1-x2);if(Math.abs(dx)<1e-5)break;u-=x/dx;u=F.util.clamp(u,0,1)}return 3*(1-u)*(1-u)*u*y1+3*(1-u)*u*u*y2+u*u*u;
  }
  function mixValue(a,b,t){
    if(typeof a==='string'&&typeof b==='string'&&/^#[0-9a-f]{6}$/i.test(a)&&/^#[0-9a-f]{6}$/i.test(b)){const color=new THREE.Color(a).lerp(new THREE.Color(b),t);return'#'+color.getHexString()}
    if(typeof a==='string'||typeof b==='string'||typeof a==='boolean'||typeof b==='boolean')return t<1?F.util.clone(a):F.util.clone(b);
    return F.util.mapVec(a,b,(x,y)=>F.util.lerp(Number(x)||0,Number(y)||0,t))
  }
  function evalKeys(prop,time){
    const keys=prop.keyframes||[];if(!keys.length)return F.util.clone(prop.value);if(time<=keys[0].time)return F.util.clone(keys[0].value);if(time>=keys[keys.length-1].time)return F.util.clone(keys[keys.length-1].value);
    let i=0;while(i<keys.length-2&&time>keys[i+1].time)i++;const a=keys[i],b=keys[i+1];let t=(time-a.time)/(b.time-a.time);
    if(a.interp==='hold'||b.interp==='hold'&&t<1)return F.util.clone(a.value);
    if(a.interp==='bezier')t=bezierEase(t,a.easeOut);
    if(a.spatial==='bezier'&&Array.isArray(a.value)&&a.outHandle&&b.inHandle){const p0=a.value,p3=b.value,p1=F.util.add(p0,a.outHandle),p2=F.util.add(p3,b.inHandle),v=1-t;return p0.map((_,n)=>v*v*v*p0[n]+3*v*v*t*p1[n]+3*v*t*t*p2[n]+t*t*t*p3[n])}
    return mixValue(a.value,b.value,t);
  }
  F.evalKeys=evalKeys;
  class PropertyRef{
    constructor(comp,layer,path,time,stack){Object.assign(this,{comp,layer,path,time,stack})}
    raw(t=this.time){return evaluate(this.comp,this.layer,this.path,t,this.stack)}
    valueOf(){const v=this.raw();return Array.isArray(v)?v[0]:v}
    toString(){return String(this.valueOf())}
    valueAtTime(t){return this.raw(t)}
    get x(){const v=this.raw();return Array.isArray(v)?v[0]:v}
    get y(){const v=this.raw();return Array.isArray(v)?v[1]:0}
    get z(){const v=this.raw();return Array.isArray(v)?v[2]:0}
    get 0(){return this.x}get 1(){return this.y}get 2(){return this.z}
  }
  function evaluate(comp,layer,path,time,stack=[]){
    const prop=F.getProp(layer,path);if(!prop)return 0;const base=evalKeys(prop,time);if(!prop.expressionEnabled||!prop.expression.trim())return base;
    const token=layer.id+':'+path;if(stack.includes(token)){F.expressionErrors[token]='检测到循环引用，已退回关键帧值';return base}
    const nextStack=stack.concat(token);
    const linear=(t,a,b,c,d)=>{const p=F.util.clamp((t-a)/(b-a||1e-9),0,1);return F.util.mapVec(c,d,(x,y)=>x+(y-x)*p)};
    const ease=(t,a,b,c,d)=>{const p=F.util.smooth(F.util.clamp((t-a)/(b-a||1e-9),0,1));return F.util.mapVec(c,d,(x,y)=>x+(y-x)*p)};
    const wiggle=(freq,amp)=>{const seed=F.util.hash(layer.id+path)*30;return Math.sin(time*freq*6.283+seed)*.55*amp+Math.sin(time*freq*10.71+seed*2.3)*.25*amp};
    const loopOut=(mode='cycle')=>{const keys=prop.keyframes;if(keys.length<2)return base;const start=keys[0].time,end=keys[keys.length-1].time,dur=end-start;if(time<=end)return base;let local=(time-start)%dur;if(mode==='pingpong'&&Math.floor((time-start)/dur)%2)local=dur-local;return evalKeys(prop,start+local)};
    const __ref=(name,refPath)=>{const target=F.layerByName(name,comp);return target?new PropertyRef(comp,target,refPath,time,nextStack):0};
    const __this=(refPath)=>new PropertyRef(comp,layer,refPath,time,nextStack);
    const valueAtTime=t=>evaluate(comp,layer,path,t,nextStack);
    let source=prop.expression;
    source=source.replace(/thisComp\.layer\(\s*(['"])(.*?)\1\s*\)\.([A-Za-z0-9_]+\.[A-Za-z0-9_]+)/g,(m,q,name,p)=>`__ref(${JSON.stringify(name)},${JSON.stringify(p)})`);
    source=source.replace(/thisLayer\.([A-Za-z0-9_]+\.[A-Za-z0-9_]+)/g,(m,p)=>`__this(${JSON.stringify(p)})`);
    try{
      const fn=new Function('time','value','wiggle','loopOut','linear','ease','valueAtTime','__ref','__this','thisComp','thisLayer','Math',`"use strict";return (${source})`);
      let result=fn(time,base,wiggle,loopOut,linear,ease,valueAtTime,__ref,__this,{layer:__ref},{transform:{}},Math);
      if(result instanceof PropertyRef)result=result.raw();if(result===undefined||result===null||typeof result==='number'&&!Number.isFinite(result))throw new Error('表达式没有返回有效数值');
      if(prop.expressionMode==='add')result=F.util.add(base,result);delete F.expressionErrors[token];return F.util.clone(result);
    }catch(error){F.expressionErrors[token]=error.message;return base}
  }
  F.evaluate=evaluate;
  F.value=(layer,path,time=F.time,comp=F.activeComp())=>evaluate(comp,layer,path,time);
  F.setValue=function(layer,path,value,time=F.time,forceKey=false){
    const prop=F.getProp(layer,path);if(!prop)return;if(prop.keyframes.length||forceKey){let nearest=prop.keyframes.reduce((best,k)=>Math.abs(k.time-time)<Math.abs(best.time-time)?k:best,prop.keyframes[0]);if(nearest&&Math.abs(nearest.time-time)<1/(F.activeComp().fps||60)*.51)nearest.value=F.util.clone(value);else{prop.keyframes.push(F.key(time,value));prop.keyframes.sort((a,b)=>a.time-b.time)}}else prop.value=F.util.clone(value);
  };
  F.toggleAnimation=function(layer,path){const p=F.getProp(layer,path);if(!p)return;if(p.keyframes.length){const current=F.util.clone(F.value(layer,path));p.value=current;p.keyframes=[];p.expressionEnabled=false}else p.keyframes=[F.key(F.time,F.value(layer,path))]};
  F.worldMatrix=function(comp,layer,time=F.time,visited=[]){
    if(!layer||visited.includes(layer.id))return new THREE.Matrix4();const pos=F.value(layer,'transform.position',time,comp),scale=F.value(layer,'transform.scale',time,comp),rot=F.value(layer,'transform.rotation',time,comp),anchor=F.value(layer,'transform.anchor',time,comp);
    const p=new THREE.Vector3(pos[0]/100,pos[1]/100,pos[2]/100),s=new THREE.Vector3(scale[0]/100,scale[1]/100,scale[2]/100),e=new THREE.Euler(rot[0]*Math.PI/180,rot[1]*Math.PI/180,rot[2]*Math.PI/180,'XYZ'),a=new THREE.Vector3(anchor[0]/100,anchor[1]/100,anchor[2]/100);
    const local=new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromEuler(e),s);local.multiply(new THREE.Matrix4().makeTranslation(-a.x,-a.y,-a.z));
    const parent=layer.parentId&&F.findLayer(layer.parentId,comp);return parent?F.worldMatrix(comp,parent,time,visited.concat(layer.id)).multiply(local):local;
  };
  F.setParent=function(layer,parentId,time=F.time){const comp=F.activeComp(),oldWorld=F.worldMatrix(comp,layer,time);layer.parentId=parentId||null;const parent=parentId&&F.findLayer(parentId,comp),parentWorld=parent?F.worldMatrix(comp,parent,time):new THREE.Matrix4();const local=parentWorld.clone().invert().multiply(oldWorld),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();local.decompose(p,q,s);const e=new THREE.Euler().setFromQuaternion(q,'XYZ');F.setValue(layer,'transform.position',[p.x*100,p.y*100,p.z*100],time,true);F.setValue(layer,'transform.scale',[s.x*100,s.y*100,s.z*100],time,true);F.setValue(layer,'transform.rotation',[e.x*180/Math.PI,e.y*180/Math.PI,e.z*180/Math.PI],time,true)};
  const history={undo:[],redo:[],limit:70};
  function snapshot(){const data=F.util.clone(F.project);delete data.ui;return data}
  F.edit=function(label,fn,options={}){if(!F.project)return;const before=snapshot();let result;try{result=fn(F.project)}catch(e){console.error(e);F.emit('toast',{message:e.message,type:'error'});return}history.undo.push({label,before,after:snapshot()});if(history.undo.length>history.limit)history.undo.shift();history.redo=[];if(!options.silent)F.emit('toast',{message:label,type:'success',quiet:true});F.emit('change',{label});F.autosave();return result};
  F.undo=function(){const entry=history.undo.pop();if(!entry)return;history.redo.push({label:entry.label,before:snapshot(),after:entry.before});F.project=F.util.clone(entry.before);F.selection=F.selection.filter(id=>F.findLayer(id));F.emit('change',{label:'撤销 '+entry.label});F.emit('toast',{message:'已撤销：'+entry.label});F.autosave()};
  F.redo=function(){const entry=history.redo.pop();if(!entry)return;history.undo.push({label:entry.label,before:snapshot(),after:entry.after});F.project=F.util.clone(entry.after);F.emit('change',{label:'重做 '+entry.label});F.emit('toast',{message:'已重做：'+entry.label});F.autosave()};
  F.history=history;
  let saveTimer;
  F.autosave=function(){clearTimeout(saveTimer);F.emit('save-state','正在保存…');saveTimer=setTimeout(()=>{try{localStorage.setItem('forge-project-autosave',JSON.stringify(F.project));F.emit('save-state','已保存')}catch(e){F.emit('save-state','未保存')}},500)};
  F.saveProject=function(download=true){try{localStorage.setItem('forge-project-autosave',JSON.stringify(F.project))}catch(e){}if(download)F.util.download(F.project.name.replace(/[\\/:*?"<>|]/g,'_')+'.forge.json',JSON.stringify(F.project,null,2));F.emit('save-state','已保存');F.emit('toast',{message:download?'工程已保存并导出 JSON':'工程已保存到本机',type:'success'})};
  F.loadProject=function(data){if(!data||!data.comps||!data.comps.length)throw new Error('不是有效的 FORGE 工程');F.project=data;F.time=0;F.selection=[];F.selectedKeys=[];history.undo=[];history.redo=[];F.emit('change',{label:'打开工程'});F.emit('time',0);F.emit('toast',{message:'工程已重新打开，取样状态已复位',type:'success'})};
  F.setTime=function(time,emit=true){const comp=F.activeComp();F.time=F.util.clamp(time,0,comp?comp.duration:15);if(emit)F.emit('time',F.time)};
  F.select=function(ids,additive=false){ids=Array.isArray(ids)?ids:[ids];if(additive)F.selection=F.selection.includes(ids[0])?F.selection.filter(id=>!ids.includes(id)):F.selection.concat(ids);else F.selection=ids.filter(Boolean);F.emit('selection',F.selection)};
  F.duplicateLayers=function(){const comp=F.activeComp(),selected=F.selectedLayers();if(!selected.length)return;const newIds=[];F.edit('复制图层',()=>{selected.forEach(layer=>{const copy=F.util.clone(layer);copy.id=F.util.uid('layer');copy.name=layer.name+' 副本';copy.parentId=null;Object.values(copy.props).forEach(p=>{(p.keyframes||[]).forEach(k=>k.id=F.util.uid('key'))});const index=comp.layers.indexOf(layer);comp.layers.splice(index,0,copy);newIds.push(copy.id)})});F.selection=newIds;F.emit('selection',newIds)};
  F.deleteLayers=function(){if(!F.selection.length)return;F.edit('删除图层',()=>{const comp=F.activeComp();comp.layers=comp.layers.filter(l=>!F.selection.includes(l.id));comp.layers.forEach(l=>{if(F.selection.includes(l.parentId))l.parentId=null})});F.selection=[];F.emit('selection',[])};
  F.precompose=function(){const comp=F.activeComp(),selected=F.selectedLayers();if(!selected.length){F.emit('toast',{message:'请先选择要预合成的图层',type:'error'});return}const compId=F.util.uid('comp'),preId=F.util.uid('layer');F.edit('原位预合成',()=>{const copies=F.util.clone(selected);copies.forEach(l=>{if(!selected.some(s=>s.id===l.parentId))l.parentId=null});const child={id:compId,name:comp.name+'_预合成',width:comp.width,height:comp.height,fps:comp.fps,duration:comp.duration,workStart:comp.workStart,workEnd:comp.workEnd,layers:copies,background:'#0b0c0e',motionBlur:comp.motionBlur,shutterAngle:comp.shutterAngle,shutterPhase:comp.shutterPhase,nodes:[]};F.project.comps.push(child);const pre=F.createLayer('precomp',selected.length===1?selected[0].name+'_预合成':'预合成_'+F.project.comps.length);pre.id=preId;pre.compId=compId;pre.in=Math.min(...selected.map(l=>l.in));pre.out=Math.max(...selected.map(l=>l.out));pre.props['time.remap']=F.anim(0);pre.props['time.remap'].keyframes=[F.key(0,0,'linear'),F.key(comp.duration,comp.duration,'linear')];pre.props['time.freeze']=F.anim(0);comp.layers=comp.layers.filter(l=>!selected.includes(l.id));comp.layers.unshift(pre);comp.layers.forEach(l=>{if(selected.some(s=>s.id===l.parentId))l.parentId=preId})});F.selection=[preId];F.emit('selection',F.selection)};
  F.newComp=function(name){const comp={id:F.util.uid('comp'),name:name||'未命名合成_'+String(F.project.comps.length+1).padStart(2,'0'),width:1920,height:1080,fps:60,duration:15,workStart:0,workEnd:15,layers:[],background:'#0b0c0e',motionBlur:true,shutterAngle:180,shutterPhase:-90,nodes:[]};F.edit('新建合成',()=>F.project.comps.push(comp));F.project.activeCompId=comp.id;F.time=0;F.selection=[];F.emit('change',{label:'切换合成'});return comp};
  F.createDefaultMaterial=function(layer,preset){const values={hot:['#dc713b',.9,.3,'#ff6b24',1.8],brushed:['#aeb3b7',1,.3,'#000000',0],copper:['#b66f48',.95,.24,'#000000',0],carbon:['#272a2e',.25,.52,'#000000',0],gold:['#d5ad53',1,.2,'#6f3208',.12],ceramic:['#d7d3c9',0,.2,'#000000',0]}[preset];if(!values||!layer)return;F.edit('应用材质',()=>{const paths=['material.color','material.metalness','material.roughness','material.emissive','material.emissiveIntensity'];paths.forEach((p,i)=>F.setValue(layer,p,values[i],F.time,false))})};
})();
