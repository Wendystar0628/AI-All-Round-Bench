/* 铸帧 ForgeFrame · 可视化节点编辑器 */
"use strict";
(function(){
const FF=window.FF, app=FF.app, Eval=FF.Eval, clamp=FF.util.clamp;
const st={graphId:null,stack:[],pan:{x:40,y:30},zoom:1,sel:new Set(),drag:null,wireDrag:null};
let canvas,cards,wires,palette;

function init(){
  canvas=document.getElementById('nodeCanvas');
  cards=document.getElementById('nodeCards');
  wires=document.getElementById('nodeWires');
  palette=document.getElementById('nodePalette');
  document.getElementById('ndAdd').onclick=e=>{
    palette.classList.toggle('hidden');
    buildPalette();
  };
  document.getElementById('ndGroup').onclick=()=>{
    const g=graph();
    if(!g||st.sel.size<1){ FF.ui.toast('先框选/点选要封装的节点'); return; }
    FF.ui.modal({title:'封装节点组',fields:[{key:'name',label:'组名称',value:'节点组'}],onOk:v=>{
      FF.app.transact('封装节点组',()=>{
        FF.Nodes.encapsulate(app.project,g,[...st.sel],v.name);
      });
      st.sel.clear();
      FF.app.refreshAll();
    }});
  };
  document.getElementById('ndFit').onclick=()=>{ st.pan={x:40,y:30}; st.zoom=1; refresh(); };
  canvas.addEventListener('pointerdown',e=>{
    if(e.target===canvas||e.target===wires){
      if(e.button===0){
        st.drag={type:'pan',x0:e.clientX,y0:e.clientY,p0:{...st.pan}};
        canvas.classList.add('panning');
        canvas.setPointerCapture(e.pointerId);
        if(!e.shiftKey){ st.sel.clear(); refreshSelection(); }
      }
    }
  });
  canvas.addEventListener('pointermove',e=>{
    if(st.drag&&st.drag.type==='pan'){
      st.pan.x=st.drag.p0.x+(e.clientX-st.drag.x0);
      st.pan.y=st.drag.p0.y+(e.clientY-st.drag.y0);
      applyTransform(); drawWires();
    } else if(st.drag&&st.drag.type==='node'){
      const dx=(e.clientX-st.drag.x0)/st.zoom, dy=(e.clientY-st.drag.y0)/st.zoom;
      for(const id of st.drag.ids){
        const n=graph().nodes.find(x=>x.id===id);
        if(n){ n.x=st.drag.orig[id].x+dx; n.y=st.drag.orig[id].y+dy; }
      }
      applyTransform(); drawWires();
    } else if(st.wireDrag){
      st.wireDrag.x=e.clientX; st.wireDrag.y=e.clientY;
      drawWires();
    }
  });
  canvas.addEventListener('pointerup',e=>{
    if(st.drag&&st.drag.type==='node') FF.app.endDrag('移动节点');
    if(st.drag&&st.drag.type==='pan') canvas.classList.remove('panning');
    st.drag=null;
    if(st.wireDrag){
      // 查找目标端口
      const elUnder=document.elementFromPoint(e.clientX,e.clientY);
      if(elUnder&&elUnder.classList.contains('port-dot')&&elUnder.classList.contains('in')){
        const targetNode=elUnder.closest('.node-card').dataset.id;
        const targetPort=elUnder.dataset.port;
        const g=graph();
        const tn=g.nodes.find(n=>n.id===targetNode);
        const srcType=st.wireDrag.type;
        const def=FF.nodeDefs[tn.type];
        let want=def&&def.inputs?def.inputs[targetPort]:null;
        if(tn.type==='group'){ want=groupPortTypes(tn).inputs[targetPort]; }
        if(tn.type==='groupOut'){ want='geo'; }
        if(want&&srcType&&want!==srcType&&!(want==='geo'&&srcType==='geo')){
          FF.ui.toast('端口类型不匹配：'+srcType+' → '+want);
        } else {
          FF.app.transact('连接节点',()=>{
            tn.inputs[targetPort]={node:st.wireDrag.node,port:st.wireDrag.port};
          });
          FF.app.refreshAll();
        }
      } else if(elUnder&&elUnder.classList.contains('port-dot')&&elUnder.classList.contains('out')&&st.wireDrag.fromInput){
        // 从输入拖到输出：反向连接
        const srcNode=elUnder.closest('.node-card').dataset.id;
        const srcPort=elUnder.dataset.port;
        const g=graph();
        const tn=g.nodes.find(n=>n.id===st.wireDrag.node);
        FF.app.transact('连接节点',()=>{ tn.inputs[st.wireDrag.port]={node:srcNode,port:srcPort}; });
        FF.app.refreshAll();
      }
      st.wireDrag=null;
      drawWires();
    }
  });
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const f=e.deltaY<0?1.12:0.9;
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const nz=clamp(st.zoom*f,0.3,2.2);
    st.pan.x=mx-(mx-st.pan.x)*(nz/st.zoom);
    st.pan.y=my-(my-st.pan.y)*(nz/st.zoom);
    st.zoom=nz;
    applyTransform(); drawWires();
  },{passive:false});
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();
    const cardEl=e.target.closest('.node-card');
    if(cardEl){
      const id=cardEl.dataset.id;
      const g=graph();
      const n=g.nodes.find(x=>x.id===id);
      FF.ui.ctxMenu(e.clientX,e.clientY,[
        {label:'复制节点',fn:()=>{
          FF.app.transact('复制节点',()=>{
            const cp=FF.deepClone(n);
            cp.id=FF.util.uid('N'); cp.x+=30; cp.y+=30; cp.inputs={};
            g.nodes.push(cp);
          });
          FF.app.refreshAll();
        }},
        {label:'断开所有输入',fn:()=>{
          FF.app.transact('断开连接',()=>{ n.inputs={}; });
          FF.app.refreshAll();
        }},
        ...(n.type==='group'?[{label:'进入组',fn:()=>enterGroup(n)}]:[]),
        '-',
        {label:'删除节点',fn:()=>{
          FF.app.transact('删除节点',()=>{
            g.nodes=g.nodes.filter(x=>x.id!==id);
            for(const m of g.nodes) for(const k in m.inputs) if(m.inputs[k]&&m.inputs[k].node===id) delete m.inputs[k];
          });
          FF.app.refreshAll();
        },danger:true},
      ]);
    } else {
      buildPalette();
      palette.classList.remove('hidden');
    }
  });
}
function graph(){
  return app.project?FF.findGraph(app.project,st.graphId):null;
}
function open(graphId){
  st.graphId=graphId;
  st.stack=[];
  st.sel.clear();
  const g=graph();
  if(g&&g.view){ st.pan={x:g.view.x||40,y:g.view.y||30}; st.zoom=g.view.zoom||1; }
  refresh();
}
function enterGroup(n){
  const sub=FF.findGraph(app.project,n.params.subGraphId);
  if(!sub) return;
  st.stack.push({graphId:st.graphId,nodeId:n.id});
  st.graphId=sub.id;
  st.pan={x:40,y:30}; st.zoom=1;
  st.sel.clear();
  refresh();
}
function exitGroup(){
  const prev=st.stack.pop();
  if(prev){ st.graphId=prev.graphId; refresh(); }
}
function groupPortTypes(n){
  const sub=FF.findGraph(app.project,n.params.subGraphId);
  const inputs={},outputs={};
  if(sub){
    const gin=sub.nodes.find(x=>x.type==='groupIn');
    const gout=sub.nodes.find(x=>x.type==='groupOut');
    if(gin) Object.assign(inputs,gin.outputs||{});
    if(gout){
      for(const p in gout.inputs){
        const conn=gout.inputs[p];
        const src=sub.nodes.find(x=>x.id===conn.node);
        const def=src&&FF.nodeDefs[src.type];
        outputs[p]=(def&&def.outputs&&def.outputs[conn.port])||'geo';
      }
    }
  }
  return {inputs,outputs};
}
function buildPalette(){
  palette.innerHTML='<div class="np-title">添加节点</div>';
  const groups=[['生成',['rect','ellipse','star','polygon','textGlyph','pathInput']],
    ['处理',['transform','repeater','boolean','trim','merge']],
    ['三维',['extrude','bend']],['场',['fieldGen']]];
  for(const [title,types] of groups){
    palette.appendChild(Object.assign(document.createElement('div'),{className:'np-title',textContent:title}));
    for(const t of types){
      const b=document.createElement('button');
      b.textContent=FF.nodeDefs[t].name;
      b.onclick=()=>{
        const g=graph();
        if(!g){ FF.ui.toast('请先创建节点图'); return; }
        FF.app.transact('添加节点',()=>{
          const rect=canvas.getBoundingClientRect();
          const n=FF.makeNode(t,(rect.width/2-st.pan.x)/st.zoom,(rect.height/2-st.pan.y)/st.zoom);
          g.nodes.push(n);
        });
        palette.classList.add('hidden');
        FF.app.refreshAll();
      };
      palette.appendChild(b);
    }
  }
}
function applyTransform(){
  cards.style.transform='translate('+st.pan.x+'px,'+st.pan.y+'px) scale('+st.zoom+')';
  const g=graph();
  if(g) g.view={x:st.pan.x,y:st.pan.y,zoom:st.zoom};
}
function refresh(){
  const g=graph();
  cards.innerHTML='';
  const crumb=document.getElementById('ndCrumb');
  if(!g){
    crumb.textContent='';
    drawWires();
    return;
  }
  crumb.innerHTML=st.stack.map((s,i)=>{
    const sg=FF.findGraph(app.project,s.graphId);
    return '<span data-i="'+i+'">'+(sg?sg.name:'组')+'</span>';
  }).join(' ▸ ')+'<b>'+g.name+'</b>';
  crumb.querySelectorAll('span').forEach(sp=>{
    sp.onclick=()=>{
      const i=parseInt(sp.dataset.i);
      const entry=st.stack[i];
      if(!entry) return;
      st.stack=st.stack.slice(0,i);
      st.graphId=entry.graphId;
      st.pan={x:40,y:30}; st.zoom=1;
      refresh();
    };
  });
  if(st.stack.length){
    const back=document.createElement('span');
    back.textContent='⤴ 返回上层 ';
    back.style.cursor='pointer';
    back.onclick=exitGroup;
    crumb.prepend(back);
  }
  const ctx=Eval.frame(app.project,app.comp||app.project.comps[0],app.time);
  for(const n of g.nodes){
    cards.appendChild(buildCard(n,g,ctx));
  }
  applyTransform();
  drawWires();
}
function buildCard(n,g,ctx){
  const def=FF.nodeDefs[n.type]||{name:n.type,inputs:{},outputs:{},params:{}};
  const card=document.createElement('div');
  card.className='node-card'+(st.sel.has(n.id)?' sel':'');
  card.dataset.id=n.id;
  card.dataset.kind=def.kind||'geo';
  card.style.left=n.x+'px';
  card.style.top=n.y+'px';
  const head=document.createElement('div');
  head.className='node-card-head';
  head.textContent=(n.type==='group'?(n.params.name||'节点组'):def.name);
  card.appendChild(head);
  const body=document.createElement('div');
  body.className='node-card-body';
  // 端口类型
  let inputs=def.inputs||{}, outputs=def.outputs||{};
  if(n.type==='group'){ const pt=groupPortTypes(n); inputs=pt.inputs; outputs=pt.outputs; }
  if(n.type==='groupIn'){ outputs=n.outputs||{}; }
  for(const p in inputs){
    const row=document.createElement('div');
    row.className='node-port-row in';
    const dot=document.createElement('span');
    dot.className='port-dot in';
    dot.dataset.port=p; dot.dataset.type=inputs[p];
    dot.style.background=FF.PORT_COLORS[inputs[p]]||'#888';
    dot.style.color=FF.PORT_COLORS[inputs[p]]||'#888';
    dot.title=inputs[p];
    row.appendChild(dot);
    row.appendChild(Object.assign(document.createElement('span'),{textContent:p}));
    body.appendChild(row);
    dot.addEventListener('pointerdown',e=>{
      e.stopPropagation(); e.preventDefault();
      if(n.inputs[p]){
        // 断开并拖出
        FF.app.transact('断开连接',()=>{ delete n.inputs[p]; });
        const src=n.inputs;
        FF.app.refreshAll();
      } else {
        st.wireDrag={node:n.id,port:p,fromInput:true,type:inputs[p],x:e.clientX,y:e.clientY};
      }
      canvas.setPointerCapture(e.pointerId);
    });
  }
  // 参数
  for(const k in (def.params||{})){
    if(n.params[k]===undefined) n.params[k]=FF.deepClone(def.params[k]);
    const pv=n.params[k];
    const row=document.createElement('div');
    row.className='node-param';
    const lab=document.createElement('label');
    lab.textContent=k;
    row.appendChild(lab);
    if(k==='op'&&n.type==='boolean'){
      const sel=document.createElement('select');
      for(const [v,name] of [['union','并集'],['subtract','差集'],['intersect','交集']]){
        const o=document.createElement('option'); o.value=v; o.textContent=name;
        if(pv===v) o.selected=true; sel.appendChild(o);
      }
      sel.onchange=()=>{ FF.app.transact('节点参数',()=>{n.params.op=sel.value;}); FF.app.refreshAll(); };
      row.appendChild(sel);
    } else if(k==='fieldType'){
      const sel=document.createElement('select');
      for(const [v,name] of [['falloff','衰减'],['noise','噪声'],['vortex','旋涡']]){
        const o=document.createElement('option'); o.value=v; o.textContent=name;
        if(pv===v) o.selected=true; sel.appendChild(o);
      }
      sel.onchange=()=>{ FF.app.transact('节点参数',()=>{n.params.fieldType=sel.value;}); FF.app.refreshAll(); };
      row.appendChild(sel);
    } else if(k==='axis'){
      const sel=document.createElement('select');
      for(const v of ['x','y']){ const o=document.createElement('option'); o.value=v; o.textContent=v; if(pv===v)o.selected=true; sel.appendChild(o); }
      sel.onchange=()=>{ FF.app.transact('节点参数',()=>{n.params.axis=sel.value;}); FF.app.refreshAll(); };
      row.appendChild(sel);
    } else if(k==='perStroke'){
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!pv;
      cb.onchange=()=>{ FF.app.transact('节点参数',()=>{n.params.perStroke=cb.checked;}); FF.app.refreshAll(); };
      row.appendChild(cb);
    } else if(k==='textLayer'){
      const inp=document.createElement('input');
      inp.value=pv||''; inp.placeholder='文字图层名';
      inp.addEventListener('keydown',e=>e.stopPropagation());
      inp.addEventListener('change',()=>{ FF.app.transact('节点参数',()=>{n.params.textLayer=inp.value;}); FF.app.refreshAll(); });
      row.appendChild(inp);
    } else if(k==='subGraphId'){
      continue;
    } else if(pv&&pv.kind){
      if(pv.kind==='color'){
        const inp=document.createElement('input'); inp.type='color';
        inp.value=FF.color.rgbToHex(pv.value);
        inp.addEventListener('input',()=>{ pv.value=FF.color.hexToRgb(inp.value); FF.app.invalidate(); });
        inp.addEventListener('change',()=>{ FF.app.endDrag('节点颜色'); FF.app.refreshAll(); });
        inp.addEventListener('pointerdown',()=>FF.app.beginDrag());
        row.appendChild(inp);
      } else if(pv.kind==='text'){
        const inp=document.createElement('input');
        inp.value=pv.value;
        inp.addEventListener('keydown',e=>e.stopPropagation());
        inp.addEventListener('change',()=>{ FF.app.transact('节点参数',()=>{pv.value=inp.value;}); FF.app.refreshAll(); });
        row.appendChild(inp);
      } else if(pv.kind==='path'){
        const b=document.createElement('button');
        b.className='mini-btn'; b.textContent='路径…';
        b.onclick=()=>FF.ui.toast('路径节点：在属性面板用钢笔编辑，或连接其它几何');
        row.appendChild(b);
      } else {
        const inp=document.createElement('input');
        const isVec=Array.isArray(pv.value);
        inp.value=isVec?pv.value.join(', '):pv.value;
        inp.addEventListener('keydown',e=>e.stopPropagation());
        inp.addEventListener('change',()=>{
          FF.app.transact('节点参数',()=>{
            if(isVec){ pv.value=inp.value.split(/[,，\s]+/).map(Number).filter(isFinite); while(pv.value.length<(pv.kind==='vec3'?3:2)) pv.value.push(0); }
            else { const v=parseFloat(inp.value); if(isFinite(v)) pv.value=v; }
          });
          FF.app.refreshAll();
        });
        row.appendChild(inp);
      }
      // 秒表（节点参数动画）
      const sw=document.createElement('button');
      sw.className='pb stopwatch'+((pv.keys&&pv.keys.length)?' on':'');
      sw.textContent='⏱'; sw.style.width='16px'; sw.style.height='16px'; sw.style.fontSize='9px';
      sw.title='在当前时间设关键帧';
      sw.onclick=()=>{
        FF.app.transact('节点关键帧',()=>{
          if(pv.keys&&pv.keys.length) pv.keys=[];
          else pv.keys=[FF.K(app.time,FF.cloneVal(pv.value))];
        });
        FF.app.refreshAll();
      };
      row.appendChild(sw);
    } else if(typeof pv==='string'){
      const inp=document.createElement('input');
      inp.value=pv;
      inp.addEventListener('keydown',e=>e.stopPropagation());
      inp.addEventListener('change',()=>{ FF.app.transact('节点参数',()=>{n.params[k]=inp.value;}); FF.app.refreshAll(); });
      row.appendChild(inp);
    } else {
      const inp=document.createElement('input');
      inp.value=pv;
      inp.addEventListener('keydown',e=>e.stopPropagation());
      inp.addEventListener('change',()=>{ FF.app.transact('节点参数',()=>{const v=parseFloat(inp.value); n.params[k]=isFinite(v)?v:inp.value;}); FF.app.refreshAll(); });
      row.appendChild(inp);
    }
    body.appendChild(row);
  }
  for(const p in outputs){
    const row=document.createElement('div');
    row.className='node-port-row out';
    row.appendChild(Object.assign(document.createElement('span'),{textContent:p+' · '+outputs[p]}));
    const dot=document.createElement('span');
    dot.className='port-dot out';
    dot.dataset.port=p; dot.dataset.type=outputs[p];
    dot.style.background=FF.PORT_COLORS[outputs[p]]||'#888';
    dot.style.color=FF.PORT_COLORS[outputs[p]]||'#888';
    row.appendChild(dot);
    body.appendChild(row);
    dot.addEventListener('pointerdown',e=>{
      e.stopPropagation(); e.preventDefault();
      st.wireDrag={node:n.id,port:p,type:outputs[p],x:e.clientX,y:e.clientY};
      canvas.setPointerCapture(e.pointerId);
    });
  }
  // 结果预览
  const res=document.createElement('div');
  res.className='node-result';
  try{
    const r=FF.Nodes.evalNode(ctx,g,n,app.time,new Set());
    let txt='';
    for(const p in r){
      const v=r[p];
      if(v&&v.pos) txt+=p+': 网格 '+v.pos.length/3+' 顶点 / '+v.idx.length/3+' 面';
      else if(v&&v.rings) txt+=p+': '+v.rings.length+' 轮廓 '+v.opens.length+' 开放';
      else if(v&&v.type) txt+=p+': '+v.type+' 场 r='+Math.round(v.radius);
    }
    res.textContent=txt||'（无输出）';
  }catch(e){ res.textContent='⚠ '+e.message; res.style.color='var(--danger)'; }
  body.appendChild(res);
  card.appendChild(body);
  // 拖动
  head.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    if(e.shiftKey){ if(st.sel.has(n.id)) st.sel.delete(n.id); else st.sel.add(n.id); }
    else if(!st.sel.has(n.id)){ st.sel.clear(); st.sel.add(n.id); }
    refreshSelection();
    const orig={};
    for(const id of st.sel){ const m=g.nodes.find(x=>x.id===id); if(m) orig[id]={x:m.x,y:m.y}; }
    st.drag={type:'node',ids:[...st.sel],x0:e.clientX,y0:e.clientY,orig};
    FF.app.beginDrag();
    canvas.setPointerCapture(e.pointerId);
  });
  head.addEventListener('dblclick',e=>{
    e.stopPropagation();
    if(n.type==='group') enterGroup(n);
  });
  card.addEventListener('pointerdown',e=>{
    if(!st.sel.has(n.id)&&!e.target.closest('.port-dot')){
      if(!e.shiftKey) st.sel.clear();
      st.sel.add(n.id);
      refreshSelection();
    }
  });
  return card;
}
function refreshSelection(){
  cards.querySelectorAll('.node-card').forEach(c=>{
    c.classList.toggle('sel',st.sel.has(c.dataset.id));
  });
}
function portPos(nodeId,port,isOut){
  const cardEl=cards.querySelector('.node-card[data-id="'+nodeId+'"]');
  if(!cardEl) return null;
  const dot=cardEl.querySelector('.port-dot.'+(isOut?'out':'in')+'[data-port="'+port+'"]');
  if(!dot) return null;
  const r=dot.getBoundingClientRect();
  const cr=canvas.getBoundingClientRect();
  return {x:r.left+r.width/2-cr.left,y:r.top+r.height/2-cr.top};
}
function drawWires(){
  const g=graph();
  wires.innerHTML='';
  if(!g) return;
  const cr=canvas.getBoundingClientRect();
  wires.setAttribute('width',cr.width);
  wires.setAttribute('height',cr.height);
  const path=(a,b,color)=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    const dx=Math.max(36,Math.abs(b.x-a.x)*0.5);
    p.setAttribute('d','M'+a.x+','+a.y+' C'+(a.x+dx)+','+a.y+' '+(b.x-dx)+','+b.y+' '+b.x+','+b.y);
    p.setAttribute('stroke',color);
    wires.appendChild(p);
    return p;
  };
  for(const n of g.nodes){
    for(const k in n.inputs){
      const conn=n.inputs[k];
      if(!conn) continue;
      const a=portPos(conn.node,conn.port,true);
      const b=portPos(n.id,k,false);
      if(!a||!b) continue;
      const src=g.nodes.find(x=>x.id===conn.node);
      const def=src&&FF.nodeDefs[src.type];
      let type=(def&&def.outputs&&def.outputs[conn.port])||'geo';
      if(src&&src.type==='group') type=groupPortTypes(src).outputs[conn.port]||'geo';
      if(src&&src.type==='groupIn') type=(src.outputs&&src.outputs[conn.port])||'geo';
      const p=path(a,b,FF.PORT_COLORS[type]||'#888');
      p.style.pointerEvents='stroke';
      p.addEventListener('click',e=>{
        e.stopPropagation();
        FF.ui.ctxMenu(e.clientX,e.clientY,[
          {label:'断开连接',fn:()=>{
            FF.app.transact('断开连接',()=>{ delete n.inputs[k]; });
            FF.app.refreshAll();
          },danger:true},
        ]);
      });
    }
  }
  if(st.wireDrag){
    const a=st.wireDrag.fromInput?
      {x:st.wireDrag.x-cr.left,y:st.wireDrag.y-cr.top}:
      portPos(st.wireDrag.node,st.wireDrag.port,true);
    const b=st.wireDrag.fromInput?
      portPos(st.wireDrag.node,st.wireDrag.port,false):
      {x:st.wireDrag.x-cr.left,y:st.wireDrag.y-cr.top};
    if(a&&b){
      const p=path(st.wireDrag.fromInput?b:a,st.wireDrag.fromInput?a:b,'#ffffff');
      p.setAttribute('stroke-dasharray','5,4');
      p.style.opacity='0.7';
    }
  }
}
FF.NodeEditor={init,open,refresh,drawWires,st};
})();
