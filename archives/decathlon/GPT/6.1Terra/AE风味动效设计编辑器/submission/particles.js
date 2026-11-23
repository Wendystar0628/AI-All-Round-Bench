// Re-simulate from birth for every requested time: seeking never advances shared state.
function particleRandom(seed,index,channel){return rand(seed*997+index*43+channel*113)}
function particleSettings(layer){
  const read=(key,def)=>val(layer,key,def);
  return {rate:clamp(read('rate',25),0,200),life:clamp(read('life',2),.05,8),speed:Math.max(0,read('speed',130)),spread:clamp(read('spread',100),0,360),direction:read('direction',-90),gravity:read('gravity',120),wind:read('wind',0),drag:Math.max(0,read('drag',.15)),seed:Math.round(read('seed',4)),size:Math.max(.1,read('particleSize',3)),trail:clamp(read('trail',.2),0,2),collision:!!layer.collision,plane:read('collisionY',460),bounce:clamp(read('bounce',.5),0,1),friction:clamp(read('friction',.2),0,1),attract:read('attract',0),attractX:read('attractX',480),attractY:read('attractY',270)};
}
let collisionCache=new Map();
function collisionSegments(layer,when){
  const cacheKey=`${layer.id}:${when.toFixed(5)}`;if(collisionCache.has(cacheKey))return collisionCache.get(cacheKey);
  const saved=t;t=when;
  try{
    const matrix=worldMatrix(layer),segments=[];
    for(const shape of geometryResult(layer)){
      if(!['rect','ellipse','path'].includes(shape.kind))continue;
      let points=shapeContour(shape,layer);if(shape.trimStart!==undefined)points=trimContour(points,shape.trimStart,shape.trimEnd);
      if(points.length<2)continue;
      points=points.map(([x,y])=>matrix.transformPoint(new DOMPoint(480+x,270+y)));
      for(let i=1;i<points.length;i++)segments.push({a:points[i-1],b:points[i]});
    }
    collisionCache.set(cacheKey,segments);return segments;
  } finally{t=saved}
}
function collisionResponse(from,to,velocity,settings,time,step){
  const collider=settings.collider;if(!collider || time<collider.start || time>collider.end)return null;
  const current=collisionSegments(collider,time),previous=collisionSegments(collider,time-step);
  const rx=to.x-from.x,ry=to.y-from.y;let nearest=null;
  current.forEach((segment,index)=>{
    const sx=segment.b.x-segment.a.x,sy=segment.b.y-segment.a.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-8)return;
    const qx=segment.a.x-from.x,qy=segment.a.y-from.y,u=(qx*sy-qy*sx)/den,v=(qx*ry-qy*rx)/den;
    if(u<0||u>1||v<0||v>1||(nearest&&u>=nearest.u))return;
    const old=previous[index]||segment,svx=((segment.a.x-old.a.x)*(1-v)+(segment.b.x-old.b.x)*v)/step,svy=((segment.a.y-old.a.y)*(1-v)+(segment.b.y-old.b.y)*v)/step;
    const length=Math.hypot(sx,sy)||1;let nx=-sy/length,ny=sx/length,rvx=velocity.x-svx,rvy=velocity.y-svy;if(rvx*nx+rvy*ny>0){nx=-nx;ny=-ny}
    const normalSpeed=rvx*nx+rvy*ny;if(normalSpeed>=0)return;
    const tangentX=rvx-normalSpeed*nx,tangentY=rvy-normalSpeed*ny;
    nearest={u,x:from.x+u*rx+nx*.1,y:from.y+u*ry+ny*.1,vx:svx+tangentX*(1-settings.friction)-normalSpeed*settings.bounce*nx,vy:svy+tangentY*(1-settings.friction)-normalSpeed*settings.bounce*ny};
  });
  return nearest;
}
function simulateParticle(origin,birth,time,index,settings,radial=false){
  const age=time-birth;if(age<0||age>settings.life)return null;
  const random=channel=>particleRandom(settings.seed,index,channel);
  const angle=(radial?random(1)*360:settings.direction+(random(1)-.5)*settings.spread)*Math.PI/180;
  const speed=settings.speed*(.5+random(2)),dt=1/30;
  let x=origin.x,y=origin.y,vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed,elapsed=0;
  const trail=[{x,y,time:0}];
  while(elapsed<age-1e-8){
    const step=Math.min(dt,age-elapsed),dx=settings.attractX-x,dy=settings.attractY-y,d=Math.max(25,Math.hypot(dx,dy));
    const field=settings.fieldsEnabled && typeof fieldVectorAt==='function'?fieldVectorAt(x,y,birth+elapsed):{x:0,y:0};
    vx+=(settings.wind+settings.attract*dx/d+field.x)*step;vy+=(settings.gravity+settings.attract*dy/d+field.y)*step;
    const damping=Math.exp(-settings.drag*step);vx*=damping;vy*=damping;
    const previousX=x,previousY=y;x+=vx*step;y+=vy*step;
    if(settings.collision && settings.collider){const hit=collisionResponse({x:previousX,y:previousY},{x,y},{x:vx,y:vy},settings,birth+elapsed+step,step);if(hit){x=hit.x+hit.vx*step*(1-hit.u);y=hit.y+hit.vy*step*(1-hit.u);vx=hit.vx;vy=hit.vy}}
    else if(settings.collision&&previousY<=settings.plane&&y>settings.plane&&vy>0){y=settings.plane-(y-settings.plane)*settings.bounce;vy=-vy*settings.bounce;vx*=1-settings.friction}
    elapsed+=step;trail.push({x,y,time:elapsed});
  }
  return {x,y,age,life:settings.life,trail:trail.filter(p=>p.time>=Math.max(0,age-settings.trail)),size:settings.size*(.6+.8*random(3))};
}
function samplePolyline(points,u){
  if(points.length<2)return points[0]||[0,0];const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const target=u*lengths[lengths.length-1];let i=1;while(i<lengths.length-1&&lengths[i]<target)i++;const f=(target-lengths[i-1])/(lengths[i]-lengths[i-1]||1);return [points[i-1][0]+(points[i][0]-points[i-1][0])*f,points[i-1][1]+(points[i][1]-points[i-1][1])*f];
}
let particleTextCache=null;
function sourcePoint(layer,source,index,seed,birth){
  const saved=t;t=birth;
  try{
    if(!source)return worldMatrix(layer).transformPoint(new DOMPoint(480,270));
    let point=[0,0],shape=null;
    if(source.role==='hero')return glyphImpactPoint(project.character,index%3,birth);
    if(source.type==='形状'){
      const shapes=geometryResult(source).filter(item=>['rect','ellipse','path'].includes(item.kind));shape=shapes[Math.floor(particleRandom(seed,index,4)*shapes.length)];
      if(shape){const u=particleRandom(seed,index,5);let contour=shapeContour(shape,source);if(shape.trimStart!==undefined)contour=trimContour(contour,shape.trimStart,shape.trimEnd);if(contour.length<2)return null;point=samplePolyline(contour,u)}
      else return null;
    } else if(source.type==='文字'){
      const signature=JSON.stringify([source.content,source.fontSize,source.lineHeight,source.letterSpacing,source.textAlign]);
      if(particleTextCache?.signature!==signature){const surface=document.createElement('canvas');surface.width=W;surface.height=H;const g=surface.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.textBaseline='middle';g.font=`bold ${source.fontSize||100}px Microsoft YaHei,sans-serif`;drawTextLayer(g,source);const pixels=g.getImageData(0,0,W,H).data,points=[];for(let y=0;y<H;y+=4)for(let x=0;x<W;x+=4)if(pixels[(y*W+x)*4+3]>128)points.push([x-480,y-270]);particleTextCache={signature,points}}
      const points=particleTextCache.points;point=points[Math.floor(particleRandom(seed,index,5)*points.length)]||[0,0];if(val(source,'extrusion',0)>0&&typeof deformContour==='function')point=deformContour([point],source)[0];
    }
    return worldMatrix(source).transformPoint(new DOMPoint(480+point[0],270+point[1]));
  } finally{t=saved}
}
function paintParticle(context,particle,settings,toLocal){
  const fade=clamp(1-particle.age/particle.life),points=particle.trail.map(p=>toLocal(p.x,p.y));
  context.save();context.globalAlpha*=fade;context.lineCap='round';
  if(points.length>1){context.beginPath();context.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)context.lineTo(points[i].x,points[i].y);context.strokeStyle='#ff9a40';context.lineWidth=Math.max(.5,particle.size*.45);context.stroke()}
  const point=toLocal(particle.x,particle.y);context.fillStyle=particle.age/particle.life<.3?'#fff0b2':'#ff7830';context.beginPath();context.arc(point.x,point.y,Math.max(.3,particle.size*fade),0,Math.PI*2);context.fill();context.restore();
}
function drawParticleLayer(context,layer){
  collisionCache=new Map();const now=t,settings=particleSettings(layer),inverse=worldMatrix(layer).inverse(),toLocal=(x,y)=>inverse.transformPoint(new DOMPoint(x,y));settings.collider=project.layers.find(item=>item.id===layer.colliderId && item.type==='形状' && !item.role);settings.fieldsEnabled=layer.fieldsEnabled!==false;
  if(!settings.rate)return;
  const source=project.layers.find(item=>item.id===layer.sourceId),first=Math.max(0,Math.ceil((now-layer.start-settings.life)*settings.rate)),last=Math.floor((now-layer.start)*settings.rate);
  for(let i=first;i<=last;i++){const birth=layer.start+i/settings.rate;if(birth>layer.end)break;const origin=sourcePoint(layer,source,i,settings.seed,birth);if(!origin)continue;const particle=simulateParticle(origin,birth,now,i,settings);if(particle)paintParticle(context,particle,settings,toLocal)}
}
function drawForgeSparks(context,layer){
  const now=t,settings=particleSettings(layer);settings.fieldsEnabled=layer.fieldsEnabled!==false;settings.life=clamp(val(layer,'life',2.8),.05,8);settings.speed=Math.max(0,val(layer,'speed',150));settings.gravity=val(layer,'gravity',170);settings.size=Math.max(.1,val(layer,'particleSize',1.7));settings.trail=clamp(val(layer,'trail',.10),0,2);settings.collision=layer.collision!==false;settings.plane=val(layer,'collisionY',460);
  const count=Math.round(clamp(val(layer,'burstCount',62),0,200));
  [6.3,7.5,8.6].forEach((hit,k)=>{if(now<hit||now>hit+settings.life)return;const origin=glyphImpactPoint(project.character,k,hit);for(let i=0;i<count;i++){const birth=hit+particleRandom(settings.seed,i+k*211,7)*.08,particle=simulateParticle(origin,birth,now,i+k*211,settings,true);if(particle)paintParticle(context,particle,settings,(x,y)=>({x,y}))}});
}

const particleButton=document.createElement('button');particleButton.textContent='＋ 粒子';particleButton.title='添加粒子发射器';particleButton.onclick=()=>{snapshot();project.layers.unshift({name:'粒子发射器',type:'粒子',icon:'✦',color:'gold',start:t,end:15,keys:[],x:480,y:270,scale:100,rotation:0,opacity:100,rate:25,life:2,speed:130,gravity:120,seed:4,particleSize:3,trail:.2});selected=0;renderUI();draw();toast('已添加粒子发射器')};
document.querySelector('.timeline-options').prepend(particleButton);
const inspectBeforeParticles=inspect;
inspect=function(){
  inspectBeforeParticles();const layer=project.layers[selected];if(layer?.type!=='粒子')return;
  const box=document.createElement('div');box.className='particle-settings';
  const fields=layer.role==='sparks'?[['burstCount','每次数量',62],['speed','初速度',150],['life','寿命 秒',2.8],['gravity','重力',170],['particleSize','大小',1.7],['trail','拖尾 秒',.1],['seed','随机种子',4]]:[['rate','每秒发射',25],['life','寿命 秒',2],['speed','初速度',130],['direction','方向 °',-90],['spread','扩散 °',100],['gravity','重力',120],['wind','水平力',0],['drag','阻力',.15],['particleSize','大小',3],['trail','拖尾 秒',.2],['seed','随机种子',4],['attract','吸引力',0],['attractX','吸引点 X',480],['attractY','吸引点 Y',270]];
  box.innerHTML=`<div class="section-title">⌄　${layer.role==='sparks'?'锻击火星':'粒子发射'}</div>${layer.role==='sparks'?'':`<div class="prop"><label>发射源</label><select data-source><option value="">点发射</option></select></div>`}${fields.map(([p,label])=>`<div class="prop"><label>${label}</label><input type="number" step="any" data-particle="${p}"><span class="diamond" data-particle-key="${p}">${layer.anim?.[p]?'◆':'◇'}</span></div>`).join('')}<div class="section-title">⌄　碰撞</div><div class="prop"><label>启用碰撞</label><input type="checkbox" data-collision></div>${layer.role==='sparks'?'':`<div class="prop"><label>碰撞对象</label><select data-collider><option value="">水平面</option></select></div>`}${[['collisionY','平面 Y',460],['bounce','弹性',.5],['friction','摩擦',.2]].map(([p,label])=>`<div class="prop"><label>${label}</label><input type="number" step="any" data-particle="${p}"><span class="diamond" data-particle-key="${p}">${layer.anim?.[p]?'◆':'◇'}</span></div>`).join('')}<p class="hint">粒子按出生时刻重新计算；拖尾取自实际轨迹。形状碰撞使用当前二维轮廓及相对速度。</p>`;
  const defaults=Object.fromEntries([...fields,['collisionY','',460],['bounce','',.5],['friction','',.2]].map(([p,,v])=>[p,v]));
  box.querySelectorAll('[data-particle]').forEach(input=>{const key=input.dataset.particle;input.value=+val(layer,key,defaults[key]).toFixed(2);input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value))return;snapshot();setVal(layer,key,value);renderUI();draw()}});
  box.querySelectorAll('[data-particle-key]').forEach(button=>button.onclick=()=>{const key=button.dataset.particleKey;snapshot();layer.anim ||= {};if(layer.anim[key]){layer[key]=val(layer,key,defaults[key]);delete layer.anim[key]}else layer.anim[key]=[{t:+t.toFixed(4),v:val(layer,key,defaults[key])}];renderUI();draw()});
  const collision=box.querySelector('[data-collision]');collision.checked=layer.role==='sparks'?layer.collision!==false:!!layer.collision;collision.onchange=()=>{snapshot();layer.collision=collision.checked;draw()};
  const source=box.querySelector('[data-source]');if(source){project.layers.filter(item=>item!==layer&&((!item.role&&['形状','文字'].includes(item.type))||item.role==='hero')).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;source.append(option)});source.value=layer.sourceId||'';source.onchange=()=>{snapshot();layer.sourceId=source.value||null;draw()}}
  const collider=box.querySelector('[data-collider]');if(collider){project.layers.filter(item=>item!==layer && !item.role && item.type==='形状').forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;collider.append(option)});collider.value=layer.colliderId||'';collider.onchange=()=>{snapshot();layer.colliderId=collider.value||null;draw()}}
  document.querySelector('#inspector').append(box);
};
renderUI();
