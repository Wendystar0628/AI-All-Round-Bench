// Extra controls operate on the same serializable layer objects as the timeline.
const evaluating = new Set();
let expressionProperty = 'x';
const propertyDefaults = {x: 480, y: 270, scale: 100, rotation: 0, opacity: 100, blur:0, glow:0, shadow:0, hue:0, saturation:100, brightness:100, extrusion:0,rotateX:-18,rotateY:-25,metal:70,roughness:35};
// Evaluate references at the requested composition time without advancing playback.
val = function (layer, property, fallback) {
  const value = baseVal(layer, property, fallback);
  const expression = layer.expressions?.[property];
  if (!expression) return value;
  const id = `${project.layers.indexOf(layer)}:${property}`;
  if (evaluating.has(id)) throw new Error('循环引用');
  evaluating.add(id);
  const at = (target, prop, when) => {
    const saved = t;
    try { t = when; return val(target, prop, propertyDefaults[prop] ?? 0); }
    finally { t = saved; }
  };
  const reference = (target, prop) => ({
    valueOf: () => val(target, prop, propertyDefaults[prop] ?? 0),
    valueAtTime: when => at(target, prop, when)
  });
  const proxy = target => ({transform: new Proxy({}, {get: (_, key) => {
    if (key === 'position') return [Number(reference(target, 'x')), Number(reference(target, 'y'))];
    if (!(key in propertyDefaults)) throw new Error('未知属性：' + String(key));
    return reference(target, key);
  }})});
  try {
    const linear = (v, a, b, c, d) => c + (d-c) * clamp((v-a)/(b-a));
    const ease = (v, a, b, c, d) => c + (d-c) * smooth(a,b,v);
    const wiggle = (frequency, amplitude) => {
      const x = t * frequency, n = Math.floor(x), f = smooth(0, 1, x-n);
      return value + ((rand(n+97) * (1-f) + rand(n+98) * f) * 2 - 1) * amplitude;
    };
    const loopOut = (kind = 'cycle') => {
      const keys = layer.anim?.[property];
      if (!keys || keys.length < 2 || t <= keys[keys.length-1].t) return value;
      const first = keys[0].t, last = keys[keys.length-1].t, span = last-first;
      if (span <= 0) return value;
      let cycle = (t-first)/span, fraction = cycle-Math.floor(cycle);
      if (kind === 'pingpong' && Math.floor(cycle)%2) fraction = 1-fraction;
      const saved=t; try { t=first+fraction*span; return baseVal(layer,property,fallback); } finally { t=saved; }
    };
    const thisComp = {layer: name => {
      const target = project.layers.find(item => item.name === name);
      if (!target) throw new Error('找不到图层：' + name);
      return proxy(target);
    }};
    const result = Function('time','value','linear','ease','wiggle','loopOut','valueAtTime','thisLayer','thisComp', `return (${expression})`)(t,value,linear,ease,wiggle,loopOut,when => at(layer,property,when),proxy(layer),thisComp);
    const number = Number(result);
    if (!Number.isFinite(number)) throw new Error('结果不是有效数字');
    layer.expressionError = '';
    return number;
  } catch (error) {
    if (evaluating.size > 1) throw error;
    layer.expressionError = error.message;
    return value;
  } finally { evaluating.delete(id); }
};

function ensureLayerIds(){
  const used=new Set();
  for(const layer of project.layers){if(!layer.id || used.has(layer.id)){project.nextLayerId=(project.nextLayerId||0)+1;layer.id='layer-'+project.nextLayerId}used.add(layer.id)}
}
function localMatrix(layer){
  const size=val(layer,'scale',100)/100;
  return new DOMMatrix().translate(val(layer,'x',480),val(layer,'y',270)).rotate(val(layer,'rotation',0)).scale(size).translate(-480,-270);
}
function worldMatrix(layer,visited=new Set()){
  if(visited.has(layer))return new DOMMatrix();
  visited.add(layer);const parent=project.layers.find(candidate=>(layer.parentId && candidate.id===layer.parentId)||(layer.parentRole && candidate.role===layer.parentRole));
  return parent?worldMatrix(parent,visited).multiply(localMatrix(layer)):localMatrix(layer);
}
transform=function(context,layer){const m=worldMatrix(layer);context.transform(m.a,m.b,m.c,m.d,m.e,m.f);context.globalAlpha*=clamp(val(layer,'opacity',100)/100)};
function setParentPreservingWorld(layer,parent){
  let cursor=parent;
  while(cursor){if(cursor===layer){toast('父级不能形成循环');return false}cursor=project.layers.find(item=>(cursor.parentId&&item.id===cursor.parentId)||(cursor.parentRole&&item.role===cursor.parentRole))}
  const before=worldMatrix(layer),parentMatrix=parent?worldMatrix(parent):new DOMMatrix();
  if(Math.abs(parentMatrix.a*parentMatrix.d-parentMatrix.b*parentMatrix.c)<1e-8){toast('父级缩放为零，无法保留画面');return false}
  const local=parentMatrix.inverse().multiply(before),point=local.transformPoint(new DOMPoint(480,270));
  layer.parentId=parent?.id || null;delete layer.parentRole;
  setVal(layer,'x',point.x);setVal(layer,'y',point.y);setVal(layer,'rotation',Math.atan2(local.b,local.a)*180/Math.PI);setVal(layer,'scale',Math.hypot(local.a,local.b)*100);
  return true;
}
const baseInspect = inspect;
inspect = function () {
  ensureLayerIds();
  baseInspect();
  const layer = project.layers[selected];
  if (!layer) return;
  const panel = document.querySelector('#inspector');
  if (layer.type === '文字' && !layer.role) {
    const old = panel.querySelector('#char');
    if (old) {
      const area=document.createElement('textarea'); area.id='char'; area.rows=2; area.value=layer.content || '文字';
      area.onchange=()=>{snapshot();layer.content=area.value;draw();renderUI()}; old.replaceWith(area);
    }
  }
  const expression = panel.querySelector('#expr');
  if (expression) {
    const section = expression.parentElement.previousElementSibling;
    section.innerHTML = '⌄　表达式 <select id="exprProperty"><option value="x">位置 X</option><option value="y">位置 Y</option><option value="scale">缩放</option><option value="rotation">旋转</option><option value="opacity">不透明度</option></select>';
    const selector = section.querySelector('select'); selector.value = expressionProperty;
    selector.onchange = () => { expressionProperty = selector.value; inspect(); };
    expression.value = layer.expressions?.[expressionProperty] || '';
    expression.placeholder = '例如 wiggle(2, 20)';
    const hint = panel.querySelector('#exprHint');
    hint.textContent = layer.expressionError ? '表达式错误：' + layer.expressionError : '支持 time、value、wiggle、loopOut、valueAtTime 和图层引用。';
    expression.onchange = () => {
      snapshot(); layer.expressions ||= {}; layer.expressions[expressionProperty] = expression.value;
      val(layer, expressionProperty, propertyDefaults[expressionProperty]);
      hint.textContent = layer.expressionError ? '表达式错误，已回退：' + layer.expressionError : '表达式已应用';
      draw();
    };
  }
  const controls = document.createElement('div');
  controls.className = 'layer-details';
  controls.innerHTML = `<div class="section-title">⌄　图层区间 <span>秒</span></div>
    <div class="prop"><label>入点</label><input type="number" min="0" max="15" step="0.1" data-field="start"></div>
    <div class="prop"><label>出点</label><input type="number" min="0" max="15" step="0.1" data-field="end"></div>
    <div class="prop"><label>父级</label><select data-parent><option value="">无</option></select></div>
    <div class="layer-actions"><button data-action="up">上移</button><button data-action="down">下移</button><button data-action="duplicate">复制</button></div>`;
  if (!layer.role && (layer.type === '形状' || layer.type === '文字')) {
    const appearance = document.createElement('div');
    appearance.innerHTML = `<div class="section-title">⌄　外观</div>
      <div class="prop"><label>填充</label><input type="color" data-field="fill"></div>` +
      (layer.type === '形状' ? `<div class="prop"><label>轮廓</label><select data-field="shapeKind"><option value="rect">矩形</option><option value="ellipse">椭圆</option></select></div><div class="prop"><label>宽度</label><input type="number" min="1" data-field="width"></div><div class="prop"><label>高度</label><input type="number" min="1" data-field="height"></div><div class="prop"><label>描边</label><input type="color" data-field="stroke"></div><div class="prop"><label>描边宽度</label><input type="number" min="0" data-field="strokeWidth"></div>` : `<div class="prop"><label>字号</label><input type="number" min="1" data-field="fontSize"></div><div class="prop"><label>行距倍率</label><input type="number" min="0.2" step="0.1" data-field="lineHeight"></div><div class="prop"><label>字距</label><input type="number" data-field="letterSpacing"></div><div class="prop"><label>对齐</label><select data-field="textAlign"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></div>`);
    appearance.innerHTML += `<div class="section-title">⌄　合成与效果</div><div class="prop"><label>混合模式</label><select data-field="blend"><option value="normal">正常</option><option value="add">相加</option><option value="screen">滤色</option><option value="multiply">正片叠底</option><option value="overlay">叠加</option></select></div>` +
      [['blur','模糊'],['glow','发光'],['shadow','投影'],['hue','色相'],['saturation','饱和度 %'],['brightness','亮度 %']].map(([p,label])=>`<div class="prop"><label>${label}</label><input type="number" data-effect="${p}"><span class="diamond" data-effect-key="${p}" title="开关关键帧">${layer.anim?.[p]?'◆':'◇'}</span></div>`).join('');
    appearance.innerHTML+=`<div class="section-title">⌄　三维挤出与材质</div>`+[['extrusion','深度'],['rotateX','X 旋转 °'],['rotateY','Y 旋转 °'],['metal','金属度 %'],['roughness','粗糙度 %']].map(([p,label])=>`<div class="prop"><label>${label}</label><input type="number" data-effect="${p}"><span class="diamond" data-effect-key="${p}" title="开关关键帧">${layer.anim?.[p]?'◆':'◇'}</span></div>`).join('')+`<p class="hint">闭合轮廓和文字可挤出；深度为 0 时使用二维图形。</p>`;
    controls.prepend(appearance);
  }
  panel.append(controls);
  const parentSelect=controls.querySelector('[data-parent]');
  project.layers.filter(candidate=>candidate!==layer).forEach(candidate=>{const option=document.createElement('option');option.value=candidate.id;option.textContent=candidate.name;parentSelect.append(option)});
  parentSelect.value=layer.parentId || project.layers.find(item=>layer.parentRole && item.role===layer.parentRole)?.id || '';
  parentSelect.onchange=()=>{snapshot();if(!setParentPreservingWorld(layer,project.layers.find(item=>item.id===parentSelect.value)))undo.pop();renderUI();draw()};
  const defaults = {start: 0, end: 15, width: 200, height: 120, fontSize: 100, fill: '#e8a16e', stroke:'#ffffff', strokeWidth:0, shapeKind:'rect', lineHeight:1.2,letterSpacing:0,textAlign:'center',blend:'normal'};
  controls.querySelectorAll('[data-field]').forEach(input => {
    const field = input.dataset.field;
    input.value = layer[field] ?? defaults[field];
    input.onchange = () => {
      let value = input.type === 'color' || input.tagName === 'SELECT' ? input.value : Number(input.value);
      if (typeof value === 'number' && !Number.isFinite(value)) return;
      if (field === 'start') value = clamp(value, 0, layer.end);
      if (field === 'end') value = clamp(value, layer.start, 15);
      if (['width', 'height', 'fontSize'].includes(field)) value = Math.max(1, value);
      snapshot(); layer[field] = value; renderUI(); draw();
    };
  });
  controls.querySelectorAll('[data-action]').forEach(button => button.onclick = () => {
    const action = button.dataset.action;
    if (layer.locked) { toast('图层已锁定'); return; }
    if (action === 'duplicate') {
      snapshot(); const copy = structuredClone(layer);
      copy.id = undefined;
      copy.name += ' 副本';
      if (copy.role === 'hero') { copy.role = undefined; copy.content = project.character; }
      else if (copy.role) { toast('此示例图层暂不支持复制'); undo.pop(); return; }
      project.layers.splice(selected, 0, copy);
    } else {
      const next = selected + (action === 'up' ? -1 : 1);
      if (next < 0 || next >= project.layers.length) return;
      snapshot(); [project.layers[selected], project.layers[next]] = [project.layers[next], project.layers[selected]]; selected = next;
    }
    renderUI(); draw();
  });
  controls.querySelectorAll('[data-effect]').forEach(input=>{
    const property=input.dataset.effect; input.value=+val(layer,property,propertyDefaults[property]).toFixed(2);
    input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value))return;snapshot();setVal(layer,property,value);renderUI();draw()};
  });
  controls.querySelectorAll('[data-effect-key]').forEach(button=>button.onclick=()=>{
    const property=button.dataset.effectKey; snapshot();layer.anim ||= {};
    if(layer.anim[property]){layer[property]=val(layer,property,propertyDefaults[property]);delete layer.anim[property]}
    else layer.anim[property]=[{t:+t.toFixed(4),v:val(layer,property,propertyDefaults[property])}];
    renderUI();draw();
  });
  if (!layer.role && ['形状','文字'].includes(layer.type)) {
    const maskPanel=document.createElement('div');
    maskPanel.className='mask-panel';
    maskPanel.innerHTML=`<div class="section-title">⌄　轨道遮罩</div><div class="prop"><label>来源图层</label><select data-matte><option value="">无</option></select></div><div class="prop"><label>遮罩模式</label><select data-matte-mode><option value="alpha">Alpha</option><option value="alpha-invert">Alpha 反转</option><option value="luma">亮度</option><option value="luma-invert">亮度反转</option></select></div><p class="hint">遮罩可取自普通文字或形状；关闭来源图层显示可只保留遮罩。</p><div class="section-title">⌄　蒙版 <button data-add-mask>＋ 添加</button></div><div class="mask-list"></div><div class="section-title">⌄　运动模糊</div><div class="prop"><label>图层开关</label><input type="checkbox" data-motion></div><div class="prop"><label>快门角度</label><input type="number" min="0" max="720" data-shutter="shutterAngle"></div><div class="prop"><label>快门相位</label><input type="number" data-shutter="shutterPhase"></div>`;
    controls.append(maskPanel);
    const matte=maskPanel.querySelector('[data-matte]');
    project.layers.filter(item=>item!==layer && !item.role && ['形状','文字'].includes(item.type)).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;matte.append(option)});
    matte.value=layer.matteId||'';matte.onchange=()=>{snapshot();layer.matteId=matte.value||null;draw();renderUI()};
    const matteMode=maskPanel.querySelector('[data-matte-mode]');matteMode.value=layer.matteMode||'alpha';matteMode.onchange=()=>{snapshot();layer.matteMode=matteMode.value;draw();renderUI()};
    const list=maskPanel.querySelector('.mask-list');
    (layer.masks || []).forEach((mask,index)=>{
      const card=document.createElement('div');card.className='mask-card';
      card.innerHTML=`<div class="mask-card-title">蒙版 ${index+1}<button data-remove-mask>删除 ×</button></div><div class="prop"><label>形状</label><select data-mask="type"><option value="rect">矩形</option><option value="ellipse">椭圆</option><option value="path">路径图层</option></select></div>${mask.type==='path'?'<div class="prop"><label>路径来源</label><select data-mask-source><option value="">无</option></select></div>':''}<div class="prop"><label>反转</label><input type="checkbox" data-mask="inverted"></div>${(mask.type==='path'?[['feather','羽化']]:[['x','位置 X'],['y','位置 Y'],['width','宽度'],['height','高度'],['feather','羽化']]).map(([key,label])=>`<div class="prop"><label>${label}</label><input type="number" data-mask="${key}"><span class="diamond" data-mask-key="${key}" title="开关关键帧">${mask.anim?.[key]?'◆':'◇'}</span></div>`).join('')}`;
      card.querySelectorAll('[data-mask]').forEach(input=>{const key=input.dataset.mask;if(input.type==='checkbox')input.checked=!!mask[key];else input.value=input.tagName==='SELECT'?mask[key]:val(mask,key,mask[key]??0);input.onchange=()=>{snapshot();if(input.type==='checkbox')mask[key]=input.checked;else if(input.tagName==='SELECT')mask[key]=input.value;else setVal(mask,key,Number(input.value));draw();renderUI()}});
      card.querySelectorAll('[data-mask-key]').forEach(button=>button.onclick=()=>{const key=button.dataset.maskKey;snapshot();mask.anim ||= {};if(mask.anim[key]){mask[key]=val(mask,key,mask[key]??0);delete mask.anim[key]}else mask.anim[key]=[{t:+t.toFixed(4),v:val(mask,key,mask[key]??0)}];draw();renderUI()});
      const sourceSelect=card.querySelector('[data-mask-source]');if(sourceSelect){project.layers.filter(item=>item!==layer && !item.role && item.type==='形状').forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;sourceSelect.append(option)});sourceSelect.value=mask.sourceId||'';sourceSelect.onchange=()=>{snapshot();mask.sourceId=sourceSelect.value||null;draw();renderUI()}}
      card.querySelector('[data-remove-mask]').onclick=()=>{snapshot();layer.masks.splice(index,1);draw();renderUI()};list.append(card);
    });
    maskPanel.querySelector('[data-add-mask]').onclick=()=>{snapshot();layer.masks ||= [];layer.masks.push({type:'rect',x:0,y:0,width:160,height:100,feather:0,inverted:false});draw();renderUI()};
    const motion=maskPanel.querySelector('[data-motion]');motion.checked=!!layer.motionBlur;motion.onchange=()=>{snapshot();layer.motionBlur=motion.checked;draw()};
    maskPanel.querySelectorAll('[data-shutter]').forEach(input=>{const key=input.dataset.shutter;input.value=project[key]??(key==='shutterAngle'?180:-90);input.onchange=()=>{let value=Number(input.value);if(!Number.isFinite(value))return;snapshot();project[key]=key==='shutterAngle'?clamp(value,0,720):value;draw();renderUI()}});
  }
};

// Scrubbing and rendering stay deterministic; select a layer without moving it.
document.querySelector('#inspector').style.overflowY = 'auto';
renderUI(); draw();

const exportFrame = window.videoExport.frame;
window.videoExport.frame = async function (index) { await exportFrame(index); inspect(); };

// A selected key can be copied, pasted, eased or removed with familiar shortcuts.
let selectedKey = null, copiedKey = null;
const baseRenderUI = renderUI;
renderUI = function () {
  baseRenderUI();
  document.querySelectorAll('#tracks .track').forEach((track, index) => {
    const layer = project.layers[index];
    const animated = Object.entries(layer.anim || {}).flatMap(([property, keys]) => keys.map(key => ({property, key})));
    const offset = (layer.keys || []).length;
    track.querySelectorAll('.key').forEach((element, keyIndex) => {
      const item = animated[keyIndex-offset];
      if (!item) return;
      if (selectedKey?.key === item.key) element.classList.add('selected-key');
      element.addEventListener('pointerdown', () => { selected = index; selectedKey = {layer, ...item}; }, true);
      element.addEventListener('click', event => {
        event.stopPropagation(); selected = index; selectedKey = {layer, ...item}; renderUI();
      });
    });
  });
};
document.addEventListener('keydown', event => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  if (event.key === 'F9' && selectedKey) {
    event.preventDefault(); snapshot(); selectedKey.key.ease = !selectedKey.key.ease; renderUI(); draw();
    toast(selectedKey.key.ease ? '已应用缓入缓出' : '已恢复线性插值');
  } else if (event.ctrlKey && event.key.toLowerCase() === 'c' && selectedKey) {
    event.preventDefault(); copiedKey = {property: selectedKey.property, key: structuredClone(selectedKey.key)}; toast('已复制关键帧');
  } else if (event.ctrlKey && event.key.toLowerCase() === 'v' && copiedKey && project.layers[selected]) {
    event.preventDefault(); snapshot(); const layer = project.layers[selected]; layer.anim ||= {}; layer.anim[copiedKey.property] ||= [];
    const keys = layer.anim[copiedKey.property], time = +t.toFixed(4);
    const existing = keys.find(k => Math.abs(k.t-time) < 1/60);
    if (existing) Object.assign(existing, copiedKey.key, {t:time});
    else keys.push({...copiedKey.key, t:time});
    keys.sort((a,b)=>a.t-b.t); selectedKey = null; renderUI(); draw(); toast('已粘贴关键帧');
  } else if (event.key === 'Delete' && selectedKey) {
    event.preventDefault(); event.stopImmediatePropagation();
    snapshot(); const keys = selectedKey.layer.anim[selectedKey.property];
    const index = keys.indexOf(selectedKey.key); if (index >= 0) keys.splice(index, 1);
    selectedKey = null; renderUI(); draw();
  } else if (event.key === 'Escape' && selectedKey) {
    selectedKey = null; renderUI();
  }
}, true);
renderUI();

// The selection frame is an editor overlay and is excluded from exported frames.
const selectionFrame = document.createElement('div');
selectionFrame.className = 'selection-frame';
selectionFrame.innerHTML = '<i></i><i></i><i></i><i></i><span></span>';
document.querySelector('.canvas-wrap').append(selectionFrame);
function updateSelectionFrame() {
  const layer = project.layers[selected];
  if (exporting || !layer || layer.visible === false || layer.locked || t < layer.start || t > layer.end || (layer.role && layer.role !== 'hero')) {
    selectionFrame.style.display = 'none'; return;
  }
  const wrap = document.querySelector('.canvas-wrap').getBoundingClientRect();
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width/W,rect.height/H);
  const left = rect.left-wrap.left+(rect.width-W*scale)/2;
  const top = rect.top-wrap.top+(rect.height-H*scale)/2;
  const width = layer.role==='hero' ? 330 : layer.type==='文字' ? (layer.fontSize||100)*Math.max(1,(layer.content||'文字').length) : (layer.width||200);
  const height = layer.role==='hero' ? 330 : layer.type==='文字' ? (layer.fontSize||100)*1.2 : (layer.height||120);
  const matrix=worldMatrix(layer),point=matrix.transformPoint(new DOMPoint(480,270)),size=Math.hypot(matrix.a,matrix.b),angle=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
  Object.assign(selectionFrame.style,{display:'block',left:(left+point.x*scale)+'px',top:(top+point.y*scale)+'px',width:(width*scale*size)+'px',height:(height*scale*size)+'px',transform:`translate(-50%,-50%) rotate(${angle}deg)`});
}
const drawWithoutSelection = draw;
draw = function(){drawWithoutSelection();updateSelectionFrame()};
const renderWithSelection = renderUI;
renderUI = function(){renderWithSelection();updateSelectionFrame()};
window.addEventListener('resize',updateSelectionFrame);
const endExport = window.videoExport.end;
window.videoExport.end = function(){endExport();updateSelectionFrame()};
draw();

// Composition shutter is independent from each layer's motion-blur switch.
const shutterButton=document.createElement('button'); shutterButton.className='shutter-button'; shutterButton.title='合成运动模糊';
document.querySelector('.timeline-options').prepend(shutterButton);
function syncShutter(){shutterButton.textContent=project.motionBlur?'◉ 运动模糊':'○ 运动模糊';shutterButton.classList.toggle('enabled',!!project.motionBlur)}
shutterButton.onclick=()=>{snapshot();project.motionBlur=!project.motionBlur;syncShutter();draw()};
const refreshWithShutter=renderUI;renderUI=function(){refreshWithShutter();syncShutter()};syncShutter();

// Timeline zoom changes the actual time scale used by the ruler and keyframes.
let timelineZoom=1;
const updateTimeBase=updateTime;
updateTime=function(){
  updateTimeBase();
  const area=document.querySelector('#trackArea');
  const position=t/15*area.clientWidth*timelineZoom;
  document.querySelector('#playhead').style.left=position+'px';
  if ((playing || exporting) && (position<area.scrollLeft || position>area.scrollLeft+area.clientWidth-20)) area.scrollLeft=Math.max(0,position-area.clientWidth/3);
};
function setTimelineZoom(value){
  timelineZoom=clamp(value,1,4);
  const area=document.querySelector('#trackArea');
  document.querySelector('#ruler').style.width=(timelineZoom*100)+'%';
  document.querySelector('#tracks').style.width=(timelineZoom*100)+'%';
  updateTime();
  area.scrollLeft=Math.max(0,t/15*area.clientWidth*timelineZoom-area.clientWidth/2);
  toast('时间轴缩放 '+Math.round(timelineZoom*100)+'%');
}
document.querySelector('#zoomIn').onclick=()=>setTimelineZoom(timelineZoom*1.5);
document.querySelector('#zoomOut').onclick=()=>setTimelineZoom(timelineZoom/1.5);
window.addEventListener('resize',updateTime);

const renderWithMaskKeys=renderUI;
renderUI=function(){
  renderWithMaskKeys();
  document.querySelectorAll('#tracks .track').forEach((track,index)=>{
    const layer=project.layers[index],owners=[...(layer?.masks||[]),...(layer?.graph?.nodes||[])];
    for(const owner of owners) for(const keys of Object.values(owner.anim || {})) for(const key of keys){
      const marker=document.createElement('div');marker.className='key mask-key';marker.title='蒙版或节点关键帧：拖动调整时间';marker.style.left=`calc(${key.t/15*100}% - 4px)`;
      marker.onpointerdown=event=>{event.stopPropagation();snapshot();const ruler=document.querySelector('#ruler').getBoundingClientRect();marker.setPointerCapture(event.pointerId);marker.onpointermove=e=>{if(e.buttons){key.t=+clamp((e.clientX-ruler.left)/ruler.width*15,0,15).toFixed(3);marker.style.left=`calc(${key.t/15*100}% - 4px)`}};marker.onpointerup=()=>{keys.sort((a,b)=>a.t-b.t);renderUI();draw()}};
      track.append(marker);
    }
  });
};
renderUI();
