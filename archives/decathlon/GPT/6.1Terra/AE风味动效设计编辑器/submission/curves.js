let curveProperty='x',curveMode='value';
function curveSample(layer,property,when,mode){
  const saved=t;
  try{
    const valueAt=time=>{t=clamp(time,0,15);return val(layer,property,propertyDefaults[property]??0)};
    if(mode==='value')return valueAt(when);
    const h=1/60,a=Math.max(0,when-h),b=Math.min(15,when+h),span=b-a||1;
    if(property==='x'||property==='y'){
      t=a;const first=worldMatrix(layer).transformPoint(new DOMPoint(480,270));
      t=b;const second=worldMatrix(layer).transformPoint(new DOMPoint(480,270));
      return Math.hypot(second.x-first.x,second.y-first.y)/span;
    }
    return Math.abs(valueAt(b)-valueAt(a))/span;
  } finally{t=saved}
}
function openCurveEditor(){
  const layer=project.layers[selected];if(!layer){toast('请先选择图层');return}
  const existing=document.querySelector('.graph-overlay');if(existing){existing.remove();return}
  const box=document.createElement('div');box.className='graph-overlay curve-editor';
  box.innerHTML=`<div class="graph-title"><b>曲线编辑器</b><span data-layer></span><select data-curve-property><option value="x">位置 X</option><option value="y">位置 Y</option><option value="scale">缩放</option><option value="rotation">旋转</option><option value="opacity">不透明度</option></select><select data-curve-mode><option value="value">值曲线</option><option value="speed">速度曲线</option></select><button data-curve-close>关闭 ×</button></div><svg viewBox="0 0 600 220" preserveAspectRatio="none"></svg><div class="graph-label"><span data-range></span><span>0 — 15 秒 · 拖动菱形编辑时间和值</span></div>`;
  document.querySelector('.track-area').append(box);box.querySelector('[data-layer]').textContent=layer.name;
  const prop=box.querySelector('[data-curve-property]'),mode=box.querySelector('[data-curve-mode]');prop.value=curveProperty;mode.value=curveMode;
  prop.onchange=()=>{curveProperty=prop.value;plot()};mode.onchange=()=>{curveMode=mode.value;plot()};box.querySelector('[data-curve-close]').onclick=()=>box.remove();
  const svg=box.querySelector('svg');
  function element(name,attributes){const item=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))item.setAttribute(key,value);svg.append(item);return item}
  function plot(){
    svg.replaceChildren();const samples=[];for(let i=0;i<=240;i++)samples.push(curveSample(layer,curveProperty,i/16,curveMode));
    const keys=layer.anim?.[curveProperty]||[];const values=samples.concat(curveMode==='value'?keys.map(k=>k.v):[]).filter(Number.isFinite);
    let min=Math.min(...values),max=Math.max(...values);if(!Number.isFinite(min)){min=0;max=1}const padding=Math.max((max-min)*.12,1);min-=padding;max+=padding;
    const yOf=value=>195-(value-min)/(max-min)*155,xOf=time=>time/15*600;
    for(let i=0;i<5;i++){let y=40+i*38.75;element('line',{x1:0,y1:y,x2:600,y2:y,class:'curve-grid'})}
    for(let i=0;i<=5;i++){let x=i*120;element('line',{x1:x,y1:20,x2:x,y2:195,class:'curve-grid'})}
    const points=samples.map((value,i)=>`${xOf(i/16)},${yOf(value)}`).join(' ');element('polyline',{points,class:'curve-line'});
    element('line',{x1:xOf(t),x2:xOf(t),y1:20,y2:195,class:'curve-play'});
    box.querySelector('[data-range]').textContent=`${min.toFixed(1)} — ${max.toFixed(1)}${curveMode==='speed'?' / 秒':''}`;
    if(curveMode==='value'&&!layer.expressions?.[curveProperty])keys.forEach(key=>{
      const marker=element('rect',{x:xOf(key.t)-4,y:yOf(key.v)-4,width:8,height:8,transform:`rotate(45 ${xOf(key.t)} ${yOf(key.v)})`,class:'curve-key'});
      marker.onpointerdown=event=>{event.preventDefault();event.stopPropagation();snapshot();selectedKey={layer,property:curveProperty,key};marker.setPointerCapture(event.pointerId);
        marker.onpointermove=move=>{if(!move.buttons)return;const rect=svg.getBoundingClientRect(),x=clamp((move.clientX-rect.left)/rect.width*600,0,600),y=clamp((move.clientY-rect.top)/rect.height*220,20,195);key.t=Math.round(x/600*15*30)/30;key.v=+(min+(195-y)/155*(max-min)).toFixed(2);marker.setAttribute('x',xOf(key.t)-4);marker.setAttribute('y',yOf(key.v)-4);marker.setAttribute('transform',`rotate(45 ${xOf(key.t)} ${yOf(key.v)})`);draw()};
        marker.onpointerup=()=>{keys.sort((a,b)=>a.t-b.t);renderUI();plot();draw()};
      };
    });
  }
  box.refreshCurve=plot;plot();
}
document.querySelector('#graph').onclick=openCurveEditor;
const timeBeforeCurve=updateTime;updateTime=function(){timeBeforeCurve();const line=document.querySelector('.curve-play');if(line){const x=t/15*600;line.setAttribute('x1',x);line.setAttribute('x2',x)}};
document.addEventListener('keyup',event=>{if(event.key==='F9')document.querySelector('.curve-editor')?.refreshCurve?.()});
