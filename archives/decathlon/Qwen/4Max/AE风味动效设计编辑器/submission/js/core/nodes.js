/* 铸帧 ForgeFrame · 程序节点系统 */
"use strict";
(function(){
const FF=window.FF, V=FF.V, Path=FF.Path, Eval=FF.Eval, Geo=FF.Geo,
  clamp=FF.util.clamp, DEG=FF.util.DEG, P=FF.P;

const PORT_COLORS={geo:'#ffb347', mesh:'#ff5ad1', scalar:'#4fd2ff', vec:'#9fe84f', color:'#ff5470', field:'#5aa7ff'};
FF.PORT_COLORS=PORT_COLORS;

/* 节点定义：inputs/outputs 端口类型，params 默认值（P=可动画属性） */
const defs={
  rect:{ name:'矩形', kind:'geo', inputs:{}, outputs:{out:'geo'},
    params:{ size:P('vec2',[260,180]), roundness:P('num',12), position:P('vec2',[0,0]) } },
  ellipse:{ name:'椭圆', kind:'geo', inputs:{}, outputs:{out:'geo'},
    params:{ size:P('vec2',[220,220]), position:P('vec2',[0,0]) } },
  star:{ name:'星形', kind:'geo', inputs:{}, outputs:{out:'geo'},
    params:{ points:P('num',5), outer:P('num',140), inner:P('num',60), rotation:P('num',-90) } },
  polygon:{ name:'多边形', kind:'geo', inputs:{}, outputs:{out:'geo'},
    params:{ sides:P('num',6), radius:P('num',130), rotation:P('num',0) } },
  textGlyph:{ name:'文字轮廓', kind:'geo', inputs:{}, outputs:{out:'geo'},
    params:{ textLayer:'源字', text:P('text','火'), perStroke:false, strokeIndex:P('num',0), size:P('num',400) } },
  pathInput:{ name:'路径输入', kind:'geo', inputs:{}, outputs:{out:'geo'},
    params:{ path:P('path',Path.empty()) } },
  transform:{ name:'变换', kind:'geo', inputs:{in:'geo'}, outputs:{out:'geo'},
    params:{ position:P('vec2',[0,0]), rotation:P('num',0), scale:P('vec2',[100,100]), anchor:P('vec2',[0,0]) } },
  repeater:{ name:'重复分布', kind:'geo', inputs:{in:'geo'}, outputs:{out:'geo'},
    params:{ copies:P('num',5), position:P('vec2',[80,0]), rotation:P('num',0), scale:P('vec2',[100,100]) } },
  boolean:{ name:'布尔运算', kind:'geo', inputs:{a:'geo',b:'geo'}, outputs:{out:'geo'},
    params:{ op:'union' } },
  trim:{ name:'修剪', kind:'geo', inputs:{in:'geo'}, outputs:{out:'geo'},
    params:{ start:P('num',0), end:P('num',100), offset:P('num',0) } },
  merge:{ name:'合并', kind:'geo', inputs:{a:'geo',b:'geo'}, outputs:{out:'geo'}, params:{} },
  extrude:{ name:'挤出实体', kind:'mesh', inputs:{in:'geo'}, outputs:{out:'mesh'},
    params:{ depth:P('num',40), bevel:P('num',4) } },
  bend:{ name:'弯曲', kind:'mesh', inputs:{in:'mesh'}, outputs:{out:'mesh'},
    params:{ angle:P('num',30), axis:'x' } },
  fieldGen:{ name:'场生成', kind:'field', inputs:{}, outputs:{out:'field'},
    params:{ fieldType:'vortex', radius:P('num',260), strength:P('num',150), freq:P('num',1.2) } },
  groupIn:{ name:'组输入', kind:'group', inputs:{}, outputs:{}, params:{} },
  groupOut:{ name:'组输出', kind:'group', inputs:{in:'geo'}, params:{} },
  group:{ name:'节点组', kind:'group', inputs:{}, outputs:{}, params:{ subGraphId:null } },
};
FF.nodeDefs=defs;

function paramVal(ctx,node,key,t){
  const p=node.params[key];
  if(p&&p.kind){
    const vl={ id:'N:'+node.id, name:defs[node.type]?defs[node.type].name:node.type };
    vl[key]=p;
    return Eval.prop(ctx,vl,key,t);
  }
  return p;
}
function geoOfRings(rings,opens){ return {rings:rings||[], opens:opens||[]}; }
function pathToGeo(path){
  const g=geoOfRings();
  if(!path||!path.c) return g;
  for(const c of path.c){
    const flat=Path.flatten(c,0.7);
    if(flat.length<4) continue;
    if(c.closed) g.rings.push(flat); else g.opens.push(flat);
  }
  return g;
}
function geoTransform(g,m){
  const out=geoOfRings();
  const tr=(flat,closed)=>{
    const pts=[]; for(let i=0;i<flat.length;i+=2) pts.push([flat[i],flat[i+1],flat[i],flat[i+1],flat[i],flat[i+1]]);
    return Path.flatten(Path.transform({c:[{closed,p:pts}]},m).c[0],0.7);
  };
  for(const r of g.rings) out.rings.push(tr(r,true));
  for(const o of g.opens) out.opens.push(tr(o,false));
  return out;
}

function evalNode(ctx,graph,node,t,visiting,overrideInputs){
  if(visiting.has(node.id)) throw new Error('节点循环连接: '+node.type);
  visiting.add(node.id);
  const ck='ND:'+graph.id+':'+node.id+':'+t.toFixed(5);
  if(ctx.cache.has(ck)){ visiting.delete(node.id); return ctx.cache.get(ck); }
  const def=defs[node.type];
  let result=null;
  const inp=(name)=>{
    if(overrideInputs&&overrideInputs[name]!==undefined) return overrideInputs[name];
    const conn=node.inputs[name];
    if(!conn) return null;
    const src=graph.nodes.find(n=>n.id===conn.node);
    if(!src) return null;
    const r=evalNode(ctx,graph,src,t,visiting);
    return r?r[conn.port]:null;
  };
  const pv=(k)=>paramVal(ctx,node,k,t);
  try{
    switch(node.type){
      case 'rect': {
        const s=pv('size'), r=pv('roundness'), pos=pv('position');
        result={out:pathToGeo(Path.rect(pos[0]-s[0]/2,pos[1]-s[1]/2,s[0],s[1],r))}; break;
      }
      case 'ellipse': {
        const s=pv('size'), pos=pv('position');
        result={out:pathToGeo(Path.ellipse(pos[0],pos[1],s[0]/2,s[1]/2))}; break;
      }
      case 'star': {
        const n=Math.max(3,Math.round(pv('points'))), ro=pv('outer'), ri=pv('inner'), rot=pv('rotation')*DEG;
        result={out:pathToGeo(Path.poly(0,0,ro,n,rot,ri))}; break;
      }
      case 'polygon': {
        const n=Math.max(3,Math.round(pv('sides'))), r=pv('radius'), rot=pv('rotation')*DEG;
        result={out:pathToGeo(Path.poly(0,0,r,n,rot))}; break;
      }
      case 'textGlyph': {
        let text=pv('text')||'火';
        if(node.params.textLayer){
          const src=FF.layerByName(ctx.comp,node.params.textLayer);
          if(src&&src.type==='text') text=Eval.prop(ctx,src,'text.content',t);
        }
        const size=pv('size')||400;
        const chars=[...String(text)];
        const g=geoOfRings();
        if(node.params.perStroke){
          const si=Math.round(pv('strokeIndex')||0);
          const st=FF.glyphs.getChar(chars[0]);
          if(st&&st[si]){
            const outline=FF.glyphs.strokeOutline(st[si],2.0);
            const sc=size/100;
            g.rings.push(Path.flatten(Path.transform({c:[outline]},[sc,0,0,sc,-size/2,-size/2]).c[0],0.7));
          }
        } else {
          let x=0;
          const totalW=chars.reduce((s,c)=>s+FF.glyphs.advance(c),0)*size/100;
          x=-totalW/2;
          for(const ch of chars){
            const cp=FF.glyphs.charPath(ch);
            if(cp){
              const sc=size/100;
              const moved=Path.transform(cp,[sc,0,0,sc,x,-size/2]);
              for(const c of moved.c){
                const flat=Path.flatten(c,0.8);
                if(flat.length>=6) g.rings.push(flat);
              }
            }
            x+=FF.glyphs.advance(ch)*size/100;
          }
        }
        result={out:g}; break;
      }
      case 'pathInput': result={out:pathToGeo(pv('path'))}; break;
      case 'transform': {
        const g=inp('in')||geoOfRings();
        const pos=pv('position'), rot=pv('rotation')*DEG, scl=pv('scale'), anch=pv('anchor');
        const m=Path.affine(pos[0],pos[1],rot,scl[0]/100,scl[1]/100,anch[0],anch[1]);
        result={out:geoTransform(g,m)}; break;
      }
      case 'repeater': {
        const g=inp('in')||geoOfRings();
        const copies=Math.max(1,Math.round(pv('copies')));
        const dp=pv('position'), dr=pv('rotation')*DEG, ds=pv('scale');
        const out=geoOfRings();
        let acc=[1,0,0,1,0,0];
        for(let i=0;i<copies;i++){
          const tg=geoTransform(g,acc);
          out.rings.push(...tg.rings); out.opens.push(...tg.opens);
          const step=Path.affine(dp[0],dp[1],dr,ds[0]/100,ds[1]/100,0,0);
          acc=[ acc[0]*step[0]+acc[2]*step[1], acc[1]*step[0]+acc[3]*step[1],
            acc[0]*step[2]+acc[2]*step[3], acc[1]*step[2]+acc[3]*step[3],
            acc[0]*step[4]+acc[2]*step[5]+acc[4], acc[1]*step[4]+acc[3]*step[5]+acc[5] ];
        }
        result={out}; break;
      }
      case 'boolean': {
        const a=inp('a')||geoOfRings(), b=inp('b')||geoOfRings();
        const rings=FF.poly.boolean(FF.poly.orient(a.rings),FF.poly.orient(b.rings),node.params.op||'union');
        result={out:geoOfRings(rings,[])}; break;
      }
      case 'trim': {
        const g=inp('in')||geoOfRings();
        const s=(pv('start')||0)/100, e=(pv('end')===undefined?100:pv('end'))/100, o=(pv('offset')||0)/360;
        const out=geoOfRings();
        const sn=((s+o)%1+1)%1, en=((e+o)%1+1)%1;
        for(const r of g.rings){ const t2=Path.trimFlat(r,sn,en,true); if(t2.length>=4) out.opens.push(t2); }
        for(const r of g.opens){ const t2=Path.trimFlat(r,sn,en,false); if(t2.length>=4) out.opens.push(t2); }
        result={out}; break;
      }
      case 'merge': {
        const a=inp('a')||geoOfRings(), b=inp('b')||geoOfRings();
        result={out:geoOfRings([...a.rings,...b.rings],[...a.opens,...b.opens])}; break;
      }
      case 'extrude': {
        const g=inp('in')||geoOfRings();
        let depth=pv('depth'), bevel=pv('bevel');
        if(ctx.__geoLayer&&ctx.__geoLayer.geo.useOwnExtrude){
          depth=Eval.prop(ctx,ctx.__geoLayer,'geo.depth',t);
          bevel=Eval.prop(ctx,ctx.__geoLayer,'geo.bevel',t);
        }
        result={out:Geo.extrude(g.rings,depth===undefined?40:depth,bevel===undefined?4:bevel,2)}; break;
      }
      case 'bend': {
        const m=inp('in');
        if(!m){ result={out:null}; break; }
        const ang=pv('angle')||0;
        const bounds=Geo.meshBounds(m);
        const ext=Math.max(bounds.size[0],bounds.size[1],1);
        const out={pos:[],nrm:[],idx:m.idx.slice()};
        for(let i=0;i<m.pos.length;i+=3){
          let v=[m.pos[i],m.pos[i+1],m.pos[i+2]];
          const th=ang*DEG*(v[0]/ext);
          const c=Math.cos(th),s=Math.sin(th);
          const y=v[1]-bounds.center[1], z=v[2];
          out.pos.push(v[0],bounds.center[1]+y*c-z*s,y*s+z*c);
          out.nrm.push(m.nrm[i],m.nrm[i+1],m.nrm[i+2]);
        }
        Geo.recomputeNormals(out);
        result={out}; break;
      }
      case 'fieldGen': {
        result={out:{type:node.params.fieldType||'vortex', radius:pv('radius'), strength:pv('strength'),
          freq:pv('freq'), pos:[0,0,0], dir:[0,0,1]}}; break;
      }
      case 'group': {
        const sub=FF.findGraph(ctx.project,node.params.subGraphId);
        if(!sub){ result={}; break; }
        const gin=sub.nodes.find(n=>n.type==='groupIn');
        const gout=sub.nodes.find(n=>n.type==='groupOut');
        const overrides={};
        if(gin){ for(const port in node.inputs){ overrides[port]=inp(port); } }
        result={};
        if(gout){
          for(const port in gout.inputs){
            const conn=gout.inputs[port];
            const src=sub.nodes.find(n=>n.id===conn.node);
            if(src){ const r=evalNode(ctx,sub,src,t,visiting,overrides); result[port]=r?r[conn.port]:null; }
          }
        }
        break;
      }
      case 'groupIn': {
        result={};
        if(overrideInputs) for(const k in overrideInputs) result[k]=overrideInputs[k];
        break;
      }
      case 'groupOut': {
        result={in:inp('in')}; break;
      }
      default: result={};
    }
  }catch(e){
    ctx.errors.set('node:'+node.id, e.message||String(e));
    result={};
  }
  visiting.delete(node.id);
  ctx.cache.set(ck,result);
  return result;
}

function evaluate(ctx,graph,outputNodeId,t,geoLayer){
  if(!graph||!graph.nodes.length) return null;
  if(geoLayer) ctx.__geoLayer=geoLayer;
  let outNode=outputNodeId?graph.nodes.find(n=>n.id===outputNodeId):null;
  if(!outNode){
    // 自动选择：最后一个有未连接输出的节点
    const connected=new Set();
    for(const n of graph.nodes) for(const k in n.inputs){ const c=n.inputs[k]; if(c) connected.add(c.node); }
    const candidates=graph.nodes.filter(n=>!connected.has(n.id)&&defs[n.type]&&Object.keys(defs[n.type].outputs||{}).length);
    outNode=candidates[candidates.length-1]||graph.nodes[graph.nodes.length-1];
  }
  if(!outNode) return null;
  const res=evalNode(ctx,graph,outNode,t,new Set());
  if(!res) return null;
  for(const k in res){
    const v=res[k];
    if(v&&v.pos&&v.idx) return {mesh:v};
    if(v&&v.rings) return {rings:v.rings, opens:v.opens};
  }
  return null;
}

/* 封装节点组 */
function encapsulate(project,graph,nodeIds,name){
  const sel=graph.nodes.filter(n=>nodeIds.includes(n.id));
  if(!sel.length) return null;
  const sub=FF.makeGraph(name||'节点组');
  const gin={ id:FF.util.uid('N'), type:'groupIn', x:20, y:80, params:{}, inputs:{}, outputs:{} };
  const gout={ id:FF.util.uid('N'), type:'groupOut', x:560, y:80, params:{}, inputs:{} };
  const idMap={};
  for(const n of sel){ const cp=FF.deepClone(n); idMap[n.id]=cp.id; cp.x-=0; sub.nodes.push(cp); }
  // 悬空输入 → 组输入端口；悬空输出 → 组输出
  const selSet=new Set(nodeIds);
  let inIdx=0, outIdx=0;
  const groupInputs={}, groupOutputs={};
  for(const n of sub.nodes){
    for(const k in n.inputs){
      const c=n.inputs[k];
      if(c&&!selSet.has(c.node)){
        const port='in'+(inIdx++);
        gin.outputs[port]=defs[n.type].inputs[k]||'geo';
        groupInputs[port]={node:n.id,port:k,type:gin.outputs[port]};
        n.inputs[k]={node:gin.id,port};
      }
    }
  }
  const consumed=new Set();
  for(const n of graph.nodes){
    if(selSet.has(n.id)) continue;
    for(const k in n.inputs){
      const c=n.inputs[k];
      if(c&&selSet.has(c.node)) consumed.add(c.node+':'+c.port);
    }
  }
  for(const n of sel){
    const def=defs[n.type];
    for(const port in (def.outputs||{})){
      if(consumed.has(n.id+':'+port)){
        const pname='out'+(outIdx++);
        gout.inputs[pname]={node:idMap[n.id],port};
        groupOutputs[pname]={type:def.outputs[port]};
      }
    }
  }
  if(!Object.keys(groupOutputs).length){
    const last=sel[sel.length-1]; const def=defs[last.type];
    const port=Object.keys(def.outputs||{})[0];
    if(port){ gout.inputs['out0']={node:idMap[last.id],port}; groupOutputs['out0']={type:def.outputs[port]}; }
  }
  sub.nodes.unshift(gin); sub.nodes.push(gout);
  project.nodeGraphs.push(sub);
  const groupNode={ id:FF.util.uid('N'), type:'group', x:sel[0].x, y:sel[0].y,
    params:{subGraphId:sub.id, name:name||'节点组'}, inputs:{}, outputs:{} };
  for(const p in groupInputs) groupNode.inputs[p]=null;
  // 重连外部
  for(const n of graph.nodes){
    if(selSet.has(n.id)) continue;
    for(const k in n.inputs){
      const c=n.inputs[k];
      if(c&&selSet.has(c.node)){
        for(const gp in groupOutputs){
          if(groupOutputs[gp]&&gout.inputs[gp]&&gout.inputs[gp].node===idMap[c.node]&&gout.inputs[gp].port===c.port){
            n.inputs[k]={node:groupNode.id,port:gp};
          }
        }
      }
    }
  }
  // 外部 → 组输入
  for(const gp in groupInputs){
    const gi=groupInputs[gp];
    const origNode=sel.find(n=>idMap[n.id]===gi.node);
    for(const n of graph.nodes){
      if(selSet.has(n.id)) continue;
      void n;
    }
    // 查找原本连接到 sel 内部该端口的来源
    const orig=graph.nodes.find(n=>n.id===gi.node);
    void orig;
  }
  graph.nodes=graph.nodes.filter(n=>!selSet.has(n.id));
  graph.nodes.push(groupNode);
  // 修复组输入连线：原外部来源
  for(const gp in groupInputs){
    const gi=groupInputs[gp];
    const origSel=sel.find(n=>idMap[n.id]===gi.node);
    if(origSel&&origSel.inputs[gi.port]){
      groupNode.inputs[gp]=origSel.inputs[gi.port];
    }
  }
  return groupNode;
}
FF.Nodes={defs,evaluate,evalNode,encapsulate,pathToGeo,geoTransform,PORT_COLORS};
})();
