/* ============ 锻火 FORGE · project.js : 工程数据模型 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const P=APP.project={};

const BLENDS=['normal','add','screen','multiply','overlay'];
const BLEND_NAMES={normal:'正常',add:'相加',screen:'滤色',multiply:'正片叠底',overlay:'叠加'};
const LABEL_COLORS=['#8c8c8c','#e8a33d','#e8633d','#d84a6b','#a05cd8','#4a7de8','#3dbdd8','#4ec96b','#a8c93d','#d8c93d'];

/* ---------- 属性 / 关键帧 ---------- */
P.newProp=function(v,anim){
  return {v:Array.isArray(v)?v.slice():(v===undefined?0:v), anim:!!anim, keys:[], expr:{on:false,code:''}};
};
P.newKey=function(t,v,li,lo){
  return {t,v:Array.isArray(v)?v.slice():v,
    li:li||'bezier', lo:lo||'bezier',
    tin:{i:0.333,s:0}, tout:{i:0.333,s:0},
    sin:'auto', sout:'auto',
    hin:null, hout:null};   // 空间切线(相对关键帧值)
};
P.isVec=v=>Array.isArray(v);

/* ---------- 图层工厂 ---------- */
let _lc=1;
function lid(){return 'L'+(_lc++)+Math.floor(Math.random()*1e5).toString(36);}

P.newLayer=function(type,name){
  const L={
    id:lid(),type,name:name||'图层',label:type==='camera'?6:type==='light'?2:1,
    visible:true,locked:false,shy:false,
    inPoint:0,outPoint:null,
    parent:null,blend:'normal',is3D:false,mb:true,
    matte:{mode:'none'},
    masks:[],effects:[],
    t:baseTransform(),
    props:{},
    node:{},          // 节点图相关(几何源)
    notes:''
  };
  switch(type){
    case 'shape':
      L.shape={groups:[newGroup('形状 1')]};
      L.shape.groups[0].items.push(pathItem('矩形',rectPath(200,140)));
      L.shape.groups[0].items.push(fillItem('#ff9a3c'));
      L.shape.groups[0].items.push(strokeItem('#ffd9a8',4));
      break;
    case 'text':
      L.text={src:'金',font:'锻火体',size:200,leading:120,tracking:0,align:'center',
        baseline:'yMin',animators:[]};
      L.props.charCount=P.newProp(1);
      break;
    case 'null': break;
    case 'adjust': break;
    case 'precomp':
      L.precomp={compId:null,timeRemap:P.newProp(0)};
      L.is3D=false;
      break;
    case 'camera':
      L.is3D=true;
      L.props.fov=P.newProp(50);
      L.props.focus=P.newProp(1200);
      L.props.aperture=P.newProp(0);
      L.props.roll=P.newProp(0);
      L.name=name||'摄像机';
      break;
    case 'light':
      L.is3D=true;
      L.props.kind=P.newProp('point');
      L.props.intensity=P.newProp(1.6);
      L.props.color=P.newProp([1,0.72,0.42]);
      L.props.cone=P.newProp(60);
      L.props.shadow=P.newProp(1);
      L.name=name||'灯光';
      break;
    case 'geo3d':
      L.is3D=true;
      L.geo3d={source:'text',depth:P.newProp(60),bevel:P.newProp(8),
        material:newMaterial(),deform:{pins:[],bend:P.newProp(0),twist:P.newProp(0)},
        extrudeText:true};
      L.text={src:'金',font:'锻火体',size:200,leading:120,tracking:0,align:'center',animators:[]};
      break;
    case 'particle':
      L.is3D=true;
      L.particle=newParticle();
      break;
    case 'audio':
      L.audio=newAudio();
      L.name=name||'音色';
      break;
  }
  return L;
};
function baseTransform(){
  return {
    anchor:P.newProp([0,0,0]),pos:P.newProp([0,0,0]),
    scale:P.newProp([100,100,100]),rot:P.newProp([0,0,0]),opacity:P.newProp(100)
  };
}
function newMaterial(){
  return {base:P.newProp([0.85,0.62,0.32]),metal:P.newProp(0.9),rough:P.newProp(0.35),
    emissive:P.newProp([0,0,0]),emissiveI:P.newProp(0),opacity:P.newProp(1)};
}
function newParticle(){
  return {
    emitter:{type:'point',source:'layer',radius:0,spread:0,direction:[0,-1,0],arc:360},
    birth:P.newProp(60),life:P.newProp(1.6),lifeVar:P.newProp(0.4),
    vel:P.newProp(260),velVar:P.newProp(60),size:P.newProp(7),sizeVar:P.newProp(3),
    drag:P.newProp(0.6),grav:P.newProp(120),gravDir:P.newProp([0,1,0]),
    colorA:P.newProp([1,0.85,0.4]),colorB:P.newProp([1,0.3,0.1]),
    seed:P.newProp(7),inherit:P.newProp(0.35),
    collide:P.newProp(1),bounce:P.newProp(0.45),friction:P.newProp(0.25),
    trail:{len:P.newProp(0),width:P.newProp(1),fade:P.newProp(1)},
    burst:{count:P.newProp(0),radius:P.newProp(20),speed:P.newProp(400)},
    onHit:'spark'
  };
}
function newAudio(){
  return {
    inst:'metal',root:P.newProp(220),scale:P.newProp('五声'),
    pattern:[],gain:P.newProp(0.5),
    lpf:P.newProp(6000),decay:P.newProp(0.6)
  };
}
function newGroup(name){
  return {id:lid(),name:name||'组',enabled:true,items:[],transform:{anchor:P.newProp([0,0]),pos:P.newProp([0,0]),scale:P.newProp([100,100]),rot:P.newProp(0),opacity:P.newProp(100)}};
}
function pathItem(name,path){
  return {id:lid(),type:'path',name:name||'路径',path:path||rectPath(100,100),anim:false,keys:[]};
}
function rectPath(w,h){
  const hw=w/2,hh=h/2;
  return {contours:[{closed:true,pts:[
    {x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}]}]};
}
function ellipsePath(rx,ry){
  const pts=[];
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;
    pts.push({x:Math.cos(a)*rx,y:Math.sin(a)*ry});}
  return {contours:[{closed:true,pts}]};
}
function fillItem(color){
  return {id:lid(),type:'fill',name:'填充',color:color||'#ff9a3c',opacity:P.newProp(100),rule:'nonzero'};
}
function strokeItem(color,w){
  return {id:lid(),type:'stroke',name:'描边',color:color||'#ffffff',width:P.newProp(w||4),opacity:P.newProp(100),cap:'round',join:'round',dash:[]};
}
function trimItem(){
  return {id:lid(),type:'trim',name:'修剪路径',start:P.newProp(0),end:P.newProp(100),offset:P.newProp(0),multiple:'simultaneously'};
}
function repeaterItem(){
  return {id:lid(),type:'repeater',name:'重复器',copies:P.newProp(3),
    pos:P.newProp([0,0]),scale:P.newProp([100,100]),rot:P.newProp(0),anchor:P.newProp([0,0]),opacity:P.newProp(100),
    composite:'below'};
}
function mergeItem(mode){
  return {id:lid(),type:'merge',name:'合并路径',mode:mode||'union'};
}

/* ---------- 合成 ---------- */
P.newComp=function(name,w,h,fps,dur){
  return {id:lid(),name:name||'合成',w:w||1280,h:h||960,fps:fps||30,duration:dur||15,
    workStart:0,workEnd:dur||15,bg:'#0b0c0e',bgType:'solid',
    layers:[],mb:{on:true,shutter:180,phase:0,samples:8},
    nodeGraph:{nodes:[],links:[]},markers:[]};
};

/* ---------- 工程 ---------- */
P.newProject=function(){
  const comp=P.newComp('主合成',1280,720,30,15);
  return {version:1,name:'未命名工程',comps:[comp],activeComp:comp.id,font:'锻火体'};
};
P.serialize=function(){
  const pr=APP.app?APP.app.project:null;
  if(!pr)return {};
  return {version:1,name:pr.name,comps:pr.comps,activeComp:pr.activeComp,font:pr.font,
    sel:APP.app?APP.app.sel:{}};
};
P.load=function(data,keepSel){
  const pr={version:data.version||1,name:data.name||'工程',comps:data.comps||[],
    activeComp:data.activeComp||(data.comps&&data.comps[0]&&data.comps[0].id),font:data.font||'锻火体'};
  if(APP.app){
    APP.app.project=pr;
    if(!pr.activeComp||!pr.comps.find(c=>c.id===pr.activeComp))pr.activeComp=pr.comps[0]&&pr.comps[0].id;
    if(!keepSel)APP.app.sel=[];
    // 清缓存
    APP.app.cache={};
    APP.app.particleCache={};
  }
  return pr;
};

/* ---------- 查询工具 ---------- */
P.comp=function(id){const pr=APP.app.project;return pr.comps.find(c=>c.id===id);};
P.activeComp=function(){const pr=APP.app&&APP.app.project;if(!pr||!pr.comps||!pr.comps.length)return null;
  return pr.comps.find(c=>c.id===pr.activeComp)||pr.comps[0];};
P.layer=function(id,comp){
  comp=comp||P.activeComp();
  if(!comp)return null;
  for(const l of comp.layers)if(l.id===id)return l;
  return null;
};
P.layerInComp=function(id,compId){
  const c=P.comp(compId);if(!c)return null;
  for(const l of c.layers)if(l.id===id)return l;
  return null;
};
P.anyLayer=function(id){
  const pr=APP.app.project;
  for(const c of pr.comps)for(const l of c.layers)if(l.id===id)return {layer:l,comp:c};
  return null;
};
P.isAncestor=function(ancId,layerId,comp){
  let cur=P.layer(layerId,comp);
  let guard=0;
  while(cur&&cur.parent&&guard++<50){
    if(cur.parent===ancId)return true;
    cur=P.layer(cur.parent,comp);
  }
  return false;
};
P.allDescendants=function(id,comp){
  const out=[];
  const walk=pid=>{for(const l of comp.layers){if(l.parent===pid){out.push(l.id);walk(l.id);}}};
  walk(id);return out;
};
P.layerLabel=function(l){return LABEL_COLORS[l.label%LABEL_COLORS.length];};
P.cloneLayer=function(L){
  const c=C.deepClone(L);
  c.id=lid();
  // 子层跟随
  const pr=APP.app.project;
  return c;
};
P.cloneComp=function(cp){
  const c=C.deepClone(cp);
  c.id=lid();c.name=cp.name+' 副本';
  return c;
};
/* 复制图层(含子层) */
P.duplicateLayer=function(L,comp){
  const map={};
  const ids=[L.id,...P.allDescendants(L.id,comp)];
  const copies=[];
  for(const id of ids){
    const src=P.layer(id,comp);
    const c=C.deepClone(src);c.id=lid();map[id]=c.id;copies.push(c);
  }
  for(const c of copies)if(c.parent&&map[c.parent])c.parent=map[c.parent];
  const idx=comp.layers.indexOf(L);
  comp.layers.splice(idx+1,0,...copies);
  return copies[0];
};

/* ---------- 图层类型元数据 ---------- */
P.TYPE_ICON={shape:'▰',text:'T',null:'◎',adjust:'◐',precomp:'▣',camera:'⁂',light:'☀',geo3d:'⬢',particle:'✳',audio:'♪'};
P.TYPE_NAME={shape:'形状',text:'文字',null:'空对象',adjust:'调整层',precomp:'预合成',camera:'摄像机',light:'灯光',geo3d:'三维几何',particle:'粒子',audio:'音色'};

APP.project=P;
})();
