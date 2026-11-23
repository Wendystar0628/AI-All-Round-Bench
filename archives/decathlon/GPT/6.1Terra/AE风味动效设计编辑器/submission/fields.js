function activeFields(){return project.layers.filter(layer=>layer.type==='场' && layer.visible!==false && t>=layer.start && t<=layer.end)}
function snapshotFields(when=t){
  const saved=t;t=when;
  try{
    return activeFields().map(field=>{
      const matrix=worldMatrix(field),center=matrix.transformPoint(new DOMPoint(480,270));
      const radius=Math.max(1,val(field,'fieldRadius',180)*Math.hypot(matrix.a,matrix.b));
      return {center,radius,strength:val(field,'fieldStrength',80),kind:field.fieldKind||'distance',frequency:Math.max(.001,val(field,'fieldFrequency',.015)),phase:val(field,'fieldPhase',0)};
    });
  } finally{t=saved}
}
function evaluateFields(fields,x,y,when){
  let vx=0,vy=0;for(const field of fields){const dx=x-field.center.x,dy=y-field.center.y,d=Math.hypot(dx,dy);if(d>=field.radius)continue;const strength=field.strength*(1-smooth(0,field.radius,d)),length=Math.max(1,d);
    if(field.kind==='vortex'){vx+=-dy/length*strength;vy+=dx/length*strength}
    else if(field.kind==='noise'){const f=field.frequency,phase=field.phase;vx+=Math.sin(x*f+when*.7+phase)*Math.cos(y*f*.7+phase)*strength;vy+=Math.cos(y*f+when*.6+phase)*Math.sin(x*f*.7+phase)*strength}
    else{vx+=dx/length*strength;vy+=dy/length*strength}
  }return {x:vx,y:vy};
}
function fieldVectorAt(x,y,when=t){return evaluateFields(snapshotFields(when),x,y,when)}
function createDeformer(layer){
  const time=t,fields=layer.fieldsEnabled===false?[]:snapshotFields(time);if(!fields.length)return point=>point;
  const matrix=worldMatrix(layer),inverse=matrix.inverse();
  return ([x,y])=>{const wx=matrix.a*(480+x)+matrix.c*(270+y)+matrix.e,wy=matrix.b*(480+x)+matrix.d*(270+y)+matrix.f,field=evaluateFields(fields,wx,wy,time),px=wx+field.x,py=wy+field.y;return [inverse.a*px+inverse.c*py+inverse.e-480,inverse.b*px+inverse.d*py+inverse.f-270]};
}
function deformContour(points,layer){
  return points.map(createDeformer(layer));
}
const fieldTool=document.createElement('div');fieldTool.className='tool';fieldTool.title='添加空间场';fieldTool.textContent='◌';
document.querySelector('.tool[title="钢笔工具"]').after(fieldTool);
fieldTool.onclick=()=>{snapshot();project.layers.unshift({name:'距离场',type:'场',icon:'◌',color:'alt',start:t,end:15,keys:[],x:480,y:270,scale:100,rotation:0,opacity:100,fieldKind:'distance',fieldRadius:180,fieldStrength:80,fieldFrequency:.015,fieldPhase:0});selected=0;renderUI();draw();toast('已添加空间场')};
const inspectBeforeField=inspect;
inspect=function(){
  inspectBeforeField();const layer=project.layers[selected];if(!layer)return;
  if(layer.type==='场'){
    const box=document.createElement('div');box.className='field-settings';
    const fields=[['fieldRadius','半径',180],['fieldStrength','强度',80],['fieldFrequency','噪声频率',.015],['fieldPhase','噪声相位',0]];
    box.innerHTML=`<div class="section-title">⌄　空间场</div><div class="prop"><label>类型</label><select data-field-kind><option value="distance">距离衰减</option><option value="vortex">旋涡</option><option value="noise">噪声</option></select></div>${fields.map(([p,label])=>`<div class="prop"><label>${label}</label><input type="number" step="any" data-field-value="${p}"><span class="diamond" data-field-key="${p}">${layer.anim?.[p]?'◆':'◇'}</span></div>`).join('')}<p class="hint">场影响同一合成中的形状轮廓与粒子。正负强度改变方向。</p>`;
    const kind=box.querySelector('[data-field-kind]');kind.value=layer.fieldKind||'distance';kind.onchange=()=>{snapshot();layer.fieldKind=kind.value;draw()};
    box.querySelectorAll('[data-field-value]').forEach(input=>{const key=input.dataset.fieldValue,def=fields.find(x=>x[0]===key)[2];input.value=+val(layer,key,def).toFixed(4);input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value))return;snapshot();setVal(layer,key,value);draw();renderUI()}});
    box.querySelectorAll('[data-field-key]').forEach(button=>button.onclick=()=>{const key=button.dataset.fieldKey,def=fields.find(x=>x[0]===key)[2];snapshot();layer.anim ||= {};if(layer.anim[key]){layer[key]=val(layer,key,def);delete layer.anim[key]}else layer.anim[key]=[{t:+t.toFixed(4),v:val(layer,key,def)}];draw();renderUI()});
    document.querySelector('#inspector').append(box);
  } else if(!layer.role && (layer.type==='形状'||layer.type==='粒子')){
    const box=document.createElement('div');box.className='field-settings';box.innerHTML='<div class="prop"><label>响应空间场</label><input type="checkbox" data-fields-enabled></div>';
    const input=box.querySelector('input');input.checked=layer.fieldsEnabled!==false;input.onchange=()=>{snapshot();layer.fieldsEnabled=input.checked;draw()};document.querySelector('#inspector').append(box);
  }
};
const fieldOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');fieldOverlay.classList.add('field-overlay');document.querySelector('.canvas-wrap').append(fieldOverlay);
function updateFieldOverlay(){
  fieldOverlay.replaceChildren();const layer=project.layers[selected];if(exporting||layer?.type!=='场'||layer.visible===false)return;
  selectionFrame.style.display='none';const matrix=worldMatrix(layer),center=matrix.transformPoint(new DOMPoint(480,270)),p=overlayCoordinates(center),rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/W,rect.height/H),radius=Math.max(1,val(layer,'fieldRadius',180))*Math.hypot(matrix.a,matrix.b)*scale;
  for(const [name,attrs] of [['circle',{cx:p.x,cy:p.y,r:radius,class:'field-ring'}],['circle',{cx:p.x,cy:p.y,r:4,class:'field-center'}]]){const element=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([key,value])=>element.setAttribute(key,value));fieldOverlay.append(element)}
}
const drawBeforeFields=draw;draw=function(){drawBeforeFields();updateFieldOverlay()};
const renderBeforeFields=renderUI;renderUI=function(){renderBeforeFields();updateFieldOverlay()};
const endBeforeFields=videoExport.end;videoExport.end=function(){endBeforeFields();updateFieldOverlay()};
window.addEventListener('resize',updateFieldOverlay);renderUI();
// Keep row labels aligned with tracks when a composition has many layers.
const layerScroll=document.querySelector('#layers'),trackScroll=document.querySelector('#tracks');
layerScroll.addEventListener('scroll',()=>{if(trackScroll.scrollTop!==layerScroll.scrollTop)trackScroll.scrollTop=layerScroll.scrollTop});
trackScroll.addEventListener('scroll',()=>{if(layerScroll.scrollTop!==trackScroll.scrollTop)layerScroll.scrollTop=trackScroll.scrollTop});
