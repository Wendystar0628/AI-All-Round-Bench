// Geometry nodes operate on lightweight, serializable contour instances.
function applyLayerEffects(context, layer, accumulating=false) {
  const blend = {normal:'source-over', add:'lighter', screen:'screen', multiply:'multiply', overlay:'overlay'};
  context.globalCompositeOperation = accumulating ? 'lighter' : (blend[layer.blend] || 'source-over');
  const blur = Math.max(0,val(layer,'blur',0));
  const glow = Math.max(0,val(layer,'glow',0));
  const shadow = Math.max(0,val(layer,'shadow',0));
  const hue = val(layer,'hue',0);
  const saturation = Math.max(0,val(layer,'saturation',100));
  const brightness = Math.max(0,val(layer,'brightness',100));
  const filters = [];
  if (blur) filters.push(`blur(${Math.min(blur,100)}px)`);
  if (glow) filters.push(`drop-shadow(0px 0px ${Math.min(glow,100)}px ${layer.glowColor || '#ff894d'})`);
  if (shadow) filters.push(`drop-shadow(${shadow/2}px ${shadow/2}px ${shadow}px #000000aa)`);
  if (hue || saturation!==100 || brightness!==100) filters.push(`hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${brightness}%)`);
  context.filter = filters.join(' ') || 'none';
}
function drawTextLayer(context, layer) {
  const lines=(layer.content || '文字').split('\n');
  const fontSize=layer.fontSize || 100, lineHeight=layer.lineHeight || 1.2, spacing=layer.letterSpacing || 0;
  context.textAlign='left';
  lines.forEach((line,index)=>{
    const characters=Array.from(line);
    const widths=characters.map(char=>context.measureText(char).width);
    const total=widths.reduce((a,b)=>a+b,0)+Math.max(0,characters.length-1)*spacing;
    const align=layer.textAlign || 'center';
    let x=align==='left'?480:align==='right'?480-total:480-total/2;
    const y=270+(index-(lines.length-1)/2)*fontSize*lineHeight;
    characters.forEach((char,i)=>{context.fillText(char,x,y);x+=widths[i]+spacing});
  });
}
const sampleSurface=document.createElement('canvas');sampleSurface.width=W;sampleSurface.height=H;
const sampleContext=sampleSurface.getContext('2d');
const maskSurface=document.createElement('canvas');maskSurface.width=W;maskSurface.height=H;
const maskContext=maskSurface.getContext('2d');
const matteSurface=document.createElement('canvas');matteSurface.width=W;matteSurface.height=H;
const matteContext=matteSurface.getContext('2d',{willReadFrequently:true});
function applyLayerMasks(context, layer) {
  for (const mask of (layer.masks || [])) {
    if (mask.enabled === false) continue;
    const x=480+val(mask,'x',0),y=270+val(mask,'y',0),width=Math.max(1,val(mask,'width',200)),height=Math.max(1,val(mask,'height',120));
    const feather=Math.max(0,Math.min(100,val(mask,'feather',0)));
    maskContext.save();maskContext.setTransform(1,0,0,1,0,0);maskContext.clearRect(0,0,W,H);
    if(mask.inverted){maskContext.fillStyle='#fff';maskContext.fillRect(0,0,W,H);maskContext.globalCompositeOperation='destination-out'}
    const source=mask.type==='path'?project.layers.find(item=>item.id===mask.sourceId && !item.role && item.type==='形状'):null;
    transform(maskContext,source||layer);maskContext.globalAlpha=1;
    maskContext.filter=feather?`blur(${feather}px)`:'none';maskContext.fillStyle='#fff';
    if(mask.type==='path'){if(source && t>=source.start && t<=source.end)drawGeometry(maskContext,source)}
    else{maskContext.beginPath();if(mask.type==='ellipse')maskContext.ellipse(x,y,width/2,height/2,0,0,Math.PI*2);else maskContext.rect(x-width/2,y-height/2,width,height);maskContext.fill()}
    maskContext.restore();
    context.save();context.setTransform(1,0,0,1,0,0);context.globalCompositeOperation='destination-in';context.globalAlpha=1;context.filter='none';context.drawImage(maskSurface,0,0);context.restore();
  }
}
function drawLayerContent(context,layer){
  context.save();transform(context,layer);applyLayerEffects(context,layer);context.globalCompositeOperation='source-over';context.fillStyle=layer.fill||'#e8a16e';
  if(layer.type==='文字'){context.textBaseline='middle';context.font=`bold ${layer.fontSize||100}px Microsoft YaHei, sans-serif`;if(!(val(layer,'extrusion',0)>0 && typeof drawExtrudedText==='function' && drawExtrudedText(context,layer)))drawTextLayer(context,layer)}
  else if(layer.type==='形状')drawGeometry(context,layer);
  else if(layer.type==='粒子' && typeof drawParticleLayer==='function')drawParticleLayer(context,layer);
  context.restore();applyLayerMasks(context,layer);
}
function applyTrackMatte(context,layer){
  if(!layer.matteId)return;
  const source=project.layers.find(item=>item.id===layer.matteId && !item.role && ['形状','文字'].includes(item.type));
  matteContext.setTransform(1,0,0,1,0,0);matteContext.clearRect(0,0,W,H);
  if(source && t>=source.start && t<=source.end)drawLayerContent(matteContext,source);
  if(layer.matteMode==='luma' || layer.matteMode==='luma-invert'){
    const image=matteContext.getImageData(0,0,W,H),data=image.data;
    for(let i=0;i<data.length;i+=4)data[i+3]=Math.round(data[i+3]*(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255);
    matteContext.putImageData(image,0,0);
  }
  context.save();context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.filter='none';context.globalCompositeOperation=(layer.matteMode||'alpha').endsWith('invert')?'destination-out':'destination-in';context.drawImage(matteSurface,0,0);context.restore();
}
const motionSurface = document.createElement('canvas');
motionSurface.width=W; motionSurface.height=H;
const motionContext=motionSurface.getContext('2d');
function renderOrdinaryLayer(context, layer) {
  const originalTime=t;
  let samples=project.motionBlur && layer.motionBlur ? 8 : 1;
  const shutter=clamp((project.shutterAngle ?? 180)/360,0,2)/30;
  const phase=(project.shutterPhase ?? -90)/360/30;
  if(samples>1 && layer.type!=='粒子' && !layer.matteId && !(layer.masks||[]).some(mask=>mask.type==='path' && mask.sourceId) && !(layer.graph?.nodes||[]).some(node=>node.type==='boolean' && node.otherId)){
    const properties=['x','y','scale','rotation','opacity','blur','glow','shadow','hue','saturation','brightness','extrusion','rotateX','rotateY','metal','roughness'];
    const signature=when=>{
      t=when;const matrix=worldMatrix(layer);
      return [matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].concat(
        properties.map(p=>val(layer,p,propertyDefaults[p]??0)),
        (layer.masks||[]).flatMap(m=>['x','y','width','height','feather'].map(p=>val(m,p,m[p]??0))),
        (layer.graph?.nodes||[]).flatMap(n=>Object.keys(n.anim||{}).map(p=>val(n,p,n[p]??0))),
        layer.shapeKind==='path'?pathAtTime(layer).flatMap(p=>[p.x,p.y,p.inX||0,p.inY||0,p.outX||0,p.outY||0]):[],
        layer.type==='形状'&&typeof activeFields==='function'&&activeFields().length?geometryResult(layer).flatMap(shape=>contourForShape(shape,layer).flat()):[]
      ).join(',');
    };
    try { const first=signature(originalTime+phase);if(first===signature(originalTime+phase+shutter/2) && first===signature(originalTime+phase+shutter)) samples=1; }
    finally {t=originalTime}
  }
  const target=samples>1 ? motionContext : context;
  if(samples>1){target.setTransform(1,0,0,1,0,0);target.clearRect(0,0,W,H)}
  try {
    for(let i=0;i<samples;i++){
      t=originalTime+(samples===1?0:phase+shutter*(i+.5)/samples);
      if(t<layer.start || t>layer.end)continue;
      sampleContext.setTransform(1,0,0,1,0,0);sampleContext.clearRect(0,0,W,H);
      drawLayerContent(sampleContext,layer);applyTrackMatte(sampleContext,layer);
      target.save();target.globalCompositeOperation=samples>1?'lighter':(({normal:'source-over',add:'lighter',screen:'screen',multiply:'multiply',overlay:'overlay'})[layer.blend]||'source-over');target.globalAlpha=1/samples;target.drawImage(sampleSurface,0,0);target.restore();
    }
  } finally {t=originalTime;}
  if(samples>1){context.save();context.globalCompositeOperation=({normal:'source-over',add:'lighter',screen:'screen',multiply:'multiply',overlay:'overlay'})[layer.blend]||'source-over';context.drawImage(motionSurface,0,0);context.restore()}
}
let cachedGlyph = null;
function glyphImpactPoint(character, strike, when) {
  const hero=project.layers.find(layer=>layer.role==='hero');
  if (!hero) return {x:500,y:305};
  if (!cachedGlyph || cachedGlyph.character!==character) {
    const surface=document.createElement('canvas'); surface.width=W; surface.height=H;
    const g=surface.getContext('2d',{willReadFrequently:true});
    g.fillStyle='#fff';g.textAlign='center';g.textBaseline='alphabetic';g.font='900 330px "Microsoft YaHei", sans-serif';g.fillText(character,480,360);
    const pixels=g.getImageData(0,0,W,H).data, points=[];
    for(let y=130;y<370;y+=5)for(let x=340;x<620;x+=5)if(pixels[(y*W+x)*4+3]>100)points.push({x,y});
    cachedGlyph={character,points};
  }
  const points=cachedGlyph.points;
  const target=[{x:500,y:265},{x:520,y:300},{x:485,y:320}][strike%3];
  let best=target, distance=Infinity;
  for(const point of points){const d=(point.x-target.x)**2+(point.y-target.y)**2;if(d<distance){distance=d;best=point}}
  const saved=t;try{
    t=when; const point=worldMatrix(hero).transformPoint(new DOMPoint(best.x,best.y)),field=typeof fieldVectorAt==='function'&&hero.fieldsEnabled!==false?fieldVectorAt(point.x,point.y,when):{x:0,y:0};
    return {x:point.x+field.x,y:point.y+field.y};
  } finally {t=saved}
}
function defaultGeometryGraph() {
  return {nodes:[{id:1,type:'source',input:null},{id:2,type:'output',input:1}], nextId:3};
}
function geometryResult(layer, visiting=new Set()) {
  if(visiting.has(layer))throw new Error('几何图层存在循环引用');
  visiting.add(layer);
  const graph = layer.graph || defaultGeometryGraph();
  const stack = new Set();
  function compute(id) {
    const node = graph.nodes.find(n => n.id === id);
    if (!node) return [];
    if (stack.has(id)) throw new Error('节点存在循环连接');
    stack.add(id);
    try {
      if (node.type === 'source') return [{kind:layer.shapeKind || 'rect',source:layer,x:0,y:0,angle:0,scale:1}];
      const input = compute(node.input);
      if(node.type==='boolean'){
        const other=project.layers.find(item=>item.id===node.otherId && item.type==='形状' && !item.role);
        if(!other)return input;
        const determinant=worldMatrix(layer);if(Math.abs(determinant.a*determinant.d-determinant.b*determinant.c)<1e-8)throw new Error('当前图层缩放为零');
        const matrix=determinant.inverse().multiply(worldMatrix(other));
        const second=geometryResult(other,visiting);
        return [{kind:'boolean',a:input,b:[{kind:'group',matrix,children:second}],op:node.operation||'union',x:0,y:0,angle:0,scale:1}];
      }
      if (node.type === 'repeat') {
        const result=[];
        for (let i=0;i<Math.max(1,Math.min(30,Math.round(val(node,'count',4))));i++) {
          for (const shape of input) result.push({...shape,x:shape.x+i*val(node,'dx',45),y:shape.y+i*val(node,'dy',0),angle:shape.angle+i*val(node,'angle',0)});
        }
        return result;
      }
      if (node.type === 'transform') return input.map(shape=>({...shape,x:shape.x+val(node,'dx',0),y:shape.y+val(node,'dy',0),angle:shape.angle+val(node,'angle',0),scale:shape.scale*val(node,'scale',100)/100}));
      if (node.type === 'trim') return input.map(shape=>({...shape,trimStart:clamp(val(node,'start',0)/100),trimEnd:clamp(val(node,'end',100)/100)}));
      return input;
    } finally { stack.delete(id); }
  }
  try { layer.graphError=''; return compute(graph.nodes.find(n=>n.type==='output')?.id); }
  catch(error) { if(visiting.size>1)throw error;layer.graphError=error.message; return []; }
  finally {visiting.delete(layer)}
}
function drawGeometry(context, layer) {
  const result=geometryResult(layer);
  if(val(layer,'extrusion',0)>0 && typeof drawExtruded==='function' && drawExtruded(context,layer,result))return;
  if(typeof activeFields==='function' && layer.fieldsEnabled!==false && activeFields().length && result.every(shape=>['rect','ellipse','path'].includes(shape.kind)&&shape.trimStart===undefined&&(shape.kind!=='path'||(shape.source||layer).pathClosed!==false))){
    for(const shape of result){const points=contourForShape(shape,layer);if(points.length<3)continue;context.beginPath();context.moveTo(480+points[0][0],270+points[0][1]);for(let i=1;i<points.length;i++)context.lineTo(480+points[i][0],270+points[i][1]);context.closePath();context.fillStyle=layer.fill||'#e8a16e';context.fill();if(layer.strokeWidth>0){context.strokeStyle=layer.stroke||'#fff';context.lineWidth=layer.strokeWidth;context.stroke()}}
    return;
  }
  drawGeometryInstances(context,result,layer,false);
}
function drawGeometryInstances(context,shapes,styleLayer,asMask){
  for (const shape of shapes) {
    context.save();
    if(shape.kind==='group'){
      const m=shape.matrix;context.transform(m.a,m.b,m.c,m.d,m.e,m.f);drawGeometryInstances(context,shape.children,styleLayer,asMask);context.restore();continue;
    }
    if(shape.trimStart!==undefined && ['rect','ellipse','path'].includes(shape.kind)){
      const points=trimContour(shapeContour(shape,styleLayer),shape.trimStart,shape.trimEnd);
      if(points.length>1){context.beginPath();context.moveTo(480+points[0][0],270+points[0][1]);for(let i=1;i<points.length;i++)context.lineTo(480+points[i][0],270+points[i][1]);context.strokeStyle=asMask?'#fff':(styleLayer.stroke||styleLayer.fill||'#e8a16e');context.lineWidth=styleLayer.strokeWidth||4;context.lineCap='round';context.stroke()}
      context.restore();continue;
    }
    context.translate(480+(shape.x||0),270+(shape.y||0));context.rotate((shape.angle||0)*Math.PI/180);context.scale(shape.scale??1,shape.scale??1);
    if(shape.kind==='boolean'){
      const first=document.createElement('canvas'),second=document.createElement('canvas');first.width=second.width=W;first.height=second.height=H;
      const a=first.getContext('2d'),b=second.getContext('2d');
      drawGeometryInstances(a,shape.a,styleLayer,true);drawGeometryInstances(b,shape.b,styleLayer,true);
      a.globalCompositeOperation=shape.op==='difference'?'destination-out':shape.op==='intersect'?'destination-in':'source-over';a.drawImage(second,0,0);
      a.globalCompositeOperation='source-in';a.fillStyle=asMask?'#ffffff':(styleLayer.fill||'#e8a16e');a.fillRect(0,0,W,H);
      context.drawImage(first,-480,-270);context.restore();continue;
    }
    const source=shape.source||styleLayer,width=source.width||200,height=source.height||120;
    if(shape.trimStart!==undefined){
      const points=[];
      if(shape.kind==='ellipse'){for(let i=0;i<=180;i++){const a=-Math.PI/2+Math.PI*2*i/180;points.push([Math.cos(a)*width/2,Math.sin(a)*height/2])}}
      else if(shape.kind==='path')points.push(...sampleBezierPath(source));
      else points.push([-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2],[-width/2,-height/2]);
      if(points.length<2){context.restore();continue}
      const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
      const total=lengths[lengths.length-1],start=shape.trimStart*total,end=shape.trimEnd*total;
      if(end>start){context.beginPath();let started=false;for(let i=1;i<points.length;i++){let a=lengths[i-1],b=lengths[i];if(b<start||a>end)continue;let from=clamp((start-a)/(b-a)),to=clamp((end-a)/(b-a));let p=points[i-1],q=points[i];if(!started){context.moveTo(p[0]+(q[0]-p[0])*from,p[1]+(q[1]-p[1])*from);started=true}context.lineTo(p[0]+(q[0]-p[0])*to,p[1]+(q[1]-p[1])*to)}context.strokeStyle=asMask?'#fff':(styleLayer.stroke||styleLayer.fill||'#e8a16e');context.lineWidth=styleLayer.strokeWidth||4;context.lineCap='round';context.stroke()}
    } else {
      context.beginPath();
      if (shape.kind==='ellipse') context.ellipse(0,0,width/2,height/2,0,0,Math.PI*2);
      else if(shape.kind==='path')traceBezierPath(context,source);
      else context.rect(-width/2,-height/2,width,height);
      context.fillStyle=asMask?'#fff':(styleLayer.fill||'#e8a16e');
      if(shape.kind!=='path'||source.pathClosed!==false)context.fill();
      if (!asMask && (styleLayer.strokeWidth>0 || (shape.kind==='path' && source.pathClosed===false))) { context.strokeStyle=styleLayer.stroke || styleLayer.fill || '#ffffff'; context.lineWidth=styleLayer.strokeWidth||3; context.stroke(); }
    }
    context.restore();
  }
}
function pathAtTime(layer){
  const keys=layer.pathKeys;if(!keys?.length)return layer.pathPoints||[];
  let a=keys[0],b=keys[keys.length-1];
  if(t<=a.t)return a.points;if(t>=b.t)return b.points;
  for(let i=1;i<keys.length;i++)if(t<=keys[i].t){a=keys[i-1];b=keys[i];break}
  if(a.points.length!==b.points.length)return a.points;
  const amount=(t-a.t)/(b.t-a.t),fields=['x','y','inX','inY','outX','outY'];
  return a.points.map((point,i)=>Object.fromEntries(fields.map(field=>[field,(point[field]||0)+((b.points[i][field]||0)-(point[field]||0))*amount])));
}
function traceBezierPath(context,layer){
  const vertices=pathAtTime(layer);if(!vertices.length)return;
  context.moveTo(vertices[0].x,vertices[0].y);
  const segments=layer.pathClosed===false?vertices.length-1:vertices.length;
  for(let i=0;i<segments;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];context.bezierCurveTo(a.x+(a.outX||0),a.y+(a.outY||0),b.x+(b.inX||0),b.y+(b.inY||0),b.x,b.y)}
  if(layer.pathClosed!==false)context.closePath();
}
function sampleBezierPath(layer){
  const v=pathAtTime(layer);if(v.length<2)return [];
  const result=[[v[0].x,v[0].y]],segments=layer.pathClosed===false?v.length-1:v.length;
  for(let i=0;i<segments;i++){const a=v[i],b=v[(i+1)%v.length];for(let j=1;j<=24;j++){const u=j/24,k=1-u;result.push([k*k*k*a.x+3*k*k*u*(a.x+(a.outX||0))+3*k*u*u*(b.x+(b.inX||0))+u*u*u*b.x,k*k*k*a.y+3*k*k*u*(a.y+(a.outY||0))+3*k*u*u*(b.y+(b.inY||0))+u*u*u*b.y])}}
  return result;
}
function shapeContour(shape,owner){
  const source=shape.source||owner,open=shape.kind==='path'&&source.pathClosed===false;
  let points=contourForShape(shape,owner);
  if(open){const angle=(shape.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),z=shape.scale??1;points=sampleBezierPath(source).map(([x,y])=>[(x*c-y*s)*z+(shape.x||0),(x*s+y*c)*z+(shape.y||0)]);if(typeof deformContour==='function')points=deformContour(points,owner)}
  return !open&&points.length?[...points,points[0]]:points;
}
function trimContour(points,start,end){
  if(points.length<2 || end<=start)return [];
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const total=lengths[lengths.length-1],from=clamp(start)*total,to=clamp(end)*total,result=[];
  if(total<=1e-8)return result;
  for(let i=1;i<points.length;i++){const a=lengths[i-1],b=lengths[i];if(b<from||a>to||b-a<1e-8)continue;const p=points[i-1],q=points[i],u=clamp((from-a)/(b-a)),v=clamp((to-a)/(b-a));if(!result.length)result.push([p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u]);result.push([p[0]+(q[0]-p[0])*v,p[1]+(q[1]-p[1])*v])}
  return result;
}

function openGeometryNodes() {
  const layer=project.layers[selected];
  if (!layer || layer.role || layer.type!=='形状') { toast('请选择普通形状图层'); return; }
  const old=document.querySelector('.node-overlay'); if(old){old.remove();return;}
  if (!layer.graph) { snapshot(); layer.graph=defaultGeometryGraph(); }
  const overlay=document.createElement('div'); overlay.className='node-overlay';
  document.querySelector('.track-area').append(overlay);
  function update() {
    const graph=layer.graph;
    overlay.innerHTML=`<div class="node-header"><b>程序节点 / ${layer.name.replace(/[&<>]/g,'')}</b><span>几何端口 · 输入由下拉菜单连接</span><button data-add="repeat">＋ 重复器</button><button data-add="transform">＋ 变换</button><button data-add="trim">＋ 修剪</button><button data-add="boolean">＋ 布尔</button><button data-close>关闭 ×</button></div><div class="node-cards"></div><div class="node-message"></div>`;
    const cards=overlay.querySelector('.node-cards');
    const names={source:'形状输入',repeat:'重复器',transform:'变换',trim:'修剪路径',boolean:'布尔运算',output:'几何输出'};
    for(const node of graph.nodes){
      const card=document.createElement('div');card.className='node-card';
      const sources=graph.nodes.filter(n=>n.id!==node.id && n.type!=='output');
      const fields=node.type==='repeat'?[['count','数量',4],['dx','偏移 X',45],['dy','偏移 Y',0],['angle','递增旋转',0]]:node.type==='transform'?[['dx','位置 X',0],['dy','位置 Y',0],['angle','旋转',0],['scale','缩放 %',100]]:node.type==='trim'?[['start','起点 %',0],['end','终点 %',100]]:[];
      card.innerHTML=`<div class="node-title"><i></i>${names[node.type]} <small>#${node.id}</small>${['repeat','transform','trim','boolean'].includes(node.type)?'<button data-remove>×</button>':''}</div>${node.type!=='source'?`<label>输入 <select data-input><option value="">未连接</option>${sources.map(n=>`<option value="${n.id}">${names[n.type]} #${n.id}</option>`).join('')}</select></label>`:'<p>读取图层轮廓</p>'}${node.type==='boolean'?'<label>运算 <select data-operation><option value="union">并集</option><option value="difference">差集</option><option value="intersect">交集</option></select></label><label>第二形状 <select data-other><option value="">未连接</option></select></label>':''}${fields.map(([key,label,def])=>`<label>${label}<input type="number" data-param="${key}" value="${+val(node,key,def).toFixed(2)}"><button data-node-key="${key}" title="开关关键帧">${node.anim?.[key]?'◆':'◇'}</button></label>`).join('')}<div class="node-port">● 几何</div>`;
      if(node.type!=='source'){let select=card.querySelector('[data-input]');select.value=String(node.input??'');select.onchange=()=>{snapshot();node.input=select.value?Number(select.value):null;draw();update()};}
      if(node.type==='boolean'){
        const operation=card.querySelector('[data-operation]'),other=card.querySelector('[data-other]');
        project.layers.filter(item=>item!==layer && item.type==='形状' && !item.role).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;other.append(option)});
        operation.value=node.operation||'union';other.value=node.otherId||'';
        operation.onchange=()=>{snapshot();node.operation=operation.value;draw();update()};other.onchange=()=>{snapshot();node.otherId=other.value||null;draw();update()};
      }
      card.querySelectorAll('[data-param]').forEach(input=>input.onchange=()=>{const number=Number(input.value);if(!Number.isFinite(number))return;snapshot();setVal(node,input.dataset.param,number);draw();update();renderUI()});
      card.querySelectorAll('[data-node-key]').forEach(button=>button.onclick=()=>{const key=button.dataset.nodeKey,def=fields.find(field=>field[0]===key)[2];snapshot();node.anim ||= {};if(node.anim[key]){node[key]=val(node,key,def);delete node.anim[key]}else node.anim[key]=[{t:+t.toFixed(4),v:val(node,key,def)}];draw();update();renderUI()});
      const remove=card.querySelector('[data-remove]');if(remove)remove.onclick=()=>{snapshot();graph.nodes=graph.nodes.filter(n=>n!==node);graph.nodes.forEach(n=>{if(n.input===node.id)n.input=node.input});draw();update()};
      cards.append(card);
    }
    const result=geometryResult(layer); overlay.querySelector('.node-message').textContent=layer.graphError || `输出 ${result.length} 个轮廓实例 · 修改输入或参数会更新画布`;
    overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
    overlay.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{snapshot();const output=graph.nodes.find(n=>n.type==='output');const node={id:graph.nextId++,type:button.dataset.add,input:output.input};output.input=node.id;graph.nodes.splice(graph.nodes.length-1,0,node);draw();update()});
  }
  update();
}
document.querySelector('#nodes').onclick=openGeometryNodes;
