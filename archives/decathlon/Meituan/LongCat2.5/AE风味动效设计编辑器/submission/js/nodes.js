/* nodes.js — 可视化程序节点编辑器 */
(function(){
'use strict';
const N = { sel:[], link:null, drag:null, pan:null, paramNode:null };
window.NodesWidget = N;
const $=s=>document.querySelector(s);

N.DEFS = {
  input_path:{label:'路径输入', color:'#3d6db5', inputs:[], outputs:[{n:'几何',t:'geometry'}],
    params:[{p:'layerId',l:'来源图层',t:'layer'}], eval:(n,ctx)=>{ const g=Composite.sourceGeometry(n.params.layerId,ctx.comp,ctx.t); return g?{contours:g.contours,tris:g.tris}:null; }},
  input_text:{label:'文字输入', color:'#3d6db5', inputs:[], outputs:[{n:'几何',t:'geometry'}],
    params:[{p:'layerId',l:'来源图层',t:'layer'},{p:'text',l:'内容',t:'text'}], eval:(n,ctx)=>{
      const l=Model.getLayer(n.params.layerId);
      if(l&&l.type==='text'){ const lay=Geo.textLayout(l,ctx.t,ctx.comp); return {contours:lay.glyphs.flatMap(g=>g.contours),tris:Geo.triangulateTris(lay.glyphs.flatMap(g=>g.contours))}; }
      return null; }},
  primitive:{label:'基本体', color:'#3d6db5', inputs:[], outputs:[{n:'网格',t:'mesh'}],
    params:[{p:'kind',l:'类型',t:'select',opts:[['box','立方体'],['sphere','球体'],['cylinder','圆柱'],['torus','圆环'],['plane','平面']]},{p:'size',l:'尺寸',t:'num'}],
    eval:(n)=>{ const m=Geo.primitive(n.params.kind||'box',{size:n.params.size||100}); return {mesh:m,contours:[],tris:Geo.meshTris(m)}; }},
  transform:{label:'变换', color:'#4f9cf9', inputs:[{n:'输入',t:'any'}], outputs:[{n:'输出',t:'any'}],
    params:[{p:'translate',l:'位移',t:'vec3'},{p:'rotate',l:'旋转',t:'vec3'},{p:'scale',l:'缩放',t:'vec3'}],
    eval:(n,ctx,inp)=>{
      const v=inp[0]; if(!v) return null;
      const m=U.m4fromTRS(n.params.translate||[0,0,0],(n.params.rotate||[0,0,0]).map(d=>d*Math.PI/180),n.params.scale||[1,1,1]);
      return Geo_xform(v,m);
    }},
  distribute:{label:'分布', color:'#4f9cf9', inputs:[{n:'几何',t:'geometry'}], outputs:[{n:'几何',t:'geometry'}],
    params:[{p:'count',l:'数量',t:'num'},{p:'offset',l:'偏移',t:'vec3'},{p:'rotate',l:'旋转',t:'num'},{p:'scale',l:'缩放',t:'num'}],
    eval:(n,ctx,inp)=>{
      const v=inp[0]; if(!v||!v.contours) return v;
      const count=Math.max(1,n.params.count||2);
      const out=[];
      for(let i=0;i<count;i++){
        const f=count===1?0:i/(count-1);
        const m=U.m4fromTRS([ (n.params.offset[0]||0)*i, (n.params.offset[1]||0)*i, (n.params.offset[2]||0)*i ],
          [0,0,(n.params.rotate||0)*i*Math.PI/180], [1+(n.params.scale||0)/100*i,1+(n.params.scale||0)/100*i,1]);
        for(const c of v.contours) out.push({pts:c.pts.map(p=>{ const q=U.m4mulV(m,[p[0],p[1],0,1]); return [q[0],q[1]]; }),closed:c.closed,hole:c.hole});
      }
      return {contours:out,tris:Geo.triangulateTris(out)};
    }},
  noise:{label:'噪波置换', color:'#4f9cf9', inputs:[{n:'几何',t:'any'}], outputs:[{n:'输出',t:'any'}],
    params:[{p:'strength',l:'强度',t:'num'},{p:'scale',l:'尺度',t:'num'},{p:'seed',l:'种子',t:'num'}],
    eval:(n,ctx,inp)=>{
      const v=inp[0]; if(!v) return null;
      const f=Geo.makeField({type:'noise',position:[0,0,0],radius:1e9,strength:n.params.strength||50,noiseScale:n.params.scale||1,noiseSpeed:0.5});
      return Geo_displace(v,f,ctx.t);
    }},
  vortex:{label:'旋涡', color:'#4f9cf9', inputs:[{n:'几何',t:'any'}], outputs:[{n:'输出',t:'any'}],
    params:[{p:'strength',l:'强度',t:'num'},{p:'radius',l:'半径',t:'num'}],
    eval:(n,ctx,inp)=>{
      const v=inp[0]; if(!v) return null;
      const f=Geo.makeField({type:'vortex',position:n.params.position||[0,0,0],radius:n.params.radius||500,strength:n.params.strength||1,vortexAxis:[0,0,1]});
      return Geo_displace(v,f,ctx.t);
    }},
  extrude:{label:'挤出成体', color:'#4fc08d', inputs:[{n:'几何',t:'geometry'}], outputs:[{n:'网格',t:'mesh'}],
    params:[{p:'depth',l:'深度',t:'num'},{p:'bevel',l:'倒角',t:'num'},{p:'bevelSegments',l:'倒角段',t:'num'}],
    eval:(n,ctx,inp)=>{
      const v=inp[0]; if(!v||!v.contours) return null;
      const mesh=Geo.extrude(v.contours,{depth:n.params.depth||100,bevelEnabled:(n.params.bevel||0)>0,bevelSize:n.params.bevel||0,bevelSegments:n.params.bevelSegments||2});
      return {mesh,contours:v.contours,tris:Geo.meshTris(mesh)};
    }},
  merge:{label:'合并', color:'#4fc08d', inputs:[{n:'A',t:'any'},{n:'B',t:'any'}], outputs:[{n:'输出',t:'any'}],
    eval:(n,ctx,inp)=>{
      const a=inp[0],b=inp[1];
      if(a&&b){ return {contours:(a.contours||[]).concat(b.contours||[]),tris:(a.tris||[]).concat(b.tris||[])}; }
      return a||b;
    }},
  field:{label:'空间场', color:'#ff7a3c', inputs:[], outputs:[{n:'场',t:'field'}],
    params:[{p:'type',l:'类型',t:'select',opts:[['distance','距离衰减'],['noise','噪声'],['vortex','旋涡'],['impact','冲击'],['wind','风']]},
      {p:'position',l:'位置',t:'vec3'},{p:'radius',l:'半径',t:'num'},{p:'strength',l:'强度',t:'num'}],
    eval:(n)=>{ const f=Geo.makeField({type:n.params.type||'distance',position:n.params.position||[0,0,0],radius:n.params.radius||300,strength:n.params.strength||1}); return f; }},
  scalar:{label:'标量', color:'#f2c14e', inputs:[], outputs:[{n:'值',t:'scalar'}], params:[{p:'value',l:'值',t:'num'}], eval:(n)=>n.params.value||0},
  vector:{label:'向量', color:'#f2c14e', inputs:[], outputs:[{n:'向量',t:'vector'}], params:[{p:'value',l:'值',t:'vec3'}], eval:(n)=>n.params.value||[0,0,0]},
  color:{label:'颜色', color:'#f2c14e', inputs:[], outputs:[{n:'颜色',t:'color'}], params:[{p:'value',l:'颜色',t:'color'}], eval:(n)=>n.params.value||[1,1,1]},
  output:{label:'输出', color:'#e05563', inputs:[{n:'结果',t:'any'}], outputs:[], params:[], eval:()=>null},
};
function Geo_xform(v,m){
  if(v.mesh){ const pos=new Float32Array(v.mesh.positions.length); for(let i=0;i<v.mesh.positions.length;i+=3){ const q=U.m4mulV(m,[v.mesh.positions[i],v.mesh.positions[i+1],v.mesh.positions[i+2],1]); pos[i]=q[0];pos[i+1]=q[1];pos[i+2]=q[2]; } const mesh=Object.assign({},v.mesh,{positions:pos}); return {mesh,contours:v.contours,tris:Geo.meshTris(mesh)}; }
  if(v.contours){ const contours=v.contours.map(c=>({pts:c.pts.map(p=>{ const q=U.m4mulV(m,[p[0],p[1],0,1]); return [q[0],q[1]]; }),closed:c.closed,hole:c.hole})); return {contours,tris:Geo.triangulateTris(contours)}; }
  return v;
}
function Geo_displace(v,field,t){
  if(v.mesh){ const pos=Geo.applyFields(v.mesh.positions,[field],t,1); const mesh=Object.assign({},v.mesh,{positions:pos}); return {mesh,contours:v.contours,tris:Geo.meshTris(mesh)}; }
  if(v.contours){ const contours=v.contours.map(c=>({pts:c.pts.map(p=>{ const d=Geo.evalField(field,[p[0],p[1],0],t)||[0,0]; return [p[0]+d[0],p[1]+d[1]]; }),closed:c.closed,hole:c.hole})); return {contours,tris:Geo.triangulateTris(contours)}; }
  return v;
}

/* ==================== 图数据 ==================== */
N.graph=function(comp){ if(!comp.nodeGraph) comp.nodeGraph={nodes:[],links:[]}; return comp.nodeGraph; };
N.addNode=function(comp,type,x,y){
  const g=N.graph(comp);
  const def=N.DEFS[type];
  const node={id:U.uid('node'),type,x:x||80,y:y||80,params:{}, name:def.label};
  for(const p of def.params){ node.params[p.p]=p.def!==undefined?p.def:(p.t==='vec3'?[0,0,0]:(p.t==='color'?[1,1,1]:(p.t==='num'?0:''))); }
  g.nodes.push(node);
  return node;
};
N.removeNode=function(comp,node){
  const g=N.graph(comp);
  g.links=g.links.filter(l=>l.from.node!==node.id&&l.to.node!==node.id);
  g.nodes=g.nodes.filter(n=>n!==node);
  N.sel=N.sel.filter(id=>id!==node.id);
};
N.connect=function(comp,from,to){
  const g=N.graph(comp);
  const f=g.nodes.find(n=>n.id===from.node), t=g.nodes.find(n=>n.id===to.node);
  if(!f||!t) return false;
  const fo=N.DEFS[f.type].outputs[from.port], ti=N.DEFS[t.type].inputs[to.port];
  if(!fo||!ti) return false;
  if(fo.t!==ti.t && fo.t!=='any' && ti.t!=='any'){ N.status('端口类型不匹配：'+fo.t+' → '+ti.t); return false; }
  g.links=g.links.filter(l=>!(l.to.node===to.node&&l.to.port===to.port));
  g.links.push({id:U.uid('lnk'),from:{node:from.node,port:from.port},to:{node:to.node,port:to.port}});
  return true;
};
N.status=function(msg){ $('#node-status').textContent=msg; };

/* ==================== 求值 ==================== */
N.evaluate=function(comp,t){
  const g=N.graph(comp);
  if(!g.nodes.length) return null;
  const values=new Map();
  const visiting=new Set();
  const byId=new Map(g.nodes.map(n=>[n.id,n]));
  function evalNode(n){
    if(values.has(n.id)) return values.get(n.id);
    if(visiting.has(n.id)){ return null; }
    visiting.add(n.id);
    const def=N.DEFS[n.type];
    const inputs=def.inputs?def.inputs.map((p,i)=>{
      const link=g.links.find(l=>l.to.node===n.id&&l.to.port===i);
      if(!link) return null;
      const src=byId.get(link.from.node);
      if(!src) return null;
      const v=evalNode(src);
      if(v==null) return null;
      const out=def.outputs?def.outputs[link.from.port]:null;
      if(Array.isArray(v)) return v[(link.from.port)||0];
      return v;
    }):[];
    visiting.delete(n.id);
    let r=null;
    try{ r=def.eval(n,{comp,t},inputs); }catch(e){ r=null; }
    values.set(n.id,r);
    return r;
  }
  // 输出节点
  const outs=g.nodes.filter(n=>n.type==='output');
  if(outs.length){ evalNode(outs[0]); return values.get(outs[0].id); }
  // 无输出节点：返回最后一个几何节点
  const geoNodes=g.nodes.filter(n=>['extrude','transform','distribute','merge','noise','vortex','input_path','input_text','primitive'].includes(n.type));
  if(geoNodes.length){ const last=geoNodes[geoNodes.length-1]; evalNode(last); return values.get(last.id); }
  return null;
};

/* ==================== UI ==================== */
N.init=function(){
  const cv=$('#node-canvas');
  cv.addEventListener('mousedown',e=>N.mouseDown(e));
  window.addEventListener('mousemove',e=>N.mouseMove(e));
  window.addEventListener('mouseup',()=>{ N.drag=null; N.link=null; });
  cv.addEventListener('dblclick',e=>N.dblClick(e));
  cv.addEventListener('wheel',e=>{ e.preventDefault(); N.panScroll=(N.panScroll||0)+e.deltaY; N.render(); },{passive:false});
  $('#node-add').onclick=()=>N.showAdd();
  $('#node-regroup').onclick=()=>N.regroup();
  $('#node-eval').onclick=()=>{ N.status('求值结果: '+N.describe(N.evaluate(Model.currentComp(),Editor.time||0))); };
};
N.focus=function(){ N.render(); N.fillSelect(); };
N.fillSelect=function(){
  const comp=Model.currentComp();
  const sel=$('#node-geometry-select');
  const cur=sel.value;
  sel.innerHTML='<option value="">（选择几何图层）</option>';
  if(comp) for(const l of comp.layers){
    if(['geometry3d','shape','text'].includes(l.type)){
      const o=document.createElement('option'); o.value=l.id; o.textContent=l.name; sel.appendChild(o);
    }
  }
  sel.value=cur;
  sel.onchange=()=>{ N.status('已选择几何图层: '+sel.value); N.render(); };
};
N.showAdd=function(){
  const comp=Model.currentComp(); if(!comp) return;
  const items=Object.keys(N.DEFS).map(k=>'<div class="form-row"><button class="prop-btn" data-t="'+k+'">'+N.DEFS[k].label+'</button></div>').join('');
  Editor.modal('添加节点',items,(el)=>{
    el.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{
      const cv=$('#node-canvas');
      const r=cv.getBoundingClientRect();
      const node=N.addNode(comp,b.dataset.t,60+Math.random()*120,50+Math.random()*100);
      Editor.closeModal();
      N.sel=[node.id];
      N.render();
      N.showParams(node);
    });
  });
};
N.regroup=function(){
  const comp=Model.currentComp(); if(!comp) return;
  const g=N.graph(comp);
  if(!N.sel.length){ N.status('先选择要封装的节点'); return; }
  // 简单封装：将选中节点放入组节点（保留内部结构）
  const nodes=g.nodes.filter(n=>N.sel.includes(n.id));
  if(nodes.length<1) return;
  const gx=nodes.reduce((a,n)=>a+n.x,0)/nodes.length, gy=nodes.reduce((a,n)=>a+n.y,0)/nodes.length;
  const group={id:U.uid('node'),type:'__group',x:gx-120,y:gy-80,name:'节点组',params:{},nodes,links:g.links.filter(l=>N.sel.includes(l.from.node)&&N.sel.includes(l.to.node))};
  N.DEFS['__group']=N.DEFS['__group']||{label:'节点组',color:'#8a6db5',inputs:[],outputs:[],params:[]};
  g.nodes=g.nodes.filter(n=>!N.sel.includes(n.id));
  g.links=g.links.filter(l=>!(N.sel.includes(l.from.node)&&N.sel.includes(l.to.node)));
  g.nodes.push(group);
  N.sel=[group.id];
  N.status('已封装 '+nodes.length+' 个节点为组');
  N.render();
};
N.describe=function(v){
  if(!v) return '空';
  if(v.mesh) return '网格 '+v.mesh.positions.length/3+' 顶点';
  if(v.contours) return '几何 '+v.contours.length+' 轮廓';
  if(Array.isArray(v)) return '向量 ['+v.map(x=>+x.toFixed(2)).join(',')+']';
  return String(v);
};
N.nodeRect=function(n){
  const def=N.DEFS[n.type]||{label:n.name,inputs:[],outputs:[]};
  const w=150, h=34+Math.max(def.inputs.length,def.outputs.length)*18+ (n.type==='__group'?20:0);
  return {x:n.x-N.panX(), y:n.y-N.panY(), w, h};
};
N.panX=function(){ return N._panX||0; };
N.panY=function(){ return N._panY||0; };
N.mouseDown=function(e){
  const comp=Model.currentComp(); if(!comp) return;
  const cv=$('#node-canvas');
  const r=cv.getBoundingClientRect();
  const x=e.clientX-r.left+N.panX(), y=e.clientY-r.top+N.panY();
  const g=N.graph(comp);
  // 端口
  for(const n of g.nodes){
    const def=N.DEFS[n.type]||{inputs:[],outputs:[]};
    const nr=N.nodeRect(n);
    for(let i=0;i<def.outputs.length;i++){
      const py=nr.y+34+i*18+9;
      if(Math.hypot(x-(nr.x+nr.w),y-py)<8){ N.link={from:{node:n.id,port:i},cur:{x,y}}; return; }
    }
    for(let i=0;i<def.inputs.length;i++){
      const py=nr.y+34+i*18+9;
      if(Math.hypot(x-nr.x,y-py)<8){ N.link={to:{node:n.id,port:i},cur:{x,y}}; return; }
    }
  }
  // 节点
  for(let i=g.nodes.length-1;i>=0;i--){
    const n=g.nodes[i], nr=N.nodeRect(n);
    if(x>=nr.x&&x<=nr.x+nr.w&&y>=nr.y&&y<=nr.y+nr.h){
      if(e.shiftKey){ N.sel=N.sel.includes(n.id)?N.sel.filter(s=>s!==n.id):[...N.sel,n.id]; }
      else if(!N.sel.includes(n.id)) N.sel=[n.id];
      N.drag={node:n,dx:x-n.x,dy:y-n.y};
      N.render();
      N.showParams(n);
      return;
    }
  }
  N.sel=[];
  N.drag={pan:true,sx:e.clientX,sy:e.clientY,px:N.panX(),py:N.panY()};
  N.render();
};
N.mouseMove=function(e){
  const cv=$('#node-canvas');
  const r=cv.getBoundingClientRect();
  const x=e.clientX-r.left+N.panX(), y=e.clientY-r.top+N.panY();
  if(N.link){ N.link.cur={x,y}; N.render(); return; }
  if(!N.drag) return;
  if(N.drag.pan){ N._panX=N.drag.px-(e.clientX-N.drag.sx); N._panY=N.drag.py-(e.clientY-N.drag.sy); N.render(); return; }
  N.drag.node.x=x-N.drag.dx; N.drag.node.y=y-N.drag.dy;
  N.render();
};
N.finishLink=function(e){
  const comp=Model.currentComp(); if(!comp) return;
  const cv=$('#node-canvas');
  const r=cv.getBoundingClientRect();
  const x=e.clientX-r.left+N.panX(), y=e.clientY-r.top+N.panY();
  const g=N.graph(comp);
  for(const n of g.nodes){
    const def=N.DEFS[n.type]||{inputs:[],outputs:[]};
    const nr=N.nodeRect(n);
    if(N.link.from){
      for(let i=0;i<def.inputs.length;i++){
        const py=nr.y+34+i*18+9;
        if(Math.hypot(x-nr.x,y-py)<10){ if(N.connect(comp,N.link.from,{node:n.id,port:i})) N.status('已连接'); N.render(); return; }
      }
    }else if(N.link.to){
      for(let i=0;i<def.outputs.length;i++){
        const py=nr.y+34+i*18+9;
        if(Math.hypot(x-(nr.x+nr.w),y-py)<10){ if(N.connect(comp,{node:n.id,port:i},N.link.to)) N.status('已连接'); N.render(); return; }
      }
    }
  }
};
N.dblClick=function(e){
  const comp=Model.currentComp(); if(!comp) return;
  const cv=$('#node-canvas');
  const r=cv.getBoundingClientRect();
  const x=e.clientX-r.left+N.panX(), y=e.clientY-r.top+N.panY();
  const g=N.graph(comp);
  for(let i=g.nodes.length-1;i>=0;i--){
    const n=g.nodes[i], nr=N.nodeRect(n);
    if(x>=nr.x&&x<=nr.x+nr.w&&y>=nr.y&&y<=nr.y+nr.h){
      if(n.type==='__group'){ N.status('组内节点：'+n.nodes.length+' 个'); }
      else if(N.DEFS[n.type].params.length){ N.showParams(n); }
      return;
    }
  }
};
document.addEventListener('mouseup',e=>{ if(N.link) N.finishLink(e); });

N.showParams=function(node){
  const def=N.DEFS[node.type];
  if(!def||!def.params||!def.params.length){ N.paramNode=null; N.renderParams(); return; }
  N.paramNode=node;
  N.renderParams();
};
N.renderParams=function(){
  const old=document.getElementById('node-params');
  if(old) old.remove();
  if(!N.paramNode) return;
  const def=N.DEFS[N.paramNode.type];
  const div=document.createElement('div');
  div.id='node-params';
  div.style.cssText='position:absolute;right:8px;top:8px;width:200px;background:#22262e;border:1px solid #3a4150;border-radius:6px;padding:8px;z-index:5';
  let html='<div style="font-weight:700;margin-bottom:6px">'+def.label+'</div>';
  for(const p of def.params){
    html+='<div class="prop-row"><div class="prop-label" style="flex:0 0 52px">'+p.l+'</div><div class="prop-val"><div class="prop-num">';
    if(p.t==='num') html+='<input type="text" data-p="'+p.p+'" value="'+(node_param(N.paramNode,p.p)||0)+'">';
    else if(p.t==='vec3'){ for(let i=0;i<3;i++) html+='<input type="text" data-p="'+p.p+'" data-i="'+i+'" value="'+((node_param(N.paramNode,p.p)||[0,0,0])[i]||0)+'" style="width:44px">'; }
    else if(p.t==='color') html+='<input type="color" data-p="'+p.p+'" value="'+U.rgb2hex.apply(null,node_param(N.paramNode,p.p)||[1,1,1])+'">';
    else if(p.t==='select') html+='<select data-p="'+p.p+'">'+p.opts.map(o=>'<option value="'+o[0]+'"'+((node_param(N.paramNode,p.p)===o[0])?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
    else if(p.t==='layer'){
      const comp=Model.currentComp();
      html+='<select data-p="'+p.p+'"><option value="">（无）</option>';
      if(comp) for(const l of comp.layers){ html+='<option value="'+l.id+'"'+(node_param(N.paramNode,p.p)===l.id?' selected':'')+'>'+U.escapeHtml(l.name)+'</option>'; }
      html+='</select>';
    }
    else html+='<input type="text" data-p="'+p.p+'" value="'+(node_param(N.paramNode,p.p)||'')+'">';
    html+='</div></div></div>';
  }
  html+='<div style="margin-top:6px;display:flex;gap:4px"><button class="prop-btn danger" id="np-del">删除节点</button></div>';
  div.innerHTML=html;
  $('#node-canvas-wrap').appendChild(div);
  div.querySelectorAll('[data-p]').forEach(inp=>{
    inp.onchange=()=>{
      const p=def.params.find(x=>x.p===inp.dataset.p);
      const i=inp.dataset.i;
      if(p.t==='num') N.paramNode.params[inp.dataset.p]=parseFloat(inp.value)||0;
      else if(p.t==='vec3'){ const arr=N.paramNode.params[inp.dataset.p]=N.paramNode.params[inp.dataset.p]||[0,0,0]; arr[+i]=parseFloat(inp.value)||0; }
      else if(p.t==='color') N.paramNode.params[inp.dataset.p]=U.hex2rgb(inp.value);
      else N.paramNode.params[inp.dataset.p]=inp.value;
      Model.emit('structure');
    };
    if(inp.tagName==='INPUT'&&inp.type==='text') inp.onkeydown=e=>e.stopPropagation();
  });
  div.querySelector('#np-del').onclick=()=>{ N.removeNode(Model.currentComp(),N.paramNode); N.paramNode=null; N.renderParams(); N.render(); };
};
function node_param(n,p){ return n.params[p]; }

N.render=function(){
  const cv=$('#node-canvas');
  const w=cv.clientWidth,h=cv.clientHeight;
  if(cv.width!==w*R.dpr||cv.height!==h*R.dpr){ cv.width=w*R.dpr; cv.height=h*R.dpr; }
  const c=cv.getContext('2d'); c.setTransform(R.dpr,0,0,R.dpr,0,0);
  c.clearRect(0,0,w,h); c.fillStyle='#14161a'; c.fillRect(0,0,w,h);
  const comp=Model.currentComp();
  if(!comp){ c.fillStyle='#6b7484'; c.fillText('未选择合成',14,24); return; }
  const g=N.graph(comp);
  // 网格
  c.strokeStyle='#1e222a';
  const gs=24, ox=-(N.panX()%gs), oy=-(N.panY()%gs);
  for(let x=ox;x<w;x+=gs){ c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke(); }
  for(let y=oy;y<h;y+=gs){ c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke(); }
  // 连线
  for(const l of g.links){
    const a=g.nodes.find(n=>n.id===l.from.node), b=g.nodes.find(n=>n.id===l.to.node);
    if(!a||!b) continue;
    const da=N.DEFS[a.type]||{outputs:[]}, db=N.DEFS[b.type]||{inputs:[]};
    const na=N.nodeRect(a), nb=N.nodeRect(b);
    const pa={x:na.x+na.w, y:na.y+34+(l.from.port||0)*18+9};
    const pb={x:nb.x, y:nb.y+34+(l.to.port||0)*18+9};
    c.strokeStyle='#4f9cf9'; c.lineWidth=2;
    c.beginPath(); c.moveTo(pa.x,pa.y);
    c.bezierCurveTo(pa.x+50,pa.y,pb.x-50,pb.y,pb.x,pb.y); c.stroke();
  }
  if(N.link&&N.link.cur){
    c.strokeStyle='#f2c14e'; c.setLineDash([4,3]);
    c.beginPath();
    if(N.link.from){ const na=N.nodeRect(g.nodes.find(n=>n.id===N.link.from.node)); c.moveTo(na.x+na.w,na.y+34+N.link.from.port*18+9); }
    else c.moveTo(N.link.cur.x,N.link.cur.y);
    c.lineTo(N.link.cur.x,N.link.cur.y); c.stroke(); c.setLineDash([]);
  }
  // 节点
  for(const n of g.nodes){
    const def=N.DEFS[n.type]||{label:n.name,color:'#666',inputs:[],outputs:[]};
    const nr=N.nodeRect(n);
    const sel=N.sel.includes(n.id);
    c.fillStyle=sel?'#2b3a55':'#22262e';
    c.strokeStyle=sel?'#4f9cf9':'#3a4150';
    c.lineWidth=1;
    roundRect(c,nr.x,nr.y,nr.w,nr.h,6); c.fill(); c.stroke();
    c.fillStyle=def.color; c.fillRect(nr.x,nr.y,nr.w,20);
    c.fillStyle='#fff'; c.font='bold 11px sans-serif';
    c.fillText(def.label||n.name,nr.x+6,nr.y+14);
    let iy=nr.y+34;
    for(const p of def.inputs){ c.fillStyle='#9aa3b2'; c.font='10px sans-serif'; c.fillText(p.n,nr.x+14,iy+9); c.fillStyle='#4f9cf9'; c.beginPath(); c.arc(nr.x,iy+9,4,0,U.TAU); c.fill(); iy+=18; }
    iy=nr.y+34;
    for(const p of def.outputs){ c.fillStyle='#9aa3b2'; c.font='10px sans-serif'; const tw=c.measureText(p.n).width; c.fillText(p.n,nr.x+nr.w-14-tw,iy+9); c.fillStyle='#4fc08d'; c.beginPath(); c.arc(nr.x+nr.w,iy+9,4,0,U.TAU); c.fill(); iy+=18; }
  }
  if(!g.nodes.length){
    c.fillStyle='#6b7484'; c.font='12px sans-serif';
    c.fillText('点击「+ 节点」创建程序几何；结果会驱动几何图层。',20,30);
  }
};
function roundRect(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}

})();
