// Precompositions keep their source layers in the project and can be instanced.
let multiSelection=new Set();
const precompSurface=document.createElement('canvas');precompSurface.width=W;precompSurface.height=H;
const precompContext=precompSurface.getContext('2d');
function renderPrecomp(context,layer){
  const composition=project.compositions?.[layer.compId];if(!composition)return;
  const outerLayers=project.layers,outerTime=t;
  precompContext.setTransform(1,0,0,1,0,0);precompContext.clearRect(0,0,W,H);
  try {
    project.layers=composition.layers;
    t=layer.start+(outerTime-layer.start)*val(layer,'timeScale',1)+val(layer,'timeOffset',0);
    for(const child of [...composition.layers].reverse()){
      if(child.visible===false || t<child.start || t>child.end)continue;
      renderOrdinaryLayer(precompContext,child);
    }
  } finally {project.layers=outerLayers;t=outerTime}
  context.save();transform(context,layer);context.drawImage(precompSurface,0,0);context.restore();
}
function selectedForPrecomp(){
  const indices=project.layers.map((layer,index)=>multiSelection.has(layer.id)?index:-1).filter(index=>index>=0);
  return indices.length?indices:[selected].filter(index=>index>=0);
}
function makePrecomp(){
  const indices=selectedForPrecomp().sort((a,b)=>a-b),layers=indices.map(index=>project.layers[index]);
  if(!layers.length){toast('请先选择图层');return}
  if(indices.some((index,i)=>i && index!==indices[i-1]+1)){toast('请选择连续的图层以保持叠放顺序');return}
  if(layers.some(layer=>layer.role || layer.compId || layer.locked || !['形状','文字'].includes(layer.type))){toast('预合成支持未锁定的普通文字和形状图层');return}
  if(layers.some(layer=>layer.blend && layer.blend!=='normal')){toast('请先将所选图层混合模式设为正常');return}
  if(project.layers.some(layer=>Object.values(layer.expressions||{}).some(expression=>/thisComp\s*\.\s*layer/.test(expression)))){toast('请先移除跨图层表达式，再预合成');return}
  const ids=new Set(layers.map(layer=>layer.id));
  if(layers.some(layer=>(layer.parentId&&!ids.has(layer.parentId))||(layer.matteId&&!ids.has(layer.matteId))) || project.layers.some(layer=>!ids.has(layer.id)&&(ids.has(layer.parentId)||ids.has(layer.matteId)))){toast('请将相互关联的父级与遮罩图层一同选择');return}
  if(layers.some(layer=>(layer.graph?.nodes||[]).some(node=>node.type==='boolean' && node.otherId && !ids.has(node.otherId))) || project.layers.some(layer=>!ids.has(layer.id) && (layer.graph?.nodes||[]).some(node=>node.type==='boolean' && ids.has(node.otherId)))){toast('请将布尔运算引用的形状一同选择');return}
  if(layers.some(layer=>(layer.masks||[]).some(mask=>mask.type==='path' && mask.sourceId && !ids.has(mask.sourceId))) || project.layers.some(layer=>!ids.has(layer.id) && (layer.masks||[]).some(mask=>mask.type==='path' && ids.has(mask.sourceId)))){toast('请将路径蒙版及其来源一同选择');return}
  if(project.layers.some(layer=>layer.type==='粒子'&&(ids.has(layer.sourceId)||ids.has(layer.colliderId)))){toast('请先解除粒子对所选图层的发射或碰撞引用');return}
  snapshot();project.compositions ||= {};project.nextCompId=(project.nextCompId||0)+1;
  const id='comp-'+project.nextCompId,name='预合成 '+project.nextCompId;
  project.compositions[id]={name,layers};
  const start=Math.min(...layers.map(layer=>layer.start)),end=Math.max(...layers.map(layer=>layer.end));
  project.layers.splice(indices[0],indices.length,{name,type:'预合成',icon:'▦',color:'alt',start,end,keys:[],compId:id,x:480,y:270,scale:100,rotation:0,opacity:100,timeScale:1,timeOffset:0});
  selected=indices[0];multiSelection.clear();renderUI();draw();toast('已原位预合成');
}
// Ctrl-click selects contiguous layer rows; the regular click remains unchanged.
document.querySelector('#layers').addEventListener('click',event=>{
  const row=event.target.closest('.layer-row');if(!row)return;
  const index=Array.from(row.parentElement.children).indexOf(row),layer=project.layers[index];
  if(event.ctrlKey || event.metaKey){
    event.stopImmediatePropagation();event.preventDefault();
    if(!multiSelection.size && project.layers[selected])multiSelection.add(project.layers[selected].id);
    if(multiSelection.has(layer.id))multiSelection.delete(layer.id);else multiSelection.add(layer.id);
    selected=index;renderUI();
  } else multiSelection.clear();
},true);
const precompRenderUI=renderUI;
renderUI=function(){precompRenderUI();document.querySelectorAll('#layers .layer-row').forEach((row,index)=>row.classList.toggle('multi-active',multiSelection.has(project.layers[index]?.id)))};
document.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
  if(event.ctrlKey && event.shiftKey && event.key.toLowerCase()==='c'){event.preventDefault();event.stopImmediatePropagation();makePrecomp()}
},true);
const precompButton=document.createElement('button');precompButton.textContent='预合成';precompButton.title='预合成所选图层 Ctrl+Shift+C';precompButton.onclick=makePrecomp;
document.querySelector('.timeline-options').prepend(precompButton);

const precompInspect=inspect;
let precompChildIndex=0;
function withPrecompScope(layer,composition,callback){
  const outerLayers=project.layers,outerTime=t;
  try {const speed=val(layer,'timeScale',1),offset=val(layer,'timeOffset',0);project.layers=composition.layers;t=layer.start+(outerTime-layer.start)*speed+offset;return callback()}
  finally {project.layers=outerLayers;t=outerTime}
}
inspect=function(){
  precompInspect();const layer=project.layers[selected];if(!layer?.compId)return;
  const composition=project.compositions?.[layer.compId];if(!composition)return;
  const panel=document.querySelector('#inspector'),box=document.createElement('div');box.className='precomp-details';
  box.innerHTML=`<div class="section-title">⌄　时间重映射</div><div class="prop"><label>速度倍率</label><input type="number" step="0.1" data-time="timeScale"><span class="diamond" data-time-key="timeScale">${layer.anim?.timeScale?'◆':'◇'}</span></div><div class="prop"><label>时间偏移</label><input type="number" step="0.1" data-time="timeOffset"><span class="diamond" data-time-key="timeOffset">${layer.anim?.timeOffset?'◆':'◇'}</span></div><p class="hint">0 为定格；倒放使用负倍率并配合时间偏移。此引用与副本共享内部合成。</p><div class="section-title">⌄　内部图层 <span>${composition.layers.length} 层</span></div><div class="precomp-list"></div><button class="unpack">解开预合成</button>`;
  const list=box.querySelector('.precomp-list');precompChildIndex=clamp(precompChildIndex,0,composition.layers.length-1);
  composition.layers.forEach((child,index)=>{const row=document.createElement('button');row.textContent=child.icon+'　'+child.name;row.classList.toggle('chosen',index===precompChildIndex);row.onclick=()=>{precompChildIndex=index;inspect()};list.append(row)});
  const child=composition.layers[precompChildIndex];
  if(child){
    const editor=document.createElement('div');editor.className='precomp-child';
    editor.innerHTML=`<div class="section-title">⌄　编辑内部图层</div>${child.type==='文字'?'<div class="prop"><label>内容</label><input data-child="content"></div>':''}<div class="prop"><label>填充</label><input type="color" data-child="fill"></div>${[['x','位置 X',480],['y','位置 Y',270],['scale','缩放 %',100],['rotation','旋转 °',0],['opacity','不透明度 %',100]].map(([p,n])=>`<div class="prop"><label>${n}</label><input type="number" data-child="${p}"></div>`).join('')}`;
    editor.querySelectorAll('[data-child]').forEach(input=>{const key=input.dataset.child;input.value=key==='content'?(child.content||'文字'):key==='fill'?(child.fill||'#e8a16e'):withPrecompScope(layer,composition,()=>+val(child,key,propertyDefaults[key]).toFixed(2));input.onchange=()=>{snapshot();if(key==='content'||key==='fill')child[key]=input.value;else{const value=Number(input.value);if(!Number.isFinite(value))return;withPrecompScope(layer,composition,()=>setVal(child,key,value))}draw();inspect()}});
    box.append(editor);
  }
  box.querySelectorAll('[data-time]').forEach(input=>{const key=input.dataset.time;input.value=+val(layer,key,key==='timeScale'?1:0).toFixed(2);input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value))return;snapshot();setVal(layer,key,value);draw();renderUI()}});
  box.querySelectorAll('[data-time-key]').forEach(button=>button.onclick=()=>{const key=button.dataset.timeKey,def=key==='timeScale'?1:0;snapshot();layer.anim ||= {};if(layer.anim[key]){layer[key]=val(layer,key,def);delete layer.anim[key]}else layer.anim[key]=[{t:+t.toFixed(4),v:val(layer,key,def)}];draw();renderUI()});
  box.querySelector('.unpack').onclick=()=>{
    if(layer.anim && Object.values(layer.anim).some(keys=>keys.length) || (layer.timeScale??1)!==1||(layer.timeOffset??0)!==0||val(layer,'x',480)!==480||val(layer,'y',270)!==270||val(layer,'scale',100)!==100||val(layer,'rotation',0)!==0||val(layer,'opacity',100)!==100){toast('请先恢复预合成的默认变换和时间映射');return}
    snapshot();const children=structuredClone(composition.layers);project.layers.splice(selected,1,...children);multiSelection.clear();renderUI();draw();toast('已解开预合成');
  };
  panel.append(box);
};
renderUI();
