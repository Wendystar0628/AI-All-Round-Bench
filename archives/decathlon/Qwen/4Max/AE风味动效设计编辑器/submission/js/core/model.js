/* 铸帧 ForgeFrame · 工程数据模型 */
"use strict";
(function(){
const FF=window.FF, uid=FF.util.uid, clone=FF.deepClone;

/* 属性工厂：kind: num|vec2|vec3|color|path|text|bool */
function P(kind,value,extra){
  return Object.assign({kind, value, keys:[], expr:null, exprOn:false}, extra||{});
}
function K(t,v,i){ return {t, v:clone(v), i:i||'bez', ei:[0.33,0.33], eo:[0.33,0.33], si:[0,0], so:[0,0]}; }
FF.P=P; FF.K=K;

const LAYER_TYPES={
  shape:{name:'形状', icon:'◆'},
  text:{name:'文字', icon:'文'},
  null:{name:'空对象', icon:'⊹'},
  adjustment:{name:'调整', icon:'◐'},
  precomp:{name:'预合成', icon:'▣'},
  camera:{name:'摄像机', icon:'📷'},
  light:{name:'灯光', icon:'✦'},
  geo:{name:'三维几何', icon:'⬢'},
  particles:{name:'粒子', icon:'⁘'},
  audio:{name:'音色', icon:'♪'},
  field:{name:'空间场', icon:'◎'},
};
FF.LAYER_TYPES=LAYER_TYPES;

function baseLayer(type,name){
  const l={
    id:uid('L'), name:name||LAYER_TYPES[type].name, type,
    visible:true, locked:false, parent:null,
    inPoint:0, outPoint:1e9, startTime:0,
    blend:'normal', motionBlur:false, threeD:false,
    matte:'none',
    transform:{
      anchor:P('vec2',[0,0]), position:P('vec2',[0,0]),
      scale:P('vec2',[100,100]), rotation:P('num',0), opacity:P('num',100),
    },
    masks:[], effects:[],
  };
  if(type==='shape'){
    l.shapes=[]; l.modifiers=[];
  } else if(type==='text'){
    l.text={ content:P('text','铸帧'), fontSize:P('num',80), lineHeight:P('num',1.25),
      align:'center', tracking:P('num',0),
      fill:P('color',[1,1,1]), animators:[] };
  } else if(type==='precomp'){
    l.compId=null; l.timeRemap=null;
  } else if(type==='camera'){
    l.threeD=true;
    l.transform.anchor=P('vec3',[0,0,0]); l.transform.position=P('vec3',[0,0,900]);
    l.transform.scale=P('vec3',[100,100,100]);
    l.transform.rotationX=P('num',0); l.transform.rotationY=P('num',0); l.transform.rotationZ=P('num',0);
    l.camera={ fov:P('num',40), target:P('vec3',[0,0,0]), focusDistance:P('num',900), aperture:P('num',0) };
  } else if(type==='light'){
    l.threeD=true;
    l.transform.anchor=P('vec3',[0,0,0]); l.transform.position=P('vec3',[300,400,500]);
    l.transform.scale=P('vec3',[100,100,100]);
    l.transform.rotationX=P('num',0); l.transform.rotationY=P('num',0); l.transform.rotationZ=P('num',0);
    l.light={ lightType:'point', color:P('color',[1,0.95,0.85]), intensity:P('num',100),
      target:P('vec3',[0,0,0]), castsShadow:false, decay:P('num',1) };
  } else if(type==='geo'){
    l.threeD=true;
    l.transform.anchor=P('vec3',[0,0,0]); l.transform.position=P('vec3',[0,0,0]);
    l.transform.scale=P('vec3',[100,100,100]);
    l.transform.rotationX=P('num',0); l.transform.rotationY=P('num',0); l.transform.rotationZ=P('num',0);
    l.geo={
      graphId:null, outputNode:null,
      depth:P('num',40), bevel:P('num',4), useOwnExtrude:true,
      bend:P('num',0), bendAxis:'x', twist:P('num',0),
      pins:[], fields:[],
      material:{ baseColor:P('color',[0.75,0.78,0.82]), metallic:P('num',0.8), roughness:P('num',0.35),
        emissive:P('color',[0,0,0]), emissiveStrength:P('num',0), opacity:P('num',100) },
      castShadow:true, receiveShadow:true, collide:false,
    };
  } else if(type==='particles'){
    l.threeD=true;
    l.transform.anchor=P('vec3',[0,0,0]); l.transform.position=P('vec3',[0,0,0]);
    l.transform.scale=P('vec3',[100,100,100]);
    l.transform.rotationX=P('num',0); l.transform.rotationY=P('num',0); l.transform.rotationZ=P('num',0);
    l.particles={
      seed:7, emitters:[], gravity:P('vec3',[0,-300,0]), drag:P('num',0.6),
      wind:P('vec3',[0,0,0]), fields:[],
      sizeStart:P('num',6), sizeEnd:P('num',1),
      colorStops:[[0,[1,0.98,0.85]],[0.25,[1,0.72,0.25]],[0.7,[0.9,0.25,0.06]],[1,[0.25,0.06,0.02]]],
      opacityStart:P('num',100), opacityEnd:P('num',0), additive:true,
      collideWith:[], restitution:P('num',0.35), friction:P('num',0.75),
      hitFlash:true, hitLifeLoss:P('num',0.12), secondary:P('num',0),
      trails:{ enabled:false, length:P('num',10), width:P('num',2.5), fade:P('num',1.6), color:P('color',[1,0.6,0.2]) },
    };
  } else if(type==='audio'){
    l.audio={ instrument:'hit', events:[], amp:P('num',60), freq:P('num',220),
      decay:P('num',1.2), tone:P('num',0.5), noise:P('num',0.3), filter:P('num',2200) };
  } else if(type==='field'){
    l.threeD=true;
    l.transform.anchor=P('vec3',[0,0,0]); l.transform.position=P('vec3',[0,0,0]);
    l.transform.scale=P('vec3',[100,100,100]);
    l.transform.rotationX=P('num',0); l.transform.rotationY=P('num',0); l.transform.rotationZ=P('num',0);
    l.field={ fieldType:'falloff', radius:P('num',220), strength:P('num',120),
      freq:P('num',1.4), direction:P('vec3',[0,1,0]) };
  }
  return l;
}
FF.makeLayer=baseLayer;

function makeComp(name,w,h,fps,duration){
  return { id:uid('C'), name:name||'合成', w:w||1280, h:h||720, fps:fps||30, duration:duration||10,
    workArea:[0,duration||10], bg:[0.04,0.05,0.08,1],
    motionBlur:{enabled:false, shutterAngle:180, phase:0}, layers:[] };
}
FF.makeComp=makeComp;

function makeProject(name){
  return { name:name||'未命名工程', comps:[], nodeGraphs:[], version:1 };
}
FF.makeProject=makeProject;

/* ---------- 查找 ---------- */
FF.findComp=(proj,id)=>proj.comps.find(c=>c.id===id);
FF.findLayer=(comp,id)=>comp.layers.find(l=>l.id===id);
FF.layerByName=(comp,name)=>comp.layers.find(l=>l.name===name);
FF.findGraph=(proj,id)=>proj.nodeGraphs.find(g=>g.id===id);

/* ---------- 图层操作 ---------- */
function remapIds(obj,map){
  const s=JSON.stringify(obj);
  const o=JSON.parse(s.replace(/"L\d+_[a-z0-9]+"/g, m=>{
    const id=m.slice(1,-1); return '"'+(map[id]||id)+'"';
  }));
  return o;
}
FF.duplicateLayer=(comp,layer)=>{
  const cp=clone(layer);
  const map={[layer.id]:uid('L')};
  const out=remapIds(cp,map);
  out.id=map[layer.id];
  out.name=layer.name+' 副本';
  if(out.parent===layer.id) out.parent=null;
  const idx=comp.layers.indexOf(layer);
  comp.layers.splice(idx+1,0,out);
  return out;
};
FF.removeLayers=(comp,ids)=>{
  comp.layers=comp.layers.filter(l=>!ids.includes(l.id));
  for(const l of comp.layers){ if(ids.includes(l.parent)) l.parent=null; }
};
FF.moveLayer=(comp,id,dir)=>{
  const i=comp.layers.findIndex(l=>l.id===id);
  const j=i+dir;
  if(i<0||j<0||j>=comp.layers.length) return;
  const [l]=comp.layers.splice(i,1); comp.layers.splice(j,0,l);
};

/* 属性路径遍历：'transform.position' / 'geo.material.metallic' / 'text.fontSize' ... */
FF.getProp=(obj,path)=>{
  const parts=path.split('.'); let o=obj;
  for(const p of parts){ if(o==null) return null; o=o[p]; }
  return o&&o.kind?o:null;
};
FF.setPropValue=(obj,path,val)=>{
  const parts=path.split('.'); let o=obj;
  for(let i=0;i<parts.length-1;i++) o=o[parts[i]];
  const last=parts[parts.length-1];
  if(o[last]&&o[last].kind) o[last].value=val; else o[last]=val;
};
/* 收集图层全部可动画属性 */
FF.allProps=(layer)=>{
  const out=[];
  const walk=(o,prefix)=>{
    for(const k in o){
      const v=o[k];
      if(v&&typeof v==='object'){
        if(v.kind) out.push({path:prefix+k, prop:v});
        else if(!Array.isArray(v)) walk(v,prefix+k+'.');
      }
    }
  };
  walk(layer,'');
  return out;
};

/* 形状项工厂 */
FF.makeShapeItem=(kind)=>{
  const s={ id:uid('S'), kind, name:kind==='rect'?'矩形':(kind==='ellipse'?'椭圆':'路径'),
    position:P('vec2',[0,0]), fill:{enabled:true, color:P('color',[1,0.48,0.16]), opacity:P('num',100)},
    stroke:{enabled:false, color:P('color',[1,1,1]), width:P('num',4), opacity:P('num',100)} };
  if(kind==='rect'){ s.size=P('vec2',[240,160]); s.roundness=P('num',0); }
  else if(kind==='ellipse'){ s.size=P('vec2',[200,200]); }
  else if(kind==='path'){ s.path=P('path',FF.Path.empty()); }
  else if(kind==='strokeRef'){ s.sourceLayer=''; s.strokeIndex=0; s.write=P('num',100); s.name='笔画'; }
  return s;
};
FF.makeEffect=(type)=>{
  const e={ id:uid('E'), type, enabled:true };
  if(type==='blur') e.radius=P('num',8);
  else if(type==='glow'){ e.threshold=P('num',0.55); e.radius=P('num',18); e.intensity=P('num',1.2); e.color=P('color',[1,0.7,0.3]); }
  else if(type==='shadow'){ e.color=P('color',[0,0,0]); e.opacity=P('num',55); e.distance=P('num',14); e.angle=P('num',135); e.softness=P('num',12); }
  else if(type==='hsl'){ e.hue=P('num',0); e.saturation=P('num',0); e.lightness=P('num',0); }
  return e;
};
FF.EFFECT_NAMES={blur:'高斯模糊',glow:'发光',shadow:'投影',hsl:'色相/饱和度/亮度'};
FF.makeMask=(kind)=>({ id:uid('M'), kind, mode:'add', invert:false,
  feather:P('num',0), opacity:P('num',100),
  position:P('vec2',[0,0]), size:P('vec2',[300,220]), path:P('path',FF.Path.empty()) });

/* 节点图工厂 */
FF.makeGraph=(name)=>({ id:uid('G'), name:name||'节点图', nodes:[], view:{x:40,y:40,zoom:1} });
FF.makeNode=(type,x,y)=>{
  const n={ id:uid('N'), type, x:x||60, y:y||60, params:{}, inputs:{} };
  const def=FF.nodeDefs&&FF.nodeDefs[type];
  if(def){ for(const k in def.params){ n.params[k]=clone(def.params[k]); } }
  return n;
};

/* 序列化（去掉运行时缓存） */
FF.serialize=(proj)=>JSON.stringify(proj);
FF.deserialize=(text)=>{
  const p=JSON.parse(text);
  if(!p.comps||!Array.isArray(p.comps)) throw new Error('不是有效的铸帧工程文件');
  p.nodeGraphs=p.nodeGraphs||[];
  return p;
};
})();
