/* 铸帧 ForgeFrame · 属性面板 */
"use strict";
(function(){
const FF=window.FF, app=FF.app, Eval=FF.Eval, clamp=FF.util.clamp;
const root=()=>document.getElementById('inspector');
let tickRows=[];

function el(tag,cls,html){
  const e=document.createElement(tag);
  if(cls) e.className=cls;
  if(html!==undefined) e.innerHTML=html;
  return e;
}
function section(title,body,extra){
  const s=el('div','insp-section');
  const head=el('div','insp-sec-head','<span class="arrow">▼</span>'+title);
  if(extra){ const ex=el('span','sec-extra'); ex.append(...extra); head.appendChild(ex);
    ex.addEventListener('click',e=>e.stopPropagation()); }
  const b=el('div','insp-sec-body');
  s.appendChild(head); s.appendChild(b);
  head.onclick=()=>s.classList.toggle('closed');
  body(b);
  return s;
}
function currentLayers(){
  if(!app.comp) return [];
  return app.selection.map(id=>FF.findLayer(app.comp,id)).filter(Boolean);
}
function ctxNow(){
  return Eval.frame(app.project,app.comp,app.time);
}
/* ---------- 数值控件（拖动擦值 + 输入） ---------- */
function numInput(getVal,setVal,opts){
  opts=opts||{};
  const inp=el('input','num-input');
  inp.type='text';
  const fmt=v=>(Math.round(v*100)/100).toString();
  inp.value=fmt(getVal());
  let dragging=false, scrubbed=false, sx=0, sv=0;
  inp.addEventListener('pointerdown',e=>{
    if(document.activeElement===inp) return;
    dragging=true; scrubbed=false; sx=e.clientX; sv=getVal();
    inp.setPointerCapture(e.pointerId);
    FF.app.beginDrag();
  });
  inp.addEventListener('pointermove',e=>{
    if(!dragging) return;
    const dx=e.clientX-sx;
    if(Math.abs(dx)>3) scrubbed=true;
    if(scrubbed){
      const step=opts.step||1;
      setVal(sv+dx*step*(e.shiftKey?0.1:1));
      inp.value=fmt(getVal());
      FF.app.invalidate();
    }
  });
  inp.addEventListener('pointerup',e=>{
    if(!dragging) return;
    dragging=false;
    if(scrubbed){ FF.app.endDrag(opts.label||'调整数值'); FF.app.refreshAll(); }
    else { inp.focus(); inp.select(); FF.app.endDrag(); }
  });
  inp.addEventListener('change',()=>{
    const v=parseFloat(inp.value);
    if(isFinite(v)){ FF.app.transact(opts.label||'输入数值',()=>setVal(v)); FF.app.refreshAll(); }
    else inp.value=fmt(getVal());
  });
  inp.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter') inp.blur();
    if(e.key==='ArrowUp'){ e.preventDefault(); FF.app.transact('微调',()=>setVal(getVal()+(e.shiftKey?10:1))); inp.value=fmt(getVal()); FF.app.refreshAll(); }
    if(e.key==='ArrowDown'){ e.preventDefault(); FF.app.transact('微调',()=>setVal(getVal()-(e.shiftKey?10:1))); inp.value=fmt(getVal()); FF.app.refreshAll(); }
  });
  inp._refresh=()=>{ if(document.activeElement!==inp) inp.value=fmt(getVal()); };
  return inp;
}
/* ---------- 属性行 ---------- */
function propRow(layers,path,label,opts){
  opts=opts||{};
  const layer=layers[0];
  const p=FF.getProp(layer,path);
  if(!p) return el('div');
  const row=el('div','prop-row');
  const name=el('div','prop-name'+(p.expr&&p.exprOn?' expr-on':''),label||path.split('.').pop());
  name.title=path;
  const ctrl=el('div','prop-ctrl');
  const btns=el('div','prop-btns');
  const animated=()=>p.keys&&p.keys.length>0;
  const getVal=()=>{
    const ctx=ctxNow();
    return Eval.prop(ctx,layer,path,app.time);
  };
  const setVal=(v)=>{
    for(const l of layers){
      const pp=FF.getProp(l,path);
      if(!pp) continue;
      if(pp.keys&&pp.keys.length) Eval.addOrUpdateKey(pp,app.time,v);
      else pp.value=FF.cloneVal(v);
    }
  };
  // 秒表
  const sw=el('button','pb stopwatch'+(animated()?' on':''),'⏱');
  sw.title='开启动画（在当前时间创建关键帧）';
  sw.onclick=()=>{
    FF.app.transact(animated()?'关闭动画':'开启动画',()=>{
      for(const l of layers){
        const pp=FF.getProp(l,path);
        if(animated()){ pp.keys=[]; }
        else { pp.keys=[FF.K(app.time,getVal(),'bez')]; }
      }
    });
    FF.app.refreshAll();
  };
  btns.appendChild(sw);
  // 表达式
  const ex=el('button','pb expr'+(p.expr&&p.exprOn?' on':''),'fx');
  ex.title='表达式';
  let exprBox=null;
  ex.onclick=()=>{
    if(exprBox){ exprBox.remove(); exprBox=null; return; }
    exprBox=el('div');
    exprBox.style.cssText='width:100%;flex-basis:100%;';
    const ta=el('textarea','expr-editor');
    ta.value=p.expr||defaultExpr(path,p);
    ta.spellcheck=false;
    const status=el('div','expr-ok','');
    const apply=()=>{
      FF.app.transact('编辑表达式',()=>{
        for(const l of layers){
          const pp=FF.getProp(l,path);
          pp.expr=ta.value; pp.exprOn=!!ta.value.trim();
        }
      });
      FF.app.invalidate();
      FF.app.renderFrame();
      const ctx=FF.Compositor.lastResult&&FF.Compositor.lastResult.ctx;
      const err=ctx&&ctx.errors.get(layer.id+':'+path);
      status.className=err?'expr-err':'expr-ok';
      status.textContent=err?('⚠ '+err+'（已退回关键帧值）'):'✓ 表达式生效';
    };
    let tm=null;
    ta.addEventListener('input',()=>{ clearTimeout(tm); tm=setTimeout(apply,400); });
    ta.addEventListener('keydown',e=>e.stopPropagation());
    exprBox.appendChild(ta); exprBox.appendChild(status);
    row.after(exprBox);
    ta.focus();
  };
  btns.appendChild(ex);
  // 关键帧导航
  if(animated()){
    const prev=el('button','pb keynav','◀');
    const add=el('button','pb keynav','◆');
    const next=el('button','pb keynav','▶');
    const hasKey=()=>p.keys.some(k=>Math.abs(k.t-app.time)<1e-4);
    add.style.color=hasKey()?'var(--ember2)':'';
    prev.onclick=()=>{ const ks=[...p.keys].filter(k=>k.t<app.time-1e-4); if(ks.length) FF.app.seekAndSync(ks[ks.length-1].t); };
    next.onclick=()=>{ const ks=p.keys.filter(k=>k.t>app.time+1e-4); if(ks.length) FF.app.seekAndSync(ks[0].t); };
    add.onclick=()=>{
      FF.app.transact('关键帧',()=>{
        if(hasKey()){ for(const l of layers){ const pp=FF.getProp(l,path); pp.keys=pp.keys.filter(k=>Math.abs(k.t-app.time)>1e-4); } }
        else { for(const l of layers){ const pp=FF.getProp(l,path); Eval.addOrUpdateKey(pp,app.time,Eval.prop(ctxNow(),l,path,app.time)); } }
      });
      FF.app.refreshAll();
    };
    btns.append(prev,add,next);
  }
  // 值控件
  const kind=p.kind;
  if(kind==='num'||kind==='angle'){
    const inp=numInput(getVal,setVal,{step:opts.step||1,label:label||path});
    if(p.expr&&p.exprOn) inp.classList.add('expr-val');
    ctrl.appendChild(inp);
    tickRows.push(inp);
  } else if(kind==='vec2'||kind==='vec3'){
    const wrap=el('div','vec-inputs');
    const n=kind==='vec2'?2:3;
    const v=getVal()||[0,0,0];
    for(let i=0;i<n;i++){
      const inp=numInput(()=>(getVal()||[0,0,0])[i]||0,(nv)=>{
        const cur=getVal()||[0,0,0]; const arr=[];
        for(let j=0;j<n;j++) arr.push(j===i?nv:(cur[j]||0));
        setVal(arr);
      },{step:opts.step||1,label:label||path});
      inp.classList.add(['x','y','z'][i]);
      if(p.expr&&p.exprOn) inp.classList.add('expr-val');
      wrap.appendChild(inp);
      tickRows.push(inp);
    }
    ctrl.appendChild(wrap);
  } else if(kind==='color'){
    const sw2=el('div','color-swatch');
    const fill=el('div','cfill');
    const upd=()=>{ const c=getVal()||[1,1,1]; fill.style.background=FF.color.rgbToHex(c); };
    upd();
    sw2.appendChild(fill);
    sw2.onclick=()=>{
      FF.app.beginDrag();
      FF.ui.colorPop(sw2,getVal()||[1,1,1],(c)=>{
        setVal(c); upd(); FF.app.invalidate(); FF.app.renderFrame();
      });
      const closeWatch=setInterval(()=>{
        if(!document.querySelector('.color-pop')){ clearInterval(closeWatch); FF.app.endDrag('调整颜色'); FF.app.refreshAll(); }
      },300);
    };
    ctrl.appendChild(sw2);
    const hex=el('span','',FF.color.rgbToHex(getVal()||[1,1,1]));
    hex.style.cssText='font-family:Consolas,monospace;font-size:10px;color:var(--txt3)';
    ctrl.appendChild(hex);
    tickRows.push({_refresh:()=>{ const c=getVal()||[1,1,1]; fill.style.background=FF.color.rgbToHex(c); hex.textContent=FF.color.rgbToHex(c); }});
  } else if(kind==='text'){
    const inp=el('input','text-input');
    inp.value=getVal();
    inp.addEventListener('keydown',e=>e.stopPropagation());
    inp.addEventListener('change',()=>{
      FF.app.transact('修改文字',()=>setVal(inp.value));
      FF.app.refreshAll();
    });
    ctrl.appendChild(inp);
    tickRows.push({_refresh:()=>{ if(document.activeElement!==inp) inp.value=getVal(); }});
  } else if(kind==='bool'){
    const cb=el('input'); cb.type='checkbox'; cb.checked=!!getVal();
    cb.onchange=()=>{ FF.app.transact('切换',()=>setVal(cb.checked)); FF.app.refreshAll(); };
    ctrl.appendChild(cb);
  } else if(kind==='path'){
    const b=el('button','mini-btn','✎ 画布编辑路径');
    b.onclick=()=>{
      FF.CanvasView.startPathEdit(layer.id,path);
    };
    ctrl.appendChild(b);
    const info=el('span','',(p.keys&&p.keys.length)?(p.keys.length+' 帧'):'');
    info.style.cssText='font-size:10px;color:var(--txt3)';
    ctrl.appendChild(info);
  }
  row.append(name,ctrl,btns);
  return row;
}
function defaultExpr(path,p){
  if(path.includes('position')) return 'value + [wiggle(1, 8)[0] - value[0], 0]';
  return 'wiggle(1, 10)';
}
/* ---------- 通用小控件 ---------- */
function selectRow(label,options,get,set){
  const row=el('div','prop-row');
  row.appendChild(el('div','prop-name',label));
  const sel=el('select','prop-select');
  for(const [v,name] of options){
    const o=el('option','',name); o.value=v; if(String(get())===String(v)) o.selected=true;
    sel.appendChild(o);
  }
  sel.onchange=()=>{ FF.app.transact('修改'+label,()=>set(sel.value)); FF.app.refreshAll(); };
  const ctrl=el('div','prop-ctrl'); ctrl.appendChild(sel);
  row.appendChild(ctrl);
  return row;
}
function checkRow(label,get,set){
  const row=el('div','prop-row');
  row.appendChild(el('div','prop-name',label));
  const cb=el('input'); cb.type='checkbox'; cb.checked=!!get();
  cb.onchange=()=>{ FF.app.transact('切换'+label,()=>set(cb.checked)); FF.app.refreshAll(); };
  const ctrl=el('div','prop-ctrl'); ctrl.appendChild(cb);
  row.appendChild(ctrl);
  return row;
}
function plainNumRow(label,get,set,step){
  const row=el('div','prop-row');
  row.appendChild(el('div','prop-name',label));
  const ctrl=el('div','prop-ctrl');
  const inp=numInput(get,(v)=>{ FF.app.transact(label,()=>set(v)); FF.app.invalidate(); },{step:step||1,label});
  ctrl.appendChild(inp);
  row.appendChild(ctrl);
  return row;
}
function itemCard(title,bodyFn,opts){
  opts=opts||{};
  const card=el('div','item-card');
  const head=el('div','item-card-head');
  const grow=el('span','grow',title);
  head.appendChild(grow);
  if(opts.onUp){ const b=el('button','pb','↑'); b.onclick=e=>{e.stopPropagation();opts.onUp();}; head.appendChild(b); }
  if(opts.onDown){ const b=el('button','pb','↓'); b.onclick=e=>{e.stopPropagation();opts.onDown();}; head.appendChild(b); }
  if(opts.onDel){ const b=el('button','pb','✕'); b.style.color='var(--danger)'; b.onclick=e=>{e.stopPropagation();opts.onDel();}; head.appendChild(b); }
  const body=el('div','item-card-body');
  card.appendChild(head); card.appendChild(body);
  head.onclick=()=>body.classList.toggle('hidden');
  bodyFn(body);
  if(opts.closed) body.classList.add('hidden');
  return card;
}
/* ---------- 各类型区块 ---------- */
function transformSection(layers){
  const l=layers[0];
  return section('变换',b=>{
    b.appendChild(propRow(layers,'transform.anchor','锚点'));
    b.appendChild(propRow(layers,'transform.position','位置'));
    b.appendChild(propRow(layers,'transform.scale','缩放'));
    if(l.threeD){
      b.appendChild(propRow(layers,'transform.rotationX','X 旋转'));
      b.appendChild(propRow(layers,'transform.rotationY','Y 旋转'));
      b.appendChild(propRow(layers,'transform.rotationZ','Z 旋转'));
    } else {
      b.appendChild(propRow(layers,'transform.rotation','旋转'));
    }
    b.appendChild(propRow(layers,'transform.opacity','不透明度'));
  });
}
function shapeSection(layers){
  const l=layers[0];
  const addBtn=el('button','mini-btn','＋内容');
  addBtn.onclick=e=>{
    FF.ui.ctxMenu(e.clientX,e.clientY,[
      {label:'矩形',fn:()=>{FF.app.transact('添加矩形',()=>l.shapes.push(FF.makeShapeItem('rect')));FF.app.refreshAll();}},
      {label:'椭圆',fn:()=>{FF.app.transact('添加椭圆',()=>l.shapes.push(FF.makeShapeItem('ellipse')));FF.app.refreshAll();}},
      {label:'贝塞尔路径',fn:()=>{const it=FF.makeShapeItem('path');FF.app.transact('添加路径',()=>l.shapes.push(it));FF.app.refreshAll();FF.CanvasView.startPathEdit(l.id,'shapes.'+(l.shapes.length-1)+'.path');}},
      {label:'笔画引用（文字笔画）',fn:()=>{FF.app.transact('添加笔画',()=>{const it=FF.makeShapeItem('strokeRef');const txt=app.comp.layers.find(x=>x.type==='text');it.sourceLayer=txt?txt.name:'';l.shapes.push(it);});FF.app.refreshAll();}},
      '-',
      {label:'修剪路径',fn:()=>{FF.app.transact('添加修剪',()=>l.shapes.push(FF.makeModifier('trim')));FF.app.refreshAll();}},
      {label:'重复器',fn:()=>{FF.app.transact('添加重复器',()=>l.shapes.push(FF.makeModifier('repeater')));FF.app.refreshAll();}},
      {label:'布尔运算',fn:()=>{FF.app.transact('添加布尔',()=>l.shapes.push(FF.makeModifier('boolean')));FF.app.refreshAll();}},
    ]);
  };
  return section('形状内容',b=>{
    const names={rect:'▭ 矩形',ellipse:'◯ 椭圆',path:'✒ 路径',strokeRef:'〰 笔画',trim:'✂ 修剪路径',repeater:'⧉ 重复器',boolean:'⊕ 布尔'};
    l.shapes.forEach((item,idx)=>{
      b.appendChild(itemCard(names[item.kind]||item.kind,body=>{
        const base='shapes.'+idx+'.';
        if(item.kind==='rect'||item.kind==='ellipse'){
          body.appendChild(propRow(layers,base+'size','大小'));
          if(item.kind==='rect') body.appendChild(propRow(layers,base+'roundness','圆角'));
          body.appendChild(propRow(layers,base+'position','偏移'));
        } else if(item.kind==='path'){
          body.appendChild(propRow(layers,base+'path','路径'));
        } else if(item.kind==='strokeRef'){
          body.appendChild(selectRow('来源文字',app.comp.layers.filter(x=>x.type==='text').map(x=>[x.name,x.name]),
            ()=>item.sourceLayer,v=>{item.sourceLayer=v;}));
          body.appendChild(plainNumRow('笔画序号',()=>item.strokeIndex,v=>{item.strokeIndex=Math.max(0,Math.round(v));}));
          body.appendChild(propRow(layers,base+'write','书写进度'));
        } else if(item.kind==='trim'){
          body.appendChild(propRow(layers,base+'start','起点 %'));
          body.appendChild(propRow(layers,base+'end','终点 %'));
          body.appendChild(propRow(layers,base+'offset','偏移°'));
        } else if(item.kind==='repeater'){
          body.appendChild(propRow(layers,base+'copies','副本数'));
          body.appendChild(propRow(layers,base+'position','位移'));
          body.appendChild(propRow(layers,base+'rotation','旋转'));
          body.appendChild(propRow(layers,base+'scale','缩放'));
          body.appendChild(propRow(layers,base+'fade','末端透明'));
        } else if(item.kind==='boolean'){
          body.appendChild(selectRow('运算', [['union','并集'],['subtract','差集'],['intersect','交集']],
            ()=>item.op,v=>{item.op=v;}));
          const srcs=l.shapes.filter(x=>['rect','ellipse','path','strokeRef'].includes(x.kind));
          body.appendChild(selectRow('操作对象',srcs.map(x=>[x.id,x.name]),
            ()=>item.source||(srcs[srcs.length-1]&&srcs[srcs.length-1].id),v=>{item.source=v;}));
        }
        if(['rect','ellipse','path','strokeRef'].includes(item.kind)){
          body.appendChild(checkRow('填充',()=>item.fill.enabled,v=>{item.fill.enabled=v;}));
          if(item.fill.enabled) body.appendChild(propRow(layers,base+'fill.color','填充色'));
          body.appendChild(checkRow('描边',()=>item.stroke.enabled,v=>{item.stroke.enabled=v;}));
          if(item.stroke.enabled){
            body.appendChild(propRow(layers,base+'stroke.color','描边色'));
            body.appendChild(propRow(layers,base+'stroke.width','描边宽'));
          }
        }
      },{
        closed:idx>1,
        onUp:idx>0?()=>{FF.app.transact('调整顺序',()=>{[l.shapes[idx-1],l.shapes[idx]]=[l.shapes[idx],l.shapes[idx-1]];});FF.app.refreshAll();}:null,
        onDown:idx<l.shapes.length-1?()=>{FF.app.transact('调整顺序',()=>{[l.shapes[idx+1],l.shapes[idx]]=[l.shapes[idx],l.shapes[idx+1]];});FF.app.refreshAll();}:null,
        onDel:()=>{FF.app.transact('删除内容',()=>l.shapes.splice(idx,1));FF.app.refreshAll();}
      }));
    });
    if(!l.shapes.length) b.appendChild(el('div','insp-note','空形状图层。点击右上「＋内容」添加图形或操作。'));
  },[addBtn]);
}
function textSection(layers){
  const l=layers[0];
  const addAnim=el('button','mini-btn','＋动画器');
  addAnim.onclick=()=>{
    FF.app.transact('添加动画器',()=>{
      l.text.animators.push({name:'动画器 '+(l.text.animators.length+1),
        range:{unit:'char',start:FF.P('num',0),end:FF.P('num',100),offset:FF.P('num',0),softness:FF.P('num',20)},
        props:{position:FF.P('vec2',[0,60]),opacity:FF.P('num',0)}});
    });
    FF.app.refreshAll();
  };
  return section('文字',b=>{
    b.appendChild(propRow(layers,'text.content','内容'));
    b.appendChild(propRow(layers,'text.fontSize','字号'));
    b.appendChild(propRow(layers,'text.lineHeight','行距'));
    b.appendChild(propRow(layers,'text.tracking','字距'));
    b.appendChild(selectRow('对齐',[['left','左'],['center','居中'],['right','右']],()=>l.text.align,v=>{l.text.align=v;}));
    b.appendChild(propRow(layers,'text.fill','颜色'));
    b.appendChild(el('div','insp-note',FF.glyphs.rangeDesc));
    l.text.animators.forEach((a,ai)=>{
      const base='text.animators.'+ai+'.';
      b.appendChild(itemCard('动画器 · '+a.name,body=>{
        body.appendChild(selectRow('单位',[['char','字符'],['word','词'],['line','行']],()=>a.range.unit,v=>{a.range.unit=v;}));
        body.appendChild(propRow(layers,base+'range.start','起点 %'));
        body.appendChild(propRow(layers,base+'range.end','终点 %'));
        body.appendChild(propRow(layers,base+'range.offset','偏移 %'));
        body.appendChild(propRow(layers,base+'range.softness','软边 %'));
        const toggles=el('div','','');
        for(const [k,label,def] of [['position','位置',[0,60]],['rotation','旋转',25],['scale','缩放',[60,60]],['opacity','不透明度',0]]){
          const has=!!a.props[k];
          const chip=el('span','chip'+(has?' on':''),label);
          chip.onclick=()=>{
            FF.app.transact('动画器属性',()=>{
              if(a.props[k]) delete a.props[k];
              else a.props[k]=FF.P(k==='position'||k==='scale'?'vec2':'num',def);
            });
            FF.app.refreshAll();
          };
          toggles.appendChild(chip);
        }
        body.appendChild(toggles);
        for(const k in a.props){
          const label={position:'位置偏移',rotation:'旋转',scale:'缩放',opacity:'不透明度'}[k];
          body.appendChild(propRow(layers,base+'props.'+k,label));
        }
      },{closed:true,onDel:()=>{FF.app.transact('删除动画器',()=>l.text.animators.splice(ai,1));FF.app.refreshAll();}}));
    });
  },[addAnim]);
}
function geoSection(layers){
  const l=layers[0];
  const addPin=el('button','mini-btn','＋图钉');
  addPin.onclick=()=>{
    FF.app.transact('添加图钉',()=>{
      l.geo.pins.push({base:[0,0,0],pos:FF.P('vec3',[0,0,0]),rotation:FF.P('num',0),scale:FF.P('num',100),radius:150,enabled:true});
    });
    FF.app.refreshAll();
  };
  return section('三维几何',b=>{
    const graphs=app.project.nodeGraphs.map(g=>[g.id,g.name]);
    b.appendChild(selectRow('节点图',graphs,()=>l.geo.graphId,v=>{l.geo.graphId=v;l.geo.outputNode=null;}));
    const g=FF.findGraph(app.project,l.geo.graphId);
    if(g){
      const outs=g.nodes.filter(n=>FF.nodeDefs[n.type]&&Object.keys(FF.nodeDefs[n.type].outputs||{}).length);
      b.appendChild(selectRow('输出节点',outs.map(n=>[n.id,(FF.nodeDefs[n.type].name)+' #'+n.id.slice(-4)]),
        ()=>l.geo.outputNode||'(自动)',v=>{l.geo.outputNode=v==='(自动)'?null:v;}));
    }
    b.appendChild(checkRow('使用图层挤出参数',()=>l.geo.useOwnExtrude,v=>{l.geo.useOwnExtrude=v;}));
    b.appendChild(propRow(layers,'geo.depth','挤出深度'));
    b.appendChild(propRow(layers,'geo.bevel','倒角'));
    b.appendChild(propRow(layers,'geo.bend','弯曲'));
    b.appendChild(selectRow('弯曲轴',[['x','X'],['y','Y']],()=>l.geo.bendAxis,v=>{l.geo.bendAxis=v;}));
    b.appendChild(propRow(layers,'geo.twist','扭转'));
    b.appendChild(checkRow('投射阴影',()=>l.geo.castShadow,v=>{l.geo.castShadow=v;}));
    b.appendChild(checkRow('接收阴影',()=>l.geo.receiveShadow,v=>{l.geo.receiveShadow=v;}));
    b.appendChild(checkRow('参与粒子碰撞',()=>l.geo.collide,v=>{l.geo.collide=v;}));
    b.appendChild(el('div','insp-note','图钉：用工具栏 📌 在画布点击几何添加，或点「＋图钉」。场：下方添加场引用。'));
    l.geo.pins.forEach((p,pi)=>{
      const base='geo.pins.'+pi+'.';
      b.appendChild(itemCard('图钉 '+(pi+1)+' @ '+p.base.map(v=>Math.round(v)).join(','),body=>{
        body.appendChild(propRow(layers,base+'pos','位置'));
        body.appendChild(propRow(layers,base+'rotation','旋转'));
        body.appendChild(propRow(layers,base+'scale','缩放'));
        body.appendChild(plainNumRow('影响半径',()=>p.radius,v=>{p.radius=Math.max(10,v);}));
      },{closed:true,onDel:()=>{FF.app.transact('删除图钉',()=>l.geo.pins.splice(pi,1));FF.app.refreshAll();}}));
    });
    const addField=el('button','mini-btn','＋场引用');
    addField.onclick=()=>{
      const fl=app.comp.layers.find(x=>x.type==='field');
      if(!fl){ FF.ui.toast('请先创建空间场图层'); return; }
      FF.app.transact('添加场引用',()=>l.geo.fields.push({layerId:fl.id,strength:FF.P('num',1)}));
      FF.app.refreshAll();
    };
    b.appendChild(addField);
    l.geo.fields.forEach((f,fi)=>{
      const fl=FF.findLayer(app.comp,f.layerId);
      b.appendChild(itemCard('场 → '+(fl?fl.name:'?'),body=>{
        body.appendChild(propRow(layers,'geo.fields.'+fi+'.strength','强度'));
      },{closed:true,onDel:()=>{FF.app.transact('移除场',()=>l.geo.fields.splice(fi,1));FF.app.refreshAll();}}));
    });
  },[addPin]);
}
function materialSection(layers){
  return section('材质',b=>{
    b.appendChild(propRow(layers,'geo.material.baseColor','基础色'));
    b.appendChild(propRow(layers,'geo.material.metallic','金属度'));
    b.appendChild(propRow(layers,'geo.material.roughness','粗糙度'));
    b.appendChild(propRow(layers,'geo.material.emissive','发光色'));
    b.appendChild(propRow(layers,'geo.material.emissiveStrength','发光强度'));
    b.appendChild(propRow(layers,'geo.material.opacity','不透明度'));
  });
}
function particlesSection(layers){
  const l=layers[0];
  const P=l.particles;
  const addEm=el('button','mini-btn','＋发射器');
  addEm.onclick=()=>{
    FF.app.transact('添加发射器',()=>{
      P.emitters.push({kind:'point',rate:FF.P('num',60),speed:FF.P('num',220),life:FF.P('num',1.4),
        spread:35,direction:[0,-1,0],offset:[0,0,0],bursts:[]});
    });
    FF.app.refreshAll();
  };
  return section('粒子系统',b=>{
    b.appendChild(plainNumRow('随机种子',()=>P.seed,v=>{P.seed=Math.round(v);}));
    b.appendChild(propRow(layers,'particles.gravity','重力'));
    b.appendChild(propRow(layers,'particles.wind','风力'));
    b.appendChild(propRow(layers,'particles.drag','阻力'));
    b.appendChild(propRow(layers,'particles.sizeStart','初大小'));
    b.appendChild(propRow(layers,'particles.sizeEnd','末大小'));
    b.appendChild(propRow(layers,'particles.opacityStart','初透明'));
    b.appendChild(propRow(layers,'particles.opacityEnd','末透明'));
    b.appendChild(checkRow('相加混合',()=>P.additive,v=>{P.additive=v;}));
    // 颜色渐变
    const grad=el('div','prop-row');
    grad.appendChild(el('div','prop-name','寿命颜色'));
    const gctrl=el('div','prop-ctrl');
    const bar=el('div');
    bar.style.cssText='flex:1;height:16px;border-radius:4px;border:1px solid var(--line2);cursor:pointer;background:linear-gradient(90deg,'+
      P.colorStops.map(s=>FF.color.rgbToHex(s[1])+' '+(s[0]*100)+'%').join(',')+')';
    bar.title='点击编辑色标';
    bar.onclick=()=>{
      FF.ui.modal({title:'寿命颜色（JSON 色标）',fields:[{key:'v',label:'[t, [r,g,b]]',value:JSON.stringify(P.colorStops)}],
        onOk:v=>{ try{ const arr=JSON.parse(v.v); FF.app.transact('修改色标',()=>{P.colorStops=arr;}); FF.app.refreshAll(); }catch(e){ FF.ui.toast('JSON 格式错误'); } }});
    };
    gctrl.appendChild(bar); grad.appendChild(gctrl);
    b.appendChild(grad);
    P.emitters.forEach((em,ei)=>{
      const base='particles.emitters.'+ei+'.';
      b.appendChild(itemCard('发射器 '+(ei+1)+' · '+({point:'点',curve:'曲线',surface:'表面'}[em.kind]||em.kind),body=>{
        body.appendChild(selectRow('类型',[['point','点'],['curve','曲线'],['surface','几何表面']],()=>em.kind,v=>{em.kind=v;}));
        const srcs=app.comp.layers.filter(x=>['shape','text','geo','null'].includes(x.type)).map(x=>[x.name,x.name]);
        body.appendChild(selectRow('来源图层',[['','（自身）'],...srcs],()=>em.sourceLayer||'',v=>{em.sourceLayer=v||null;}));
        body.appendChild(propRow(layers,base+'rate','速率 /秒'));
        body.appendChild(propRow(layers,base+'speed','初速度'));
        body.appendChild(propRow(layers,base+'life','寿命'));
        body.appendChild(plainNumRow('散布角°',()=>em.spread===undefined?35:em.spread,v=>{em.spread=v;}));
        body.appendChild(checkRow('启用',()=>em.enabled!==false,v=>{em.enabled=v;}));
        body.appendChild(el('div','insp-note','爆发事件（锤击火星等）：'));
        (em.bursts||[]).forEach((bu,bi)=>{
          const row=el('div','prop-row');
          row.style.flexWrap='wrap';
          const mk=(label,get,set,w)=>{
            const inp=numInput(get,v=>{FF.app.transact('爆发参数',()=>set(v));FF.app.invalidate();},{step:label==='t'?0.05:10,label});
            inp.style.width=(w||52)+'px'; inp.style.flex='none';
            inp.title=label;
            return inp;
          };
          row.appendChild(el('span','', 't'));
          row.appendChild(mk('t',()=>bu.t,v=>{bu.t=v;},56));
          row.appendChild(el('span','', '数量'));
          row.appendChild(mk('count',()=>bu.count,v=>{bu.count=Math.round(v);},56));
          row.appendChild(el('span','', '速度'));
          row.appendChild(mk('speed',()=>bu.speed,v=>{bu.speed=v;},60));
          const del=el('button','pb','✕');
          del.onclick=()=>{FF.app.transact('删除爆发',()=>em.bursts.splice(bi,1));FF.app.refreshAll();};
          row.appendChild(del);
          body.appendChild(row);
          const pos=el('div','prop-row');
          pos.appendChild(el('div','prop-name','位置'));
          const pc=el('div','prop-ctrl vec-inputs');
          for(let i=0;i<3;i++){
            const inp=numInput(()=>bu.pos?bu.pos[i]:0,v=>{FF.app.transact('爆发位置',()=>{bu.pos=bu.pos||[0,0,0];bu.pos[i]=v;});FF.app.invalidate();},{step:5,label:'位置'});
            inp.classList.add(['x','y','z'][i]);
            pc.appendChild(inp);
          }
          pos.appendChild(pc);
          body.appendChild(pos);
        });
        const addB=el('button','mini-btn','＋爆发');
        addB.onclick=()=>{FF.app.transact('添加爆发',()=>{em.bursts=em.bursts||[];em.bursts.push({t:app.time,count:80,speed:380,pos:[0,0,0],spread:0.55,life:1.1});});FF.app.refreshAll();};
        body.appendChild(addB);
      },{closed:ei>0,onDel:()=>{FF.app.transact('删除发射器',()=>P.emitters.splice(ei,1));FF.app.refreshAll();}}));
    });
    // 碰撞
    b.appendChild(el('div','insp-note','碰撞对象（三维几何/形状）：'));
    for(const cl of app.comp.layers.filter(x=>['geo','shape','text'].includes(x.type))){
      const on=P.collideWith.includes(cl.id);
      const chip=el('span','chip'+(on?' on':''),cl.name);
      chip.onclick=()=>{
        FF.app.transact('碰撞设置',()=>{
          if(on) P.collideWith=P.collideWith.filter(id=>id!==cl.id);
          else P.collideWith.push(cl.id);
        });
        FF.app.refreshAll();
      };
      b.appendChild(chip);
    }
    b.appendChild(propRow(layers,'particles.restitution','弹性'));
    b.appendChild(propRow(layers,'particles.friction','摩擦'));
    b.appendChild(propRow(layers,'particles.hitLifeLoss','碰撞寿命损失'));
    b.appendChild(propRow(layers,'particles.secondary','次级发射数'));
    // 场
    b.appendChild(el('div','insp-note','力场引用：'));
    for(const fl of app.comp.layers.filter(x=>x.type==='field')){
      const on=P.fields.some(f=>f.layerId===fl.id);
      const chip=el('span','chip'+(on?' on':''),fl.name);
      chip.onclick=()=>{
        FF.app.transact('粒子力场',()=>{
          if(on) P.fields=P.fields.filter(f=>f.layerId!==fl.id);
          else P.fields.push({layerId:fl.id,strength:FF.P('num',1)});
        });
        FF.app.refreshAll();
      };
      b.appendChild(chip);
    }
    // 拖尾
    b.appendChild(checkRow('拖尾',()=>P.trails.enabled,v=>{P.trails.enabled=v;}));
    if(P.trails.enabled){
      b.appendChild(propRow(layers,'particles.trails.length','拖尾长度'));
      b.appendChild(propRow(layers,'particles.trails.width','拖尾宽度'));
      b.appendChild(propRow(layers,'particles.trails.fade','消退'));
      b.appendChild(propRow(layers,'particles.trails.color','拖尾颜色'));
    }
  },[addEm]);
}
function cameraSection(layers){
  return section('摄像机',b=>{
    b.appendChild(propRow(layers,'camera.fov','视角'));
    b.appendChild(propRow(layers,'camera.target','目标点'));
    b.appendChild(propRow(layers,'camera.focusDistance','对焦距离'));
    b.appendChild(propRow(layers,'camera.aperture','光圈'));
  });
}
function lightSection(layers){
  const l=layers[0];
  return section('灯光',b=>{
    b.appendChild(selectRow('类型',[['point','点光源'],['parallel','平行光']],()=>l.light.lightType,v=>{l.light.lightType=v;}));
    b.appendChild(propRow(layers,'light.color','颜色'));
    b.appendChild(propRow(layers,'light.intensity','强度'));
    b.appendChild(propRow(layers,'light.target','目标'));
    b.appendChild(checkRow('投射阴影',()=>l.light.castsShadow,v=>{l.light.castsShadow=v;}));
  });
}
function fieldSection(layers){
  const l=layers[0];
  return section('空间场',b=>{
    b.appendChild(selectRow('类型',[['falloff','距离衰减'],['noise','噪声'],['vortex','旋涡']],()=>l.field.fieldType,v=>{l.field.fieldType=v;}));
    b.appendChild(propRow(layers,'field.radius','半径'));
    b.appendChild(propRow(layers,'field.strength','强度'));
    b.appendChild(propRow(layers,'field.freq','噪声频率'));
    b.appendChild(propRow(layers,'field.direction','方向'));
    b.appendChild(el('div','insp-note','同一场可同时驱动几何顶点与粒子运动。画布中显示影响范围。'));
  });
}
function audioSection(layers){
  const l=layers[0];
  const a=l.audio;
  const addEv=el('button','mini-btn','＋事件');
  addEv.onclick=()=>{FF.app.transact('添加声音事件',()=>{a.events.push({t:app.time,vel:1,note:220});});FF.app.refreshAll();};
  return section('音色',b=>{
    b.appendChild(selectRow('乐器',[['hit','金属锤击'],['drone','氛围持续'],['whoosh','挥动风声'],['hiss','淬火嘶鸣'],['brush','笔触'],['bell','金属余韵']],
      ()=>a.instrument,v=>{a.instrument=v;}));
    b.appendChild(propRow(layers,'audio.amp','幅度'));
    b.appendChild(propRow(layers,'audio.freq','频率'));
    b.appendChild(propRow(layers,'audio.decay','衰减'));
    b.appendChild(propRow(layers,'audio.tone','音调色彩'));
    b.appendChild(propRow(layers,'audio.noise','噪声量'));
    b.appendChild(propRow(layers,'audio.filter','滤波'));
    if(a.instrument!=='drone'){
      b.appendChild(el('div','insp-note','发声事件：'));
      a.events.forEach((ev,ei)=>{
        const row=el('div','prop-row');
        const mk=(label,get,set,step)=>{
          const inp=numInput(get,v=>{FF.app.transact('事件参数',()=>set(v));FF.app.invalidate();},{step:step||0.05,label});
          inp.style.width='60px'; inp.style.flex='none'; inp.title=label;
          return inp;
        };
        row.appendChild(el('span','','t'));
        row.appendChild(mk('t',()=>ev.t,v=>{ev.t=v;}));
        row.appendChild(el('span','','力度'));
        row.appendChild(mk('vel',()=>ev.vel,v=>{ev.vel=v;},0.1));
        row.appendChild(el('span','','音高'));
        row.appendChild(mk('note',()=>ev.note||220,v=>{ev.note=v;},10));
        const del=el('button','pb','✕');
        del.onclick=()=>{FF.app.transact('删除事件',()=>a.events.splice(ei,1));FF.app.refreshAll();};
        row.appendChild(del);
        b.appendChild(row);
      });
    }
  },[addEv]);
}
function precompSection(layers){
  const l=layers[0];
  return section('预合成',b=>{
    const comps=app.project.comps.filter(c=>c.id!==app.comp.id).map(c=>[c.id,c.name]);
    b.appendChild(selectRow('源合成',comps,()=>l.compId,v=>{l.compId=v;}));
    b.appendChild(plainNumRow('起始时间',()=>l.startTime,v=>{l.startTime=v;}));
    const hasRemap=!!l.timeRemap;
    b.appendChild(checkRow('时间重映射',()=>hasRemap,v=>{
      if(v&&!l.timeRemap) l.timeRemap=FF.P('num',0);
      if(!v) l.timeRemap=null;
    }));
    if(l.timeRemap) b.appendChild(propRow(layers,'timeRemap','重映射(秒)'));
    b.appendChild(el('div','insp-note','时间重映射支持变速、倒放与定格：为其设置关键帧或表达式，例如 linear(time,0,15,15,0) 即倒放。'));
  });
}
function masksSection(layers){
  const l=layers[0];
  const add=el('button','mini-btn','＋蒙版');
  add.onclick=e=>{
    FF.ui.ctxMenu(e.clientX,e.clientY,[
      {label:'矩形蒙版',fn:()=>{FF.app.transact('添加蒙版',()=>l.masks.push(FF.makeMask('rect')));FF.app.refreshAll();}},
      {label:'椭圆蒙版',fn:()=>{FF.app.transact('添加蒙版',()=>l.masks.push(FF.makeMask('ellipse')));FF.app.refreshAll();}},
      {label:'自由路径蒙版',fn:()=>{const m=FF.makeMask('path');FF.app.transact('添加蒙版',()=>l.masks.push(m));FF.app.refreshAll();FF.CanvasView.startPathEdit(l.id,'masks.'+(l.masks.length-1)+'.path');}},
    ]);
  };
  return section('蒙版',b=>{
    l.masks.forEach((m,mi)=>{
      const base='masks.'+mi+'.';
      b.appendChild(itemCard(({rect:'▭',ellipse:'◯',path:'✒'}[m.kind]||'')+' 蒙版 '+(mi+1),body=>{
        body.appendChild(selectRow('模式',[['add','相加'],['subtract','相减'],['intersect','相交']],()=>m.mode,v=>{m.mode=v;}));
        body.appendChild(checkRow('反转',()=>m.invert,v=>{m.invert=v;}));
        if(m.kind!=='path'){
          body.appendChild(propRow(layers,base+'position','位置'));
          body.appendChild(propRow(layers,base+'size','大小'));
        } else body.appendChild(propRow(layers,base+'path','路径'));
        body.appendChild(propRow(layers,base+'feather','羽化'));
        body.appendChild(propRow(layers,base+'opacity','不透明度'));
      },{closed:true,onDel:()=>{FF.app.transact('删除蒙版',()=>l.masks.splice(mi,1));FF.app.refreshAll();}}));
    });
    if(!l.masks.length) b.appendChild(el('div','insp-note','无蒙版。'));
    b.appendChild(selectRow('轨道遮罩',[['none','无'],['alpha','Alpha 遮罩'],['alphaInv','Alpha 反转'],['luma','亮度遮罩'],['lumaInv','亮度反转']],
      ()=>l.matte,v=>{l.matte=v;}));
    b.appendChild(el('div','insp-note','轨道遮罩使用其上方图层的 Alpha/亮度。'));
  },[add]);
}
function effectsSection(layers){
  const l=layers[0];
  const add=el('button','mini-btn','＋效果');
  add.onclick=e=>{
    FF.ui.ctxMenu(e.clientX,e.clientY,Object.keys(FF.EFFECT_NAMES).map(k=>({
      label:FF.EFFECT_NAMES[k],
      fn:()=>{FF.app.transact('添加效果',()=>l.effects.push(FF.makeEffect(k)));FF.app.refreshAll();}
    })));
  };
  return section('效果',b=>{
    l.effects.forEach((ef,ei)=>{
      const base='effects.'+ei+'.';
      b.appendChild(itemCard(FF.EFFECT_NAMES[ef.type],body=>{
        body.appendChild(checkRow('启用',()=>ef.enabled,v=>{ef.enabled=v;}));
        for(const k in ef){
          if(ef[k]&&ef[k].kind){
            const names={radius:'半径',threshold:'阈值',intensity:'强度',color:'颜色',opacity:'不透明度',
              distance:'距离',angle:'角度',softness:'柔和',hue:'色相',saturation:'饱和度',lightness:'亮度'};
            body.appendChild(propRow(layers,base+k,names[k]||k));
          }
        }
      },{closed:false,
        onUp:ei>0?()=>{FF.app.transact('效果排序',()=>{[l.effects[ei-1],l.effects[ei]]=[l.effects[ei],l.effects[ei-1]];});FF.app.refreshAll();}:null,
        onDown:ei<l.effects.length-1?()=>{FF.app.transact('效果排序',()=>{[l.effects[ei+1],l.effects[ei]]=[l.effects[ei],l.effects[ei+1]];});FF.app.refreshAll();}:null,
        onDel:()=>{FF.app.transact('删除效果',()=>l.effects.splice(ei,1));FF.app.refreshAll();}}));
    });
    if(!l.effects.length) b.appendChild(el('div','insp-note','无效果。发光与投影可伸出图层边界。'));
  },[add]);
}
/* ---------- 合成设置（无选择） ---------- */
function compSettings(){
  const c=app.comp;
  const wrap=el('div');
  wrap.appendChild(section('合成设置',b=>{
    b.appendChild(plainNumRow('宽度',()=>c.w,v=>{c.w=Math.max(16,Math.round(v));}));
    b.appendChild(plainNumRow('高度',()=>c.h,v=>{c.h=Math.max(16,Math.round(v));}));
    b.appendChild(plainNumRow('帧率',()=>c.fps,v=>{c.fps=clamp(Math.round(v),1,120);}));
    b.appendChild(plainNumRow('时长',()=>c.duration,v=>{c.duration=Math.max(0.5,v);c.workArea[1]=Math.min(c.workArea[1],c.duration);}));
    b.appendChild(plainNumRow('工作区起',()=>c.workArea[0],v=>{c.workArea[0]=clamp(v,0,c.workArea[1]-0.1);}));
    b.appendChild(plainNumRow('工作区止',()=>c.workArea[1],v=>{c.workArea[1]=clamp(v,c.workArea[0]+0.1,c.duration);}));
    const row=el('div','prop-row');
    row.appendChild(el('div','prop-name','背景'));
    const ctrl=el('div','prop-ctrl');
    const sw=el('div','color-swatch');
    const fill=el('div','cfill');
    fill.style.background=FF.color.rgbToHex(c.bg);
    sw.appendChild(fill);
    sw.onclick=()=>{
      FF.app.beginDrag();
      FF.ui.colorPop(sw,c.bg,(col)=>{ c.bg=[col[0],col[1],col[2],1]; fill.style.background=FF.color.rgbToHex(col); FF.app.invalidate(); });
      const tm=setInterval(()=>{ if(!document.querySelector('.color-pop')){ clearInterval(tm); FF.app.endDrag('背景色'); FF.app.refreshAll(); } },300);
    };
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    b.appendChild(row);
  }));
  wrap.appendChild(section('运动模糊',b=>{
    b.appendChild(checkRow('合成总开关',()=>c.motionBlur.enabled,v=>{c.motionBlur.enabled=v;}));
    b.appendChild(plainNumRow('快门角度',()=>c.motionBlur.shutterAngle,v=>{c.motionBlur.shutterAngle=clamp(v,0,720);}));
    b.appendChild(plainNumRow('快门相位',()=>c.motionBlur.phase,v=>{c.motionBlur.phase=clamp(v,-180,180);}));
    b.appendChild(el('div','insp-note','图层上的运动模糊开关在图层头部。模糊按快门区间内的实际运动采样生成。'));
  }));
  wrap.appendChild(el('div','insp-empty','<div class="big">◎</div>未选择图层<br>点击画布或时间轴中的图层进行选择<br>多选：Shift+点击'));
  return wrap;
}
/* ---------- 主刷新 ---------- */
function refresh(){
  tickRows=[];
  const r=root();
  r.innerHTML='';
  const layers=currentLayers();
  const sub=document.getElementById('inspSub');
  if(!app.comp){
    sub.textContent='';
    r.appendChild(el('div','insp-empty','<div class="big">铸</div>空工程<br>从「文件 → 载入示例」或左侧快速创建开始'));
    return;
  }
  if(!layers.length){
    sub.textContent=app.comp.name;
    r.appendChild(compSettings());
    return;
  }
  const l=layers[0];
  sub.textContent=layers.length>1?(layers.length+' 个图层'):l.name;
  // 头部
  const head=el('div','insp-section');
  const hb=el('div','insp-sec-body');
  const nameRow=el('div','prop-row');
  const nameInp=el('input','text-input');
  nameInp.value=l.name;
  nameInp.addEventListener('keydown',e=>e.stopPropagation());
  nameInp.addEventListener('change',()=>{
    FF.app.transact('重命名',()=>{ for(const x of layers) x.name=nameInp.value; });
    FF.app.refreshAll();
  });
  nameRow.appendChild(nameInp);
  hb.appendChild(nameRow);
  const flags=el('div','prop-row');
  flags.style.gap='4px';
  const mkFlag=(label,get,set,title)=>{
    const b=el('button','chip'+(get()?' on':''),label);
    b.title=title;
    b.onclick=()=>{ FF.app.transact(title,()=>{ for(const x of layers) set(x,!get()); }); FF.app.refreshAll(); };
    return b;
  };
  flags.appendChild(mkFlag('👁',()=>l.visible,(x,v)=>{x.visible=v;},'显示'));
  flags.appendChild(mkFlag('🔒',()=>l.locked,(x,v)=>{x.locked=v;},'锁定'));
  flags.appendChild(mkFlag('3D',()=>l.threeD,(x,v)=>{
    x.threeD=v;
    if(v&&!x.transform.rotationX){
      const pos=x.transform.position.value;
      x.transform.anchor=FF.P('vec3',[0,0,0]);
      x.transform.position=FF.P('vec3',[pos[0]-app.comp.w/2,-(pos[1]-app.comp.h/2),0]);
      x.transform.scale=FF.P('vec3',[100,100,100]);
      x.transform.rotationX=FF.P('num',0); x.transform.rotationY=FF.P('num',0);
      x.transform.rotationZ=FF.P('num',x.transform.rotation.value||0);
    }
  },'三维开关'));
  flags.appendChild(mkFlag('模糊',()=>l.motionBlur,(x,v)=>{x.motionBlur=v;},'运动模糊'));
  hb.appendChild(flags);
  hb.appendChild(selectRow('混合模式',[['normal','正常'],['add','相加'],['screen','滤色'],['multiply','正片叠底'],['overlay','叠加']],
    ()=>l.blend,v=>{ for(const x of layers) x.blend=v; }));
  const parents=app.comp.layers.filter(x=>x.id!==l.id&&!isChild(x,l)).map(x=>[x.id,x.name]);
  hb.appendChild(selectRow('父级',[['','无'],...parents],()=>l.parent||'',v=>{
    FF.app.transact('设定父级',()=>{
      const ctx=ctxNow();
      for(const x of layers) Eval.bakeParent(ctx,x,v||null,app.time);
    });
    FF.app.refreshAll();
  }));
  const io=el('div','prop-row');
  io.appendChild(el('div','prop-name','入 / 出点'));
  const ioCtrl=el('div','prop-ctrl vec-inputs');
  const inInp=numInput(()=>l.inPoint,v=>{FF.app.transact('裁剪入点',()=>{for(const x of layers)x.inPoint=Math.max(0,v);});FF.app.invalidate();},{step:0.1,label:'入点'});
  const outInp=numInput(()=>l.outPoint>1e8?app.comp.duration:l.outPoint,v=>{FF.app.transact('裁剪出点',()=>{for(const x of layers)x.outPoint=v;});FF.app.invalidate();},{step:0.1,label:'出点'});
  ioCtrl.append(inInp,outInp);
  io.appendChild(ioCtrl);
  hb.appendChild(io);
  head.appendChild(hb);
  r.appendChild(head);
  r.appendChild(transformSection(layers));
  if(l.type==='shape') r.appendChild(shapeSection(layers));
  else if(l.type==='text') r.appendChild(textSection(layers));
  else if(l.type==='geo'){ r.appendChild(geoSection(layers)); r.appendChild(materialSection(layers)); }
  else if(l.type==='particles') r.appendChild(particlesSection(layers));
  else if(l.type==='camera') r.appendChild(cameraSection(layers));
  else if(l.type==='light') r.appendChild(lightSection(layers));
  else if(l.type==='field') r.appendChild(fieldSection(layers));
  else if(l.type==='audio') r.appendChild(audioSection(layers));
  else if(l.type==='precomp') r.appendChild(precompSection(layers));
  if(l.type!=='audio'&&l.type!=='camera'&&l.type!=='light'&&l.type!=='field') r.appendChild(masksSection(layers));
  if(['shape','text','precomp','adjustment'].includes(l.type)) r.appendChild(effectsSection(layers));
}
function isChild(x,ancestor){
  let p=x.parent;
  while(p){
    if(p===ancestor.id) return true;
    p=(FF.findLayer(app.comp,p)||{}).parent;
  }
  return false;
}
function tick(){
  for(const r of tickRows){ if(r._refresh) r._refresh(); }
}
FF.Inspector={refresh,tick};
})();
