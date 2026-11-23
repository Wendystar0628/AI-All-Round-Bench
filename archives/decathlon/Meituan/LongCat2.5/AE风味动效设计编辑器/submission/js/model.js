/* model.js — 工程 / 合成 / 图层 / 关键帧 / 求值 / 撤销 / 存取 */
(function(){
'use strict';
const M = {};
window.Model = M;

M.project = null;
M.sel = { compId:null, layerIds:[] };
M.history = [];
M.historyIndex = -1;
M.MAXHIST = 80;
M.listeners = {};
M.on = (ev,fn)=>{ (M.listeners[ev]=M.listeners[ev]||[]).push(fn); };
M.emit = (ev,data)=>{ (M.listeners[ev]||[]).forEach(f=>{try{f(data);}catch(e){console.error(e);}}); };

/* ==================== 属性模式 ==================== */
// t: num | vec2 | vec3 | color | bool | select | text
M.SCHEMA = [
  {key:'transform', label:'变换', props:[
    {p:'transform.anchorPoint', l:'锚点', t:'vec3'},
    {p:'transform.position', l:'位置', t:'vec3'},
    {p:'transform.scale', l:'缩放', t:'vec3', u:'%'},
    {p:'transform.rotation', l:'旋转', t:'num', u:'°'},
    {p:'transform.rotationX', l:'X 旋转', t:'num', u:'°'},
    {p:'transform.rotationY', l:'Y 旋转', t:'num', u:'°'},
    {p:'transform.pointOfInterest', l:'目标点', t:'vec3'},
    {p:'transform.opacity', l:'不透明度', t:'num', u:'%'},
  ]},
  {key:'shape', label:'形状内容', props:[
    {p:'shape.fill.enabled', l:'填充', t:'bool'},
    {p:'shape.fill.color', l:'填充色', t:'color'},
    {p:'shape.fill.opacity', l:'填充不透明度', t:'num', u:'%'},
    {p:'shape.stroke.enabled', l:'描边', t:'bool'},
    {p:'shape.stroke.color', l:'描边色', t:'color'},
    {p:'shape.stroke.width', l:'描边宽度', t:'num', u:'px'},
    {p:'shape.stroke.opacity', l:'描边不透明度', t:'num', u:'%'},
    {p:'shape.trim.enabled', l:'修剪路径', t:'bool'},
    {p:'shape.trim.start', l:'起点', t:'num', u:'%'},
    {p:'shape.trim.end', l:'终点', t:'num', u:'%'},
    {p:'shape.trim.offset', l:'偏移', t:'num', u:'%'},
    {p:'shape.repeater.enabled', l:'重复器', t:'bool'},
    {p:'shape.repeater.count', l:'副本数', t:'num', u:''},
    {p:'shape.repeater.pos', l:'位置偏移', t:'vec3'},
    {p:'shape.repeater.rot', l:'旋转偏移', t:'num', u:'°'},
    {p:'shape.repeater.scale', l:'缩放偏移', t:'vec3', u:'%'},
  ]},
  {key:'text', label:'文字', props:[
    {p:'text.source', l:'内容', t:'text'},
    {p:'text.font', l:'字体', t:'font'},
    {p:'text.size', l:'字号', t:'num', u:'px'},
    {p:'text.lineHeight', l:'行距', t:'num', u:''},
    {p:'text.tracking', l:'字距', t:'num', u:''},
    {p:'text.align', l:'对齐', t:'select', opts:[['left','左'],['center','中'],['right','右']]},
    {p:'text.fill.enabled', l:'填充', t:'bool'},
    {p:'text.fill.color', l:'填充色', t:'color'},
    {p:'text.stroke.enabled', l:'描边', t:'bool'},
    {p:'text.stroke.color', l:'描边色', t:'color'},
    {p:'text.stroke.width', l:'描边宽度', t:'num', u:'px'},
    {p:'text.outline', l:'字形转几何', t:'bool'},
  ]},
  {key:'camera', label:'摄像机', props:[
    {p:'camera.position', l:'位置', t:'vec3'},
    {p:'camera.pointOfInterest', l:'目标点', t:'vec3'},
    {p:'camera.zoom', l:'缩放/焦距', t:'num', u:''},
    {p:'camera.fov', l:'视角', t:'num', u:'°'},
    {p:'camera.focusDistance', l:'对焦距离', t:'num', u:''},
    {p:'camera.aperture', l:'光圈', t:'num', u:''},
    {p:'camera.enableDOF', l:'景深', t:'bool'},
    {p:'camera.blurLevel', l:'模糊强度', t:'num', u:''},
  ]},
  {key:'light', label:'灯光', props:[
    {p:'light.type', l:'类型', t:'select', opts:[['point','点光源'],['spot','聚光灯'],['parallel','平行光']]},
    {p:'light.color', l:'颜色', t:'color'},
    {p:'light.intensity', l:'强度', t:'num', u:''},
    {p:'light.position', l:'位置', t:'vec3'},
    {p:'light.direction', l:'方向', t:'vec3'},
    {p:'light.cornerAngle', l:'锥角', t:'num', u:'°'},
    {p:'light.cornerFeather', l:'羽化', t:'num', u:'%'},
    {p:'light.castShadow', l:'投影', t:'bool'},
    {p:'light.shadowIntensity', l:'阴影强度', t:'num', u:'%'},
    {p:'light.radius', l:'光源半径', t:'num', u:''},
  ]},
  {key:'geometry', label:'三维几何', props:[
    {p:'geo.sourceType', l:'来源', t:'select', opts:[['shape','形状图层'],['text','文字图层'],['primitive','基本体'],['layer','指定图层']]},
    {p:'geo.sourceLayerId', l:'来源图层', t:'layer'},
    {p:'geo.primitive', l:'基本体', t:'select', opts:[['box','立方体'],['sphere','球体'],['cylinder','圆柱'],['torus','圆环'],['plane','平面']]},
    {p:'geo.depth', l:'挤出深度', t:'num', u:''},
    {p:'geo.bevelEnabled', l:'倒角', t:'bool'},
    {p:'geo.bevelSize', l:'倒角大小', t:'num', u:''},
    {p:'geo.bevelSegments', l:'倒角段数', t:'num', u:''},
    {p:'geo.curveSegments', l:'曲线精度', t:'num', u:''},
    {p:'geo.deformbend', l:'弯曲', t:'num', u:''},
    {p:'geo.deformtwist', l:'扭转', t:'num', u:''},
    {p:'geo.flatShading', l:'平直着色', t:'bool'},
  ]},
  {key:'material', label:'材质', props:[
    {p:'mat.color', l:'基础色', t:'color'},
    {p:'mat.metalness', l:'金属度', t:'num', u:''},
    {p:'mat.roughness', l:'粗糙度', t:'num', u:''},
    {p:'mat.emissive', l:'发光色', t:'color'},
    {p:'mat.emissiveIntensity', l:'发光强度', t:'num', u:''},
    {p:'mat.opacity', l:'不透明度', t:'num', u:'%'},
    {p:'mat.envIntensity', l:'环境反射', t:'num', u:''},
    {p:'mat.castShadow', l:'投射阴影', t:'bool'},
    {p:'mat.receiveShadow', l:'接收阴影', t:'bool'},
  ]},
  {key:'deform', label:'图钉与场', props:[
    {p:'deform.fieldStrength', l:'场强度', t:'num', u:''},
  ]},
  {key:'particle', label:'粒子', props:[
    {p:'particle.rate', l:'发射率', t:'num', u:''},
    {p:'particle.life', l:'寿命', t:'num', u:'s'},
    {p:'particle.speed', l:'速率', t:'num', u:''},
    {p:'particle.speedRandom', l:'速率随机', t:'num', u:''},
    {p:'particle.size', l:'大小', t:'num', u:''},
    {p:'particle.sizeRandom', l:'大小随机', t:'num', u:''},
    {p:'particle.gravity', l:'重力', t:'num', u:''},
    {p:'particle.resistance', l:'阻力', t:'num', u:''},
    {p:'particle.seed', l:'随机种子', t:'num', u:''},
    {p:'particle.colorStart', l:'起始色', t:'color'},
    {p:'particle.colorEnd', l:'结束色', t:'color'},
    {p:'particle.opacityStart', l:'起始透明度', t:'num', u:'%'},
    {p:'particle.opacityEnd', l:'结束透明度', t:'num', u:'%'},
    {p:'particle.trailLength', l:'拖尾长度', t:'num', u:''},
    {p:'particle.trailWidth', l:'拖尾宽度', t:'num', u:''},
    {p:'particle.collide', l:'碰撞', t:'bool'},
    {p:'particle.bounce', l:'弹性', t:'num', u:''},
    {p:'particle.friction', l:'摩擦', t:'num', u:''},
    {p:'particle.subEmit', l:'碰撞次级发射', t:'bool'},
  ]},
  {key:'audio', label:'音色', props:[
    {p:'audio.preset', l:'音色', t:'select', opts:[['anvil','铁砧'],['hum','低鸣'],['whoosh','呼啸'],['spark','火星'],['drone','持续氛围'],['chime','风铃'],['drum','鼓点']]},
    {p:'audio.note', l:'音高', t:'num', u:''},
    {p:'audio.duration', l:'时长', t:'num', u:'s'},
    {p:'audio.volume', l:'音量', t:'num', u:''},
    {p:'audio.detune', l:'失谐', t:'num', u:''},
    {p:'audio.attack', l:'起音', t:'num', u:'s'},
    {p:'audio.decay', l:'衰减', t:'num', u:'s'},
    {p:'audio.tempo', l:'节奏', t:'num', u:'bpm'},
    {p:'audio.pattern', l:'节奏型', t:'text'},
  ]},
  {p:'timeRemap.enabled', l:'时间重映射', t:'bool'},
];

M.TYPE_GROUPS = {
  shape:['transform','shape'],
  text:['transform','text'],
  null:['transform'],
  adjust:['transform','effects'],
  precomp:['transform','timeRemap'],
  camera:['camera'],
  light:['light'],
  geometry3d:['transform','geometry','material','deform'],
  particle:['transform','particle'],
  audio:['audio'],
};
M.VISUAL_TYPES = ['shape','text','precomp','geometry3d','particle','adjust'];
M.TYPE_LABEL = {shape:'形状',text:'文字',null:'空对象',adjust:'调整图层',precomp:'预合成',camera:'摄像机',light:'灯光',geometry3d:'三维几何',particle:'粒子',audio:'音色'};

/* ==================== 默认值 ==================== */
M.LAYER_DEFAULTS = {
  transform:{ anchorPoint:[0,0,0], position:[0,0,0], scale:[100,100,100], rotation:0, rotationX:0, rotationY:0, pointOfInterest:[0,0,0], opacity:100 },
  shape:{ paths:[], fill:{enabled:true,color:[1,1,1],opacity:100}, stroke:{enabled:false,color:[0,0,0],width:4,opacity:100,cap:'round',join:'round'},
          trim:{enabled:false,start:0,end:100,offset:0}, repeater:{enabled:false,count:1,pos:[0,0,0],rot:0,scale:[100,100,100]} },
  text:{ source:'文字', font:'Microsoft YaHei', size:120, lineHeight:1.2, tracking:0, align:'left',
         fill:{enabled:true,color:[1,1,1]}, stroke:{enabled:false,color:[0,0,0],width:0}, outline:false, animators:[] },
  camera:{ position:[0,0,-1000], pointOfInterest:[0,0,0], zoom:50, fov:35, focusDistance:1000, aperture:10, enableDOF:false, blurLevel:1 },
  light:{ type:'point', color:[1,1,1], intensity:1, position:[300,-300,400], direction:[0,0,1], cornerAngle:45, cornerFeather:50, castShadow:true, shadowIntensity:80, radius:0 },
  geo:{ sourceType:'shape', sourceLayerId:null, primitive:'box', depth:120, bevelEnabled:true, bevelSize:8, bevelSegments:3, curveSegments:16, deformbend:0, deformtwist:0, flatShading:false },
  mat:{ color:[0.8,0.8,0.82], metalness:0.9, roughness:0.35, emissive:[0,0,0], emissiveIntensity:1, opacity:100, envIntensity:1, castShadow:true, receiveShadow:true },
  deform:{ fieldStrength:1, pins:[] },
  particle:{ rate:60, life:1.2, speed:200, speedRandom:0.4, size:6, sizeRandom:0.5, gravity:300, resistance:0.2, seed:1,
             colorStart:[1,0.8,0.3], colorEnd:[1,0.3,0.05], opacityStart:100, opacityEnd:0,
             trailLength:8, trailWidth:2, collide:true, bounce:0.4, friction:0.2, subEmit:false,
             emitters:[{id:'em1',type:'point',position:[0,0,0],direction:[0,1,0],spread:30,sourceLayerId:null,surface:false,velocity:true}] },
  audio:{ preset:'anvil', note:55, duration:0.6, volume:0.7, detune:0, attack:0.005, decay:0.5, tempo:120, pattern:'1' },
  timeRemap:{enabled:false, keys:null},
};

/* ==================== 创建 ==================== */
M.createProject=function(name){
  const p = { version:1, name:name||'未命名工程', comps:[], created:Date.now() };
  M.project = p;
  M.sel = {compId:null, layerIds:[]};
  return p;
};

M.createComp=function(opts={}){
  const c = {
    id:U.uid('comp'), name:opts.name||('合成 '+(M.project.comps.length+1)),
    width:opts.width||1280, height:opts.height||720, fps:opts.fps||30,
    duration:opts.duration!==undefined?opts.duration:15,
    workStart:opts.workStart||0, workEnd:opts.workEnd!==undefined?opts.workEnd:(opts.duration!==undefined?opts.duration:15),
    bgColor:opts.bgColor||[0.05,0.06,0.08],
    layers:[],
  };
  M.project.comps.push(c);
  return c;
};

M.createLayer=function(comp,type,opts={}){
  const l = {
    id:U.uid('lyr'), name:opts.name||(M.TYPE_LABEL[type]||type)+' '+(comp.layers.length+1),
    type, threeD:(type==='geometry3d'||type==='camera'||type==='light'||opts.threeD?true:false),
    inPoint:opts.inPoint||0, outPoint:opts.outPoint!==undefined?opts.outPoint:comp.duration,
    startTime:opts.startTime||0, parent:null, parentComp:U.m4ident(),
    visible:true, locked:false, solo:false, motionBlur:true, blendMode:'normal',
    matte:null, effects:[], masks:[],
    values:{}, kf:{}, expr:{},
    ui:{collapsed:{}, expand:{}},
  };
  // 默认值（按组分嵌套存储）
  const d = M.LAYER_DEFAULTS;
  for(const k of Object.keys(d)){
    if(k==='transform'){
      l.values['transform'] = {
        anchorPoint:(opts.anchor!==undefined? opts.anchor : [comp.width/2, comp.height/2, 0]).slice(),
        position:(opts.position||[comp.width/2,comp.height/2,0]).slice(),
        scale:[100,100,100], rotation:0, rotationX:0, rotationY:0,
        pointOfInterest:[0,0,0], opacity:100,
      };
    } else if(k==='timeRemap'){
      l.values['timeRemap'] = {enabled:false, keys:null};
    } else {
      l.values[k] = U.deepClone(d[k]);
    }
  }
  if(type==='precomp') l.precompId=opts.compId||null;
  if(opts.values) for(const k of Object.keys(opts.values)) l.values[k]=U.deepClone(opts.values[k]);
  if(opts.kf) l.kf=U.deepClone(opts.kf);
  if(opts.expr) l.expr=U.deepClone(opts.expr);
  if(opts.masks) l.masks=U.deepClone(opts.masks);
  if(opts.effects) l.effects=U.deepClone(opts.effects);
  if(opts.transform) Object.assign(l.values, opts.transform);
  comp.layers.push(l);
  return l;
};

M.getComp=function(idOrName){
  if(!M.project) return null;
  return M.project.comps.find(c=>c.id===idOrName||c.name===idOrName)||null;
};
M.findLayer=function(comp,nameOrIdOrIndex){
  if(!comp) return null;
  if(typeof nameOrIdOrIndex==='number') return comp.layers[nameOrIdOrIndex]||null;
  return comp.layers.find(l=>l.id===nameOrIdOrIndex||l.name===nameOrIdOrIndex)||null;
};
M.getLayer=function(id){
  for(const c of M.project.comps){ const l=c.layers.find(x=>x.id===id); if(l) return l; }
  return null;
};
M.layerComp=function(layer){
  for(const c of M.project.comps){ if(c.layers.indexOf(layer)>=0) return c; }
  return null;
};
M.addChild=function(parent,child){ if(child.parent===parent.id) return; child.parent=parent.id; };
M.childrenOf=function(layer){ const c=M.layerComp(layer); return c?c.layers.filter(l=>l.parent===layer.id):[] };

/* ==================== 静态值 ==================== */
M.getDefault=function(layer,path){
  const parts=path.split('.');
  let node=M.LAYER_DEFAULTS;
  for(const p of parts){ if(node&&typeof node==='object'&&p in node) node=node[p]; else return undefined; }
  return node;
};
function walkValues(root,parts){
  let node=root;
  for(const p of parts){ if(node&&typeof node==='object'&&p in node) node=node[p]; else return {found:false}; }
  return {found:true, value:node};
}
M.getStaticValue=function(layer,path){
  const w=walkValues(layer.values,path.split('.'));
  if(w.found) return w.value;
  return M.getDefault(layer,path);
};
M.setStaticValue=function(layer,path,value){
  const parts=path.split('.');
  let node=layer.values;
  for(let i=0;i<parts.length-1;i++){
    if(!node[parts[i]]||typeof node[parts[i]]!=='object') node[parts[i]]={};
    node=node[parts[i]];
  }
  node[parts[parts.length-1]]=U.deepClone(value);
};
M.evalObj=function(layer,prefix,t,comp){
  const out={};
  const build=(p,v)=>{
    const parts=p.split('.');
    let node=out;
    for(let i=1;i<parts.length-1;i++){ if(!node[parts[i]]||typeof node[parts[i]]!=='object') node[parts[i]]={}; node=node[parts[i]]; }
    node[parts[parts.length-1]]=v;
  };
  for(const g of M.SCHEMA){
    if(g.key!==prefix) continue;
    for(const p of g.props) build(p.p, M.evalProperty(layer,p.p,t,comp));
  }
  // 合并非 schema 字段
  const base=layer.values[prefix];
  if(base&&typeof base==='object'){
    const merge=(dst,src)=>{
      for(const k of Object.keys(src)){
        if(src[k]&&typeof src[k]==='object'&&!Array.isArray(src[k])){ if(!dst[k]) dst[k]={}; merge(dst[k],src[k]); }
        else if(!(k in dst)) dst[k]=U.deepClone(src[k]);
      }
    };
    merge(out,base);
  }
  return out;
};

/* ==================== 属性求值 ==================== */
M.cache = { expr:{} };
M._evalStack = [];
M.evalProperty=function(layer,path,t,comp){
  comp = comp || M.layerComp(layer);
  if(!comp) return M.getStaticValue(layer,path);
  const stackKey=layer.id+':'+path;
  if(M._evalStack.indexOf(stackKey)>=0){
    const kf=layer.kf[path];
    return (kf&&kf.keys&&kf.keys.length)? U.evalKeys(kf.keys,t) : M.getStaticValue(layer,path);
  }
  const expr = layer.expr && layer.expr[path];
  if(expr){
    const keys = layer.kf[path]? layer.kf[path].keys : null;
    const base = keys? U.evalKeys(keys,t) : M.getStaticValue(layer,path);
    const cacheKey = layer.id+':'+path;
    let fn = M.cache.expr[cacheKey];
    if(!fn){ try{ fn=Expression.compile(expr); }catch(e){ fn=null; M.cache.expr[cacheKey]=null; } }
    if(fn){
      M._evalStack.push(stackKey);
      let res;
      try{
        res = Expression.evalExpression(expr,{
          time:t, value:base, layer, comp, propPath:path, keys,
          seed:(U.hashStr(layer.id+path)%100000)+1
        });
      }finally{ M._evalStack.pop(); }
      if(res.error){
        layer._exprError = res.error.message;
        return base;
      }
      layer._exprError = null;
      return res.value;
    }
    return base;
  }
  const kf = layer.kf[path];
  if(kf && kf.keys && kf.keys.length){
    return U.evalKeys(kf.keys,t);
  }
  return M.getStaticValue(layer,path);
};

/* 求值整组（用于UI/渲染） */
M.evalGroup=function(layer,group,t,comp){
  const out={};
  for(const g of M.SCHEMA){
    if(g.key!==group) continue;
    for(const p of g.props){ out[p.p]=M.evalProperty(layer,p.p,t,comp); }
  }
  // 顶层单项（如 timeRemap.enabled）
  for(const s of M.SCHEMA){ if(s.p && s.p.split('.')[0]===group) out[s.p]=M.evalProperty(layer,s.p,t,comp); }
  return out;
};

/* ==================== 变换矩阵 ==================== */
M.localMatrix=function(layer,t,comp){
  const p=(pre)=>M.evalProperty(layer,'transform.'+pre,t,comp);
  const pos=p('position'), scl=p('scale'), rot=p('rotation'), rx=p('rotationX'), ry=p('rotationY');
  const anchor=p('anchorPoint');
  const sx=Array.isArray(scl)?scl[0]/100:(scl/100);
  const sy=Array.isArray(scl)?scl[1]/100:(scl/100);
  const sz=Array.isArray(scl)?(scl[2]===undefined?1:scl[2]/100):1;
  let m=U.m4trans(pos[0],pos[1],pos[2]||0);
  m=U.m4mul(U.m4rotY(ry*Math.PI/180),m);
  m=U.m4mul(U.m4rotX(rx*Math.PI/180),m);
  m=U.m4mul(U.m4rotZ(rot*Math.PI/180),m);
  m=U.m4mul(U.m4scale(sx,sy,sz),m);
  m=U.m4mul(U.m4trans(-anchor[0],-anchor[1],-(anchor[2]||0)),m);
  return m;
};
M.worldMatrix=function(layer,t,comp){
  comp=comp||M.layerComp(layer);
  let m=M.localMatrix(layer,t,comp);
  if(layer.parentComp && layer.parentComp!==true){
    // 补偿矩阵
    m=U.m4mul(layer.parentComp,m);
  }
  let p=layer.parent? M.getLayer(layer.parent):null;
  let guard=0;
  while(p && guard++<32){
    m=U.m4mul(M.localMatrix(p,t,comp),m);
    if(p.parentComp) m=U.m4mul(p.parentComp,m);
    p=p.parent? M.getLayer(p.parent):null;
  }
  return m;
};
M.worldOpacity=function(layer,t,comp){
  return M.evalProperty(layer,'transform.opacity',t,comp)/100;
};

/* 重设父级时保持画面 */
M.setParent=function(layer,newParentId){
  const comp=M.layerComp(layer);
  if(!comp) return;
  const t=M.project.currentTime||0;
  const oldP=layer.parent? M.getLayer(layer.parent):null;
  const newP=newParentId? M.getLayer(newParentId):null;
  const W=M.worldMatrix(layer,t,comp);
  const Pnew= newP? M.worldMatrix(newP,t,comp) : U.m4ident();
  // C = Pnew^-1 * W  （使 Pnew*C*M = W）
  const C=U.m4mul(U.m4invert(Pnew),W);
  layer.parentComp=C;
  layer.parent=newParentId;
  M.emit('structure');
};

/* ==================== 关键帧 ==================== */
M.getKeys=function(layer,path){ return (layer.kf[path]&&layer.kf[path].keys)? layer.kf[path].keys : null; };
M.hasKeys=function(layer,path){ const k=M.getKeys(layer,path); return !!(k&&k.length); };

M.addKey=function(layer,path,t,value,ease){
  if(!layer.kf[path]) layer.kf[path]={keys:[]};
  const keys=layer.kf[path].keys;
  const existing=keys.find(k=>Math.abs(k.t-t)<1e-6);
  if(existing){ existing.v=U.deepClone(value); if(ease) Object.assign(existing,ease); return existing; }
  const k={t:t, v:U.deepClone(value)};
  if(ease) Object.assign(k,ease);
  keys.push(k);
  keys.sort((a,b)=>a.t-b.t);
  return k;
};
M.removeKeyAt=function(layer,path,t){
  const keys=M.getKeys(layer,path); if(!keys) return;
  const i=keys.findIndex(k=>Math.abs(k.t-t)<1e-6);
  if(i>=0) keys.splice(i,1);
  if(!keys.length) delete layer.kf[path];
};
M.deleteKeys=function(layer,path,indices){
  const keys=M.getKeys(layer,path); if(!keys) return;
  const set=new Set(indices);
  layer.kf[path].keys=keys.filter((k,i)=>!set.has(i));
  if(!layer.kf[path].keys.length) delete layer.kf[path];
};
/* 修改属性（自动判断是否写关键帧） */
M.setValueAtTime=function(layer,path,t,value,opts={}){
  if(layer.expr&&layer.expr[path]){ return {ok:false,reason:'该属性已启用表达式'}; }
  const keys=M.getKeys(layer,path);
  if(keys&&keys.length){
    const k=M.addKey(layer,path,t,value,opts.ease);
    return {ok:true,key:k};
  }
  M.setStaticValue(layer,path,value);
  return {ok:true};
};

/* ==================== 选择 / 排序 ==================== */
M.select=function(compId,layerIds){
  M.sel.compId=compId;
  M.sel.layerIds=layerIds||[];
  M.emit('selection');
};
M.selectedLayers=function(){
  const c=M.getComp(M.sel.compId);
  if(!c) return [];
  return M.sel.layerIds.map(id=>M.findLayer(c,id)).filter(Boolean);
};
M.currentComp=function(){ return M.getComp(M.sel.compId); };

M.reorderLayer=function(layer,dir){
  const c=M.layerComp(layer); if(!c) return;
  const i=c.layers.indexOf(layer);
  const j=i+dir;
  if(j<0||j>=c.layers.length) return;
  c.layers.splice(i,1); c.layers.splice(j,0,layer);
  M.emit('structure');
};
M.moveLayerToIndex=function(layer,index){
  const c=M.layerComp(layer); if(!c) return;
  const i=c.layers.indexOf(layer);
  c.layers.splice(i,1);
  c.layers.splice(U.clamp(index,0,c.layers.length),0,layer);
  M.emit('structure');
};
M.deleteLayer=function(layer){
  const c=M.layerComp(layer); if(!c) return;
  c.layers=c.layers.filter(l=>l!==layer);
  for(const l of c.layers) if(l.parent===layer.id){ l.parent=null; }
  M.sel.layerIds=M.sel.layerIds.filter(id=>id!==layer.id);
  M.emit('structure'); M.emit('selection');
};
M.duplicateLayer=function(layer,deep){
  const c=M.layerComp(layer); if(!c) return null;
  const copy=U.deepClone(layer);
  copy.id=U.uid('lyr');
  copy.name=layer.name+' 副本';
  copy.parent=null; copy.parentComp=U.m4ident();
  if(deep){ copy.effects=U.deepClone(layer.effects); copy.masks=U.deepClone(layer.masks); }
  c.layers.splice(c.layers.indexOf(layer)+1,0,copy);
  M.sel.layerIds=[copy.id];
  M.emit('structure'); M.emit('selection');
  return copy;
};
M.precompose=function(layers,name){
  const c=M.layerComp(layers[0]); if(!c) return null;
  const minIn=Math.min(...layers.map(l=>l.inPoint));
  const maxOut=Math.max(...layers.map(l=>l.outPoint));
  const sub=M.createComp({name:name||('预合成 '+(M.project.comps.length+1)),width:c.width,height:c.height,fps:c.fps,duration:Math.max(0.1,maxOut-minIn)});
  // 将图层移入子合成，保持世界画面
  const moving=layers.slice();
  for(const l of moving){
    const idx=c.layers.indexOf(l);
    c.layers.splice(idx,1);
    l.startTime=l.inPoint;
    l.inPoint=0; l.outPoint=l.outPoint-minIn;
    sub.layers.unshift(l);
  }
  const pl=M.createLayer(c,'precomp',{name:sub.name,compId:sub.id,inPoint:minIn,outPoint:maxOut});
  pl.precompId=sub.id;
  pl.values['transform'].position=[c.width/2,c.height/2,0];
  M.emit('structure');
  return pl;
};

/* ==================== 工程序列化 ==================== */
M.serialize=function(){
  return JSON.stringify({version:1,project:M.project});
};
M.saveLocal=function(){
  try{ localStorage.setItem('ae_editor_project',M.serialize()); return true; }catch(e){ return false; }
};
M.loadLocal=function(){
  const s=localStorage.getItem('ae_editor_project');
  if(!s) return false;
  try{ M.loadJSON(s); return true; }catch(e){ return false; }
};
M.loadJSON=function(s){
  const o=JSON.parse(s);
  M.project=o.project;
  M.sel={compId:M.project.comps[0]?M.project.comps[0].id:null,layerIds:[]};
  M.history=[]; M.historyIndex=-1;
  M.cache.expr={};
  M.emit('structure'); M.emit('selection'); M.emit('time');
};
M.exportFile=function(){
  const blob=new Blob([M.serialize()],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(M.project.name||'工程')+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};

/* ==================== 撤销 / 重做 ==================== */
/* 提交一次状态（在改动之后调用） */
M.commit=function(label){
  try{
    M.history=M.history.slice(0,M.historyIndex+1);
    M.history.push({label, data:JSON.stringify({project:M.project,sel:M.sel})});
    if(M.history.length>M.MAXHIST) M.history.shift();
    M.historyIndex=M.history.length-1;
    M.emit('history');
  }catch(e){}
};
M.undo=function(){
  if(M.historyIndex<=0) return false;
  M.historyIndex--;
  const o=JSON.parse(M.history[M.historyIndex].data);
  M.project=o.project; M.sel=o.sel;
  M.cache.expr={};
  M.emit('structure'); M.emit('selection'); M.emit('time'); M.emit('history');
  return true;
};
M.redo=function(){
  if(M.historyIndex>=M.history.length-1) return false;
  M.historyIndex++;
  const o=JSON.parse(M.history[M.historyIndex].data);
  M.project=o.project; M.sel=o.sel;
  M.cache.expr={};
  M.emit('structure'); M.emit('selection'); M.emit('time'); M.emit('history');
  return true;
};
M.initHistory=function(){
  M.history=[]; M.historyIndex=-1;
  M.commit('初始');
};

})();
