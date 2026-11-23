let penMode=false, pathEditing=false, pathDraft=[], pointDrag=null, selectedPoint=-1;
const penTool=document.querySelector('.tool[title="钢笔工具"]');
const pathOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
pathOverlay.classList.add('path-overlay');document.querySelector('.canvas-wrap').append(pathOverlay);
function canvasCoordinates(event){
  const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/W,rect.height/H);
  return {x:(event.clientX-(rect.left+(rect.width-W*scale)/2))/scale,y:(event.clientY-(rect.top+(rect.height-H*scale)/2))/scale};
}
function overlayCoordinates(point){
  const wrap=document.querySelector('.canvas-wrap').getBoundingClientRect(),rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/W,rect.height/H);
  return {x:rect.left-wrap.left+(rect.width-W*scale)/2+point.x*scale,y:rect.top-wrap.top+(rect.height-H*scale)/2+point.y*scale};
}
function updatePathOverlay(){
  pathOverlay.replaceChildren();if(exporting)return;
  const layer=project.layers[selected],editing=pathEditing && layer?.shapeKind==='path';
  const points=penMode?pathDraft:editing?pathAtTime(layer):[];
  if(!points.length)return;
  if(editing)selectionFrame.style.display='none';
  const matrix=editing?worldMatrix(layer):new DOMMatrix();
  const projectPoint=(x,y)=>overlayCoordinates(matrix.transformPoint(new DOMPoint(x,y)));
  function element(name,attrs){const e=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));pathOverlay.append(e)}
  const screen=points.map(point=>projectPoint(editing?point.x+480:point.x,editing?point.y+270:point.y));
  element('polyline',{points:screen.map(p=>`${p.x},${p.y}`).join(' '),class:'path-guide'});
  points.forEach((point,index)=>{
    const center=screen[index];
    if(editing && index===selectedPoint){for(const side of ['in','out']){const x=point[side+'X']||0,y=point[side+'Y']||0;if(!x&&!y)continue;const handle=projectPoint(point.x+480+x,point.y+270+y);element('line',{x1:center.x,y1:center.y,x2:handle.x,y2:handle.y,class:'path-tangent'});element('circle',{cx:handle.x,cy:handle.y,r:4,class:'path-handle'})}}
    element('rect',{x:center.x-4,y:center.y-4,width:8,height:8,class:index===selectedPoint?'path-point selected':'path-point'});
  });
}
function finishDraft(){
  if(pathDraft.length<2){toast('路径至少需要两个点');return}
  snapshot();project.layers.unshift({name:'自由路径',type:'形状',icon:'◆',color:'',start:t,end:15,keys:[],x:480,y:270,scale:100,rotation:0,opacity:100,shapeKind:'path',pathClosed:pathDraft.length>2,pathPoints:pathDraft.map(p=>({x:p.x-480,y:p.y-270})),fill:'#e8a16e',stroke:'#f3bc92',strokeWidth:3});
  selected=0;pathDraft=[];penMode=false;pathEditing=true;selectedPoint=-1;penTool.classList.remove('active');renderUI();draw();toast('路径已创建；拖动节点，Alt 拖出切线');
}
function editablePath(layer){
  if(!layer.pathKeys?.length)return layer.pathPoints;
  let key=layer.pathKeys.find(item=>Math.abs(item.t-t)<1/60);
  if(!key){key={t:+t.toFixed(4),points:structuredClone(pathAtTime(layer))};layer.pathKeys.push(key);layer.pathKeys.sort((a,b)=>a.t-b.t)}
  return key.points;
}
penTool.onclick=()=>{penMode=!penMode;pathEditing=false;pathDraft=[];selectedKey=null;penTool.classList.toggle('active',penMode);updatePathOverlay();toast(penMode?'依次点击添加节点，Enter 完成':'钢笔工具已关闭')};
canvas.addEventListener('pointerdown',event=>{
  if(penMode){event.preventDefault();event.stopImmediatePropagation();if(event.detail>1){finishDraft();return}const p=canvasCoordinates(event);if(p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H)pathDraft.push(p);updatePathOverlay();return}
  const layer=project.layers[selected];if(!pathEditing||layer?.shapeKind!=='path'||layer.locked)return;
  event.preventDefault();event.stopImmediatePropagation();
  const world=canvasCoordinates(event),local=worldMatrix(layer).inverse().transformPoint(new DOMPoint(world.x,world.y)),x=local.x-480,y=local.y-270;
  const points=pathAtTime(layer),scale=Math.max(.01,Math.hypot(worldMatrix(layer).a,worldMatrix(layer).b)),threshold=14/scale;
  let hit=null,best=threshold;
  points.forEach((p,i)=>{const entries=[['point',p.x,p.y]];if(i===selectedPoint)for(const side of ['in','out'])if(p[side+'X']||p[side+'Y'])entries.push([side,p.x+(p[side+'X']||0),p.y+(p[side+'Y']||0)]);for(const [kind,px,py] of entries){let d=Math.hypot(x-px,y-py);if(d<best){best=d;hit={index:i,kind}}}});
  if(!hit && event.shiftKey){snapshot();const editable=editablePath(layer);editable.push({x:Math.round(x),y:Math.round(y)});selectedPoint=editable.length-1;renderUI();draw();return}
  if(!hit){selectedPoint=-1;updatePathOverlay();return}
  snapshot();selectedPoint=hit.index;pointDrag={layer,points:editablePath(layer),index:hit.index,kind:event.altKey?'tangent':hit.kind};canvas.setPointerCapture(event.pointerId);updatePathOverlay();
},true);
canvas.addEventListener('pointermove',event=>{
  if(!pointDrag)return;event.stopImmediatePropagation();const {layer,points,index,kind}=pointDrag,p=points[index],world=canvasCoordinates(event),local=worldMatrix(layer).inverse().transformPoint(new DOMPoint(world.x,world.y)),x=local.x-480,y=local.y-270;
  if(kind==='point'){p.x=Math.round(x);p.y=Math.round(y)}else if(kind==='tangent'){p.outX=Math.round(x-p.x);p.outY=Math.round(y-p.y);p.inX=-p.outX;p.inY=-p.outY}else{p[kind+'X']=Math.round(x-p.x);p[kind+'Y']=Math.round(y-p.y)}draw();
},true);
canvas.addEventListener('pointerup',event=>{if(pointDrag){event.stopImmediatePropagation();pointDrag=null;renderUI();draw()}},true);
document.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
  if(penMode && event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();finishDraft()}
  else if(event.key==='Escape'&&(penMode||pathEditing)){event.preventDefault();event.stopImmediatePropagation();penMode=false;pathEditing=false;pathDraft=[];penTool.classList.remove('active');updatePathOverlay()}
  else if(pathEditing && selectedPoint>=0 && event.key==='Delete'){event.preventDefault();event.stopImmediatePropagation();const layer=project.layers[selected];if(layer && pathAtTime(layer).length>2){snapshot();editablePath(layer).splice(selectedPoint,1);selectedPoint=-1;renderUI();draw()}else toast('路径至少需要两个节点')}
},true);
const inspectBeforePath=inspect;
inspect=function(){
  inspectBeforePath();const layer=project.layers[selected];if(layer?.shapeKind!=='path')return;
  const box=document.createElement('div');box.className='path-settings';box.innerHTML=`<div class="section-title">⌄　贝塞尔路径</div><div class="prop"><label>闭合</label><input type="checkbox" data-closed></div><div class="prop"><label>路径动画</label><button class="diamond" data-path-key>${layer.pathKeys?.length?'◆':'◇'}</button></div><div class="layer-actions"><button data-edit>编辑节点</button></div><p class="hint">拖动节点；Alt 拖出切线，Shift 点击添加节点，Delete 删除选中节点。形变关键帧需保持相同节点数量。</p>`;
  box.querySelector('[data-closed]').checked=layer.pathClosed!==false;box.querySelector('[data-closed]').onchange=e=>{snapshot();layer.pathClosed=e.target.checked;draw()};
  box.querySelector('[data-path-key]').onclick=()=>{snapshot();if(layer.pathKeys?.length){layer.pathPoints=structuredClone(pathAtTime(layer));delete layer.pathKeys}else layer.pathKeys=[{t:+t.toFixed(4),points:structuredClone(layer.pathPoints)}];renderUI();draw()};
  box.querySelector('[data-edit]').onclick=()=>{penMode=false;pathEditing=!pathEditing;selectedPoint=-1;selectedKey=null;updatePathOverlay();toast(pathEditing?'路径编辑已开启':'路径编辑已关闭')};document.querySelector('#inspector').append(box);
};
const drawBeforePath=draw;draw=function(){drawBeforePath();updatePathOverlay()};
const renderBeforePath=renderUI;renderUI=function(){renderBeforePath();document.querySelectorAll('#tracks .track').forEach((track,index)=>{for(const key of project.layers[index]?.pathKeys||[]){const marker=document.createElement('div');marker.className='key path-key';marker.title='路径形变关键帧';marker.style.left=`calc(${key.t/15*100}% - 4px)`;marker.onpointerdown=event=>{event.stopPropagation();snapshot();const ruler=document.querySelector('#ruler').getBoundingClientRect();marker.setPointerCapture(event.pointerId);marker.onpointermove=e=>{if(e.buttons){key.t=+clamp((e.clientX-ruler.left)/ruler.width*15,0,15).toFixed(3);marker.style.left=`calc(${key.t/15*100}% - 4px)`}};marker.onpointerup=()=>{project.layers[index].pathKeys.sort((a,b)=>a.t-b.t);renderUI();draw()}};track.append(marker)}});updatePathOverlay()};
const endBeforePath=videoExport.end;videoExport.end=function(){endBeforePath();updatePathOverlay()};
window.addEventListener('resize',updatePathOverlay);renderUI();
