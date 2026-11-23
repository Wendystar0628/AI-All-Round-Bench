'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const {T,copy,prop,clamp,lerp,labels,descriptors}=F;
const icons={
 folder:'M2.5 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2z',plus:'M12 5v14M5 12h14',dots:'M4 12h.1m7.9 0h.1m7.9 0h.1',comp:'M3 5h18v14H3zM8 15l4-6 4 6z',camera:'M3 7h12v10H3zM15 10l6-3v10l-6-3',type:'M5 6h14M12 6v13m-4 0h8M5 6v3m14-3v3',select:'m5 3 14 9-7 1-3 7z',hand:'M8 12V6a1.4 1.4 0 0 1 2.8 0v5-7a1.4 1.4 0 0 1 2.8 0v7-6a1.4 1.4 0 0 1 2.8 0v6-4a1.4 1.4 0 0 1 2.8 0v9a5 5 0 0 1-5 5h-2a5 5 0 0 1-4-2l-4-5a1.6 1.6 0 0 1 2-2l2 2',anchor:'M12 3v18M3 12h18m-9-6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',rotate:'M4 8h5m-5 0V3m0 5a8 8 0 1 1 1 10',scale:'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5m4 1 8-8m-4 0h4v4',square:'M4 5h16v14H4z',ellipse:'M3 12a9 6 0 1 0 18 0 9 6 0 1 0-18 0',pen:'M5 19l2-7L17 2l5 5-10 10-7 2zm2-7 5 5m3-13 5 5',pin:'M8 4h8m-7 0v5l-3 4v2h12v-2l-3-4V4m-3 11v7',cube:'m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10',spark:'M12 2l1.8 7.2L21 12l-7.2 2.2L12 22l-2-7.8L3 12l7-2.8z',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2',field:'M3 8h12a3 3 0 1 0-3-3M3 12h16a2.5 2.5 0 1 1-2.5 2.5M3 16h8a2 2 0 1 1-2 2',sliders:'M4 5h16M4 12h16M4 19h16M9 3v4m6 3v4m-7 3v4',sound:'M3 9h4l5-5v16l-5-5H3zm13 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',mute:'M3 9h4l5-5v16l-5-5H3zm13 1 5 5m0-5-5 5',save:'M4 3h14l3 3v15H3V3zm3 0v6h10V3M7 21v-8h10v8',undo:'M9 6l-5 5 5 5m-5-5h10a5 5 0 0 1 5 5v2',redo:'m15 6 5 5-5 5m5-5H10a5 5 0 0 0-5 5v2',help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m-2.6 6a2.7 2.7 0 0 1 5.3 1c0 1.6-2.7 1.9-2.7 4m0 3h.01',chevron:'m9 6 6 6-6 6',down:'m6 9 6 6 6-6',expand:'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',guide:'M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4m4-4h8m-4-4v8',grid:'M3 3h18v18H3zm6 0v18m6-18v18M3 9h18M3 15h18',play:'M8 5l12 7-12 7z',pause:'M8 5v14m8-14v14',prev:'M6 5v14m13-13-9 6 9 6z',next:'M18 5v14M5 6l9 6-9 6z',stepL:'m14 7-5 5 5 5m-8-9v8',stepR:'m10 7 5 5-5 5m8-9v8',loop:'M5 8h14l-3-3m3 3-3 3M19 16H5l3-3m-3 3 3 3',clock:'M12 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 0V3m-3 0h6m-3 9v4l3 1',key:'m12 4 8 8-8 8-8-8z',eye:'M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6zm10-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4',hidden:'m4 4 16 16M3 12s4-6 9-6c6 0 10 6 10 6s-4 6-10 6c-5 0-9-6-9-6',lock:'M6 10h12v10H6zm2 0V7a4 4 0 0 1 8 0v3',unlock:'M6 10h12v10H6zm2 0V7a4 4 0 0 1 7.5-2',timeline:'M3 5h18M3 12h18M3 19h18M8 3v4m8 3v4m-6 3v4',curve:'M3 5v15h18M5 16c5 0 4-10 9-10s3 7 7 7',nodes:'M2 4h7v6H2zm13 10h7v6h-7zm-6-7h6v10m-6-8h3v9h3',magnet:'M5 4v9a7 7 0 0 0 14 0V4h-4v9a3 3 0 0 1-6 0V4zm0 4h4m6 0h4',minus:'M5 12h14',search:'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12m5 11 5 5',layers:'m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5',diamond:'m12 4 8 8-8 8-8-8z',check:'m4 12 5 5L20 6'
};
function ic(n){return '<svg class="ico" viewBox="0 0 24 24" fill="'+(n==='play'?'currentColor':'none')+'" stroke="currentColor" stroke-width="'+(n==='dots'?3.4:1.65)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[n]||icons.square)+'"/></svg>'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const btn=(id,icon,title,cls='icon')=>'<button class="'+cls+'" data-action="'+id+'" title="'+title+'" aria-label="'+title+'">'+ic(icon)+'</button>';
const options=(list,value)=>list.map(([k,l])=>'<option value="'+esc(k)+'" '+(String(k)===String(value)?'selected':'')+'>'+esc(l)+'</option>').join('');
const makeDemo=()=>{
 const p=F.demo(),c=p.comps[0];const order=['glyph','solid','hammer','spark','camera','light','audio','stage','impact','title'];
 c.layers.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
 c.layers.find(l=>l.id==='glyph').p.reveal.keys[0].v=17;
 c.layers.find(l=>l.id==='glyph').p.ghost.keys[0].v=65;
 c.layers.find(l=>l.id==='glyph').end=3.5;
 c.layers.find(l=>l.id==='solid').node='n-display';
 c.layers.find(l=>l.id==='spark').node='n-emit';
 c.layers.find(l=>l.id==='spark').source='solid';
 c.layers.find(l=>l.id==='spark').colliders=['stage','solid'];
 return p
};
let project=makeDemo(), time=0,selected=new Set(['glyph']),expanded=new Set(),keySel=new Set(),nodeSel=null,insTab='properties',bottomTab='timeline',tool='select',curveProp='position',curveType='value',curveComponent=0;
let play=false,loop=true,snap=true,guide=false,grid=false,alternate=false,mute=false,timeZoom=1,currentRun=null,raf=0,lastTick=0,chosenPort=null,drag=null,marquee=null,clipboard=null,pathDraft=null;
let previous=[],future=[],detailsState={},previousTime=0,toastId=0,renderReady=false,insLayer='',viewOffset=[0,0];
const C=()=>project.comps.find(c=>c.id===project.active)||project.comps[0], L=id=>C().layers.find(l=>l.id===id), S=()=>L([...selected].at(-1));
const FPS=()=>C().fps;
const pt=t=>100*t/C().duration;
const N=v=>typeof v==='number'?Number(v.toFixed(2)):v;
const setTime=(t,exact=false)=>{time=clamp(exact?t:Math.round(t*FPS())/FPS(),0,C().duration);refreshFrame()};
function message(str){$('#status').textContent=str;$('#toast').textContent=str;$('#toast').classList.add('show');clearTimeout(toastId);toastId=setTimeout(()=>$('#toast').classList.remove('show'),2200)}
function record(){previous.push(JSON.stringify(project));if(previous.length>100)previous.shift();future=[];$('#doc-status').textContent='有未保存修改';$('#undo').disabled=false;$('#redo').disabled=true}
const fontChars=new Set();
async function prepareGlyphs(){
 const texts=project.comps.flatMap(c=>c.layers.filter(l=>l.type==='text').flatMap(l=>[l.p.text.v,...l.p.text.keys.map(k=>k.v)]));
 const needed=[...new Set(texts.join(''))].filter(c=>c!=='火'&&!fontChars.has(c));
 if(!needed.length)return;
 needed.forEach(c=>fontChars.add(c));
 try{await document.fonts.load('900 145px "Noto Sans SC Variable"',needed.join(''));F.resetGlyphs();RF.release();refreshFrame()}catch{}
}
function changed(rebuild=true){RF.release();if(rebuild){refreshUI();prepareGlyphs()}else refreshFrame()}
function edit(f,rebuild=true){record();f();changed(rebuild)}
function restore(dir){
 const from=dir>0?future:previous,to=dir>0?previous:future;
 if(!from.length)return;
 to.push(JSON.stringify(project));project=JSON.parse(from.pop());selected=new Set([...selected].filter(id=>L(id)));keySel.clear();time=clamp(time,0,C().duration);
 changed();message(dir>0?'已重做':'已撤销')
}
function choose(id,extend=false){
 if(!extend)selected.clear();
 if(id){if(extend&&selected.has(id))selected.delete(id);else selected.add(id)}
 keySel.clear();renderIns();renderBottom();drawGuide()
}
function activate(id){if(C().id===id)return;stop();project.active=id;time=0;selected.clear();expanded.clear();keySel.clear();nodeSel=null;changed()}
function timecode(t){
 const f=Math.floor(t*FPS()+.000001),ss=Math.floor(f/FPS());return [Math.floor(ss/3600),Math.floor(ss/60)%60,ss%60,f%FPS()].map(n=>String(n).padStart(2,'0')).join(':')
}
function layerIcon(l){return ic(descriptors[l.type]?.[1]||'cube')}
function renderTools(){
 const tools=[['select','select','选择工具 (V)'],['hand','hand','平移视图 (H)'],['rotate','rotate','旋转工具 (W)'],['scale','scale','缩放工具 (S)'],['anchor','anchor','锚点工具 (Y)'],null,['rect','square','绘制矩形 (Q)'],['ellipse','ellipse','绘制椭圆'],['pen','pen','贝塞尔钢笔 (G)'],['text','type','创建文字 (T)'],null,['pin','pin','添加变形图钉'],['mask','guide','绘制蒙版']];
 $('#toolset').innerHTML=tools.map(q=>q?btn('tool:'+q[0],q[1],q[2],'tool'+(tool===q[0]?' on':'')):'<span class="sep"></span>').join('');
 $('#transport').innerHTML=btn('start','prev','到工作区起点')+btn('back','stepL','上一帧')+btn('play',play?'pause':'play',play?'暂停 (空格)':'播放 (空格)','icon play')+btn('forward','stepR','下一帧')+btn('end','next','到工作区终点')+btn('loop','loop','循环工作区','icon'+(loop?' on':''));
 $('#sound').innerHTML=ic(mute?'mute':'sound');
 $('#guide').classList.toggle('on',guide);$('#grid').classList.toggle('on',grid);
 $('#view-mode').innerHTML=ic(alternate?'cube':'camera')+(alternate?' 自由视图':' 活动摄像机')+ic('down');
}
function renderProject(){
 const c=C(), glyph=c.layers.find(l=>l.type==='text'),first=(glyph?.p.text.v||'◇').trim()[0]||'◇';
 $('#doc-name').textContent=project.name;$('#comp-title').textContent=c.name;
 $('#project-summary').innerHTML='<button class="project-card" data-action="settings"><span class="thumb">'+esc(first)+'</span><span><b>'+esc(c.name)+(c.id==='main'?' · 主合成':'')+'</b><small>'+c.width+' × '+c.height+'</small></span>'+ic('chevron')+'</button>';
 $('#project-tree').innerHTML='<div class="tree-item">'+ic('folder')+'合成<small>'+String(project.comps.length).padStart(2,'0')+'</small></div>'+project.comps.map(q=>'<button class="tree-item child '+(q.id===c.id?'active':'')+'" style="--item:'+(q.id===c.id?'#dcf585':'#81c7b6')+'" data-action="comp:'+q.id+'">'+ic('comp')+esc(q.name)+(q.id==='main'?'<small>主合成</small>':'')+'</button>').join('')+(c.id==='main'?'<button class="tree-item" data-action="bottom:nodes" style="--item:#ba9bdf">'+ic('nodes')+'字形生成<small>'+c.nodes.length+' 节点</small></button>':'');
 $('#project-bottom').innerHTML='<strong>合成信息</strong><dl><dt>帧速率</dt><dd>'+c.fps+' fps</dd><dt>持续时间</dt><dd>'+timecode(c.duration)+'</dd><dt>图层</dt><dd>'+String(c.layers.length).padStart(2,'0')+'</dd></dl>';
 $('#view-size').textContent=c.width+' × '+c.height;$('#fps-status').textContent=c.fps+' FPS';
}
function section(title,id,html,open=false){return '<details class="ins-section" data-detail="'+id+'" '+((detailsState[id]??open)?'open':'')+'><summary><span class="disclose">'+ic('chevron')+'</span>'+title+'</summary><div class="block">'+html+'</div></details>'}
const enums={align:[['left','左对齐'],['center','居中'],['right','右对齐']]};
function field(l,k,label=null){
 const p=l.p[k];if(!p)return '';
 const v=F.base(p,time),labelText=label||labels[k]||k;
 const attrs=' data-prop="'+esc(k)+'" data-layer="'+esc(l.id)+'"';
 const slider=(val,i)=>'<span class="field-wrap">'+(Array.isArray(v)?'<em>'+['X','Y','Z','W'][i]+'</em>':'')+'<input type="number" step="any" '+attrs+' data-idx="'+i+'" value="'+N(val)+'" aria-label="'+labelText+(i>=0?' '+['X','Y','Z'][i]:'')+'"></span>';
 let control=typeof v==='number'?slider(v,-1):Array.isArray(v)&&typeof v[0]==='number'?v.map(slider).join(''):enums[k]?'<select '+attrs+' aria-label="'+labelText+'">'+options(enums[k],v)+'</select>':typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?'<input type="color" '+attrs+' value="'+v+'" aria-label="'+labelText+'"><span data-color-label>'+v.toUpperCase()+'</span>':typeof v==='string'?'<input type="text" '+attrs+' value="'+esc(v)+'" aria-label="'+labelText+'">':'<button class="row-button" data-action="animation:'+k+'">编辑</button>';
 if(k==='text')control='<textarea rows="1" style="width:100%;min-height:23px;height:23px;font-size:11px;padding:3px 6px" '+attrs+' aria-label="源文字">'+esc(v)+'</textarea>';
 return '<div class="prop" data-k="'+k+'">'+btn('animation:'+k,'clock','切换关键帧 · Alt 单击编辑表达式','icon watch'+(p.keys.length?' on':''))+'<span title="双击编辑表达式" data-expression="'+k+'">'+esc(labelText)+'</span><div class="prop-controls">'+control+(p.expr?'<button title="编辑表达式" class="expr-flag" data-action="expr:'+k+'">ƒx</button>':'')+'</div><div class="expr-error" hidden></div></div>'
}
function selectField(label,key,list,value){return '<div class="prop"><span></span><span>'+esc(label)+'</span><div class="prop-controls"><select data-option="'+key+'" aria-label="'+esc(label)+'">'+options(list,value)+'</select></div></div>'}
function checkField(label,key,value){return '<div class="prop"><span></span><span>'+esc(label)+'</span><div class="prop-controls"><input type="checkbox" data-option="'+key+'" '+(value?'checked':'')+' aria-label="'+esc(label)+'"></div></div>'}
function subProp(group,item,index,key,title){
 const p=item[key]?.keys?item[key]:prop(item[key]),v=F.base(p,time),at=' data-sub="'+group+'" data-index="'+index+'" data-name="'+key+'"';
 const inputs=Array.isArray(v)?v.map((a,j)=>'<input '+at+' data-idx="'+j+'" type="number" step="any" value="'+N(a)+'" aria-label="'+title+'">').join(''):'<input '+at+' type="'+(typeof v==='string'?'color':'number')+'" step="any" value="'+esc(N(v))+'" aria-label="'+title+'">';
 return '<div class="prop">'+btn('subkey:'+group+':'+index+':'+key,'clock','切换关键帧','icon watch'+(p.keys.length?' on':''))+'<span>'+title+'</span><div class="prop-controls">'+inputs+'</div></div>'
}
function associated(l,lab,key,list){return selectField(lab,key,[['','无'],...list.map(q=>[q.id,q.name])],l[key]??'')}
function subToolbar(group,i,title){
 return '<div style="display:flex;align-items:center;gap:2px;margin-top:4px;color:#c3c4cc;font-size:11px"><span style="flex:1">'+title+'</span>'+btn('reorder:'+group+':'+i+':-1','stepL','上移')+btn('reorder:'+group+':'+i+':1','stepR','下移')+btn('remove:'+group+':'+i,'minus','移除')+'</div>'
}
const fxNames={blur:'高斯模糊',glow:'发光',shadow:'投影',hsb:'色相 / 饱和度 / 亮度'},opNames={trim:'修剪路径',repeat:'重复器',union:'并集',difference:'差集',intersection:'交集',morph:'路径形变'};
function renderIns(){
 const l=S(),c=C(),html=$('#inspector'),y=html.scrollTop;
 $('#ins-tabs').innerHTML=[['properties','属性'],['effects','效果'],['geometry','几何']].map(([k,v])=>'<button data-action="ins:'+k+'" class="'+(insTab===k?'active':'')+'">'+v+'</button>').join('');
 if(!l||selected.size>1){
  html.innerHTML='<div class="no-selection">'+(selected.size>1?'已选择 '+selected.size+' 个图层<br>可一起移动、复制或预合成。':'选择图层以编辑属性。<br><button class="row-button" data-action="add-menu">新建图层</button>')+'</div>';return
 }
 const type=descriptors[l.type]||descriptors.geometry;
 const fields=(...keys)=>keys.map(k=>field(l,k)).join('');
 let str='<div class="selection-head"><span class="layer-tile" style="--tile:'+type[2]+'">'+layerIcon(l)+'</span><div><b>'+esc(l.name)+'</b><small '+(l.type==='text'?'title="思源黑体覆盖常用简繁汉字、拉丁字母与数字，未收录字符使用系统字体"':'')+'>'+type[0]+'图层'+(l.type==='text'?' · 思源黑体':'')+(l.locked?' · 已锁定':'')+'</small></div><span class="tag">'+(['geometry','hammer','camera','light','particle'].includes(l.type)?'3D':l.type==='text'?'TEXT':l.type.toUpperCase())+'</span></div>';
 if(insTab==='properties'){
  if(l.type==='text'||l.type==='plate')str+=section('源文字','text',fields('text','size','align','leading','tracking')+(l.forged?field(l,'reveal'):''),true);
  str+=section('变换','transform',fields('position','rotation','scale','anchor','opacity'),true);
  if(l.type==='text')str+=section('填充与书写','textLook',fields('fill','stroke','strokeWidth',...(l.forged?['ghost']:[])),false)+section('文字动画器','animator',selectField('选择单位','textUnit',[['glyph','字符'],['word','词'],['line','行']],l.textUnit)+fields('rangeStart','rangeEnd','rangeOffset','rangeSoft','letterPos','letterRot','letterScale','letterAlpha'));
  if(l.type==='shape')str+=section('路径与外观','shape',selectField('形状','shape',[['rect','矩形'],['ellipse','椭圆'],['path','贝塞尔路径']],l.shape)+fields('width','height','fill','stroke','strokeWidth')+(l.shape==='path'?'<button class="row-button" data-action="path-keys">路径关键帧</button>':''),true);
  if(['geometry','hammer'].includes(l.type))str+=section('金属材质','material',fields('fill','metal','rough','heat','emission')+checkField('投射阴影','cast',l.cast)+checkField('接收阴影','receive',l.receive),true)+section('挤出与变形','extrude',fields('depth','bevel','twist','bend'),true);
  if(l.type==='camera')str+=section('镜头','camera',fields('target','fov','focus','aperture'),true);
  if(l.type==='light')str+=section('灯光','light',selectField('类型','lightType',[['directional','平行光'],['point','点光源']],l.lightType)+fields('fill','intensity','target')+checkField('投射阴影','cast',l.cast),true);
  if(l.type==='field')str+=section('空间场','field',selectField('场类型','fieldType',[['distance','距离衰减'],['noise','噪声'],['vortex','旋涡']],l.fieldType)+fields('radius','intensity','noise'),true);
  if(l.type==='particle'){
   str+=section('发射器','emit',selectField('发射方式','emitter',[['surface','几何表面'],['curve','曲线'],['point','点']],l.emitter||'surface')+associated(l,'发射源','source',c.layers.filter(x=>['shape','geometry','text'].includes(x.type)))+associated(l,'节点输出','node',c.nodes.filter(x=>F.nodeInfo[x.type]?.[2]==='geometry'))+fields('rate','speed','life','seed','spread')+'<button class="row-button" data-action="burst">爆发事件</button>',true);
   str+=section('力与碰撞','particles',fields('drag','gravity','force','bounce','friction')+field(l,'inheritMotion','继承发射源速度')+'<button class="row-button" data-action="particle-links">场、碰撞和次级发射</button>',true);
   str+=section('粒子外观','particleLook',fields('particleSize','fill','endColor')+field(l,'endSize','结束粒径 %')+field(l,'particleFade','粒子消退'),true);
   str+=section('拖尾','trail',fields('trail','trailWidth')+field(l,'trailFade','拖尾消退')+checkField('独立拖尾色','customTrail',l.customTrail)+(l.customTrail?field(l,'trailColor','拖尾颜色'):''),true);
  }
  if(l.type==='audio')str+=section('音色','audio',selectField('内置音色','voice',[['tone','正弦和声'],['forge','炉鸣与锻击'],['pulse','脉冲节拍']],l.voice)+fields('frequency','volume')+'<button class="row-button" data-action="audio-hits">重音时间</button>',true);
  if(l.type==='precomp')str+=section('时间重映射','remap',associated(l,'源合成','source',project.comps.filter(q=>q.id!==c.id))+fields('remap')+checkField('三维平面','is3d',l.is3d)+'<button class="row-button" data-action="remap-setup">启用时间重映射</button>',true);
  if(l.type==='stage')str+=section('环境参数','stage',fields('height','fill'),true);
  str+=section('图层设置','layer',selectField('混合模式','blend',[['source-over','正常'],['lighter','相加'],['screen','滤色'],['multiply','正片叠底'],['overlay','叠加']],l.blend)+checkField('运动模糊','motion',l.motion)+'<button class="row-button" data-action="trim-dialog">入点 / 出点</button>',false);
 }else if(insTab==='effects'){
  let fx=l.effects.map((e,i)=>{
   const control=(k,name)=>subProp('effects',e,i,k,name);
   const common=subToolbar('effects',i,fxNames[e.type])+control('amount',e.type==='hsb'?'色相':'半径');
   if(e.type==='hsb')return common+control('sat','饱和度')+control('light','亮度');
   if(e.type==='blur')return common;
   return common+control('power','强度')+control('color','颜色')+(e.type==='shadow'?control('x','水平偏移')+control('y','垂直偏移'):'')
  }).join('');
  str+=section('效果','effects',fx+'<button class="row-button" data-action="effect-menu">添加效果</button>',true);
  str+=section('蒙版','masks',l.masks.map((m,i)=>subToolbar('masks',i,['矩形蒙版','椭圆蒙版','路径蒙版'][['rect','ellipse','path'].indexOf(m.type)])+subProp('masks',m,i,'feather','羽化')+subProp('masks',m,i,'width','宽度')+subProp('masks',m,i,'height','高度')+subProp('masks',m,i,'position','位置')+'<button class="row-button" data-action="mask-options:'+i+'">蒙版模式'+(m.invert?' · 反转':'')+'</button>').join('')+'<button class="row-button" data-action="mask-menu">添加蒙版</button>',true);
  str+=section('轨道遮罩','matte','<button class="row-button" data-action="matte">设置遮罩'+(l.matte?' · 已启用':'')+'</button>',true)
 }else{
  const compatible=c.layers.filter(x=>x.id!==l.id&&['text','shape','geometry'].includes(x.type));
  if(['geometry','particle','shape','text'].includes(l.type)){
   str+=section('几何输入','source',associated(l,'轮廓来源','source',compatible)+associated(l,'节点输出','node',c.nodes.filter(x=>F.nodeInfo[x.type]?.[2]==='geometry'))+'<button class="row-button" data-action="bottom:nodes">打开节点编辑器</button>',true);
   str+=section('形状操作','ops',l.ops.map((o,i)=>subToolbar('ops',i,opNames[o.type])+subProp('ops',o,i,'amount',o.type==='repeat'?'数量':'进度')+(o.offset?subProp('ops',o,i,'offset','偏移'):'')+(o.start?subProp('ops',o,i,'start','起点'):'')+(o.source!==undefined?'<select aria-label="操作目标" data-op-source="'+i+'">'+options([['','选择轮廓'],...compatible.map(x=>[x.id,x.name])],o.source)+'</select>':'')).join('')+'<button class="row-button" data-action="op-menu">添加形状操作</button>',true);
   str+=section('变形图钉与场','pins',l.pins.map((p,i)=>subToolbar('pins',i,'图钉 '+(i+1))+subProp('pins',p,i,'position','位置')+subProp('pins',p,i,'rotation','旋转')+subProp('pins',p,i,'scale','缩放')+subProp('pins',p,i,'radius','作用半径')).join('')+'<button class="row-button" data-action="tool:pin">放置图钉</button><button class="row-button" data-action="field-links">混合空间场</button>',true);
  }else str+='<div class="no-selection">此图层没有可处理的轮廓。</div>';
 }
 html.innerHTML=str;
 if(l.locked)for(const control of html.querySelectorAll('input,textarea,select,.watch,.row-button'))control.disabled=true;
 for(const d of html.querySelectorAll('details'))d.addEventListener('toggle',()=>{detailsState[d.dataset.detail]=d.open});
 if(insLayer===l.id)html.scrollTop=y;else insLayer=l.id;
 if(renderReady)syncValues()
}
const keyId=(id,k,t)=>id+'~'+k+'~'+Number(t.toFixed(6));
const parameterGroups=['effects','masks','ops','pins'];
function layerParameters(layer){
 if(!layer)return [];
 return [...Object.entries(layer.p),...parameterGroups.flatMap(group=>(layer[group]||[]).flatMap((item,i)=>Object.entries(item).filter(([,p])=>Array.isArray(p?.keys)).map(([key,p])=>[group+'.'+i+'.'+key,p])))];
}
function parameter(layer,key){
 if(!layer)return undefined;
 if(!key.includes('.'))return layer.p[key];
 const [group,index,name]=key.split('.');
 return layer[group]?.[index]?.[name]
}
const parameterNames={amount:'数量 / 强度',power:'强度',color:'颜色',x:'水平偏移',y:'垂直偏移',sat:'饱和度',light:'亮度',feather:'羽化',path:'路径',start:'起点',offset:'偏移'};
function parameterLabel(layer,key){
 if(!key.includes('.'))return labels[key]||key;
 const [group,i,name]=key.split('.'),type=layer[group]?.[i]?.type;
 const title=group==='effects'?fxNames[type]:group==='ops'?opNames[type]:group==='pins'?'图钉':'蒙版';
 return title+' '+(+i+1)+' · '+(parameterNames[name]||labels[name]||name)
}
function layerRow(l,i){
 const type=descriptors[l.type]||descriptors.geometry,sel=selected.has(l.id);
 return '<div class="layer-row '+(sel?'selected':'')+'" style="--layer:'+type[2]+'" data-layer-row="'+l.id+'" draggable="true">'+btn('visible:'+l.id,l.visible?'eye':'hidden',l.visible?'隐藏图层':'显示图层','icon'+(l.visible?'':' off'))+btn('lock:'+l.id,l.locked?'lock':'unlock',l.locked?'解锁图层':'锁定图层','icon'+(l.locked?'':' off'))+btn('expand:'+l.id,expanded.has(l.id)?'down':'chevron','展开属性')+'<span class="layer-index">'+String(i+1).padStart(2,'0')+'</span><span class="layer-type">'+layerIcon(l)+'</span><button class="layer-name '+(sel?'selected':'')+'" data-action="select:'+l.id+'" title="'+esc(l.name)+'">'+esc(l.name)+'</button><select class="layer-parent" data-parent="'+l.id+'" aria-label="父级">'+options([['','无'],...C().layers.filter(q=>q.id!==l.id).map(q=>[q.id,q.name])],l.parent||'')+'</select></div>'
}
function trackBlock(l){
 const type=descriptors[l.type]||descriptors.geometry,sel=selected.has(l.id);
 const keys=[...new Set(layerParameters(l).flatMap(([,p])=>p.keys.map(k=>k.t)))];
 const names={glyph:'字形轮廓',solid:'挤出 · 金属材质',hammer:'锤击动画',spark:'火星模拟',camera:'摄像机路径',light:'暖光强度',stage:'铸造台',audio:'合成音色',title:'图记',impact:'距离衰减'};
 let content=esc(names[l.id]||l.name);
 if(l.type==='audio'){
  const samples=250, peaks=Array.from({length:samples},(_,i)=>{
   const x=i/samples,t=lerp(l.start,l.end,x),hit=(l.hits||[]).reduce((m,s)=>Math.max(m,Math.exp(-Math.abs(t-s)*13)),0);
   const value=(.26+.45*F.hash(i*.616))*(.35+.26*Math.sin(x*38)**2)+hit*.69;return [x*1000,Math.min(7.5,value*9)]
  });
  const wave=[...peaks.map(([x,y])=>x+','+(8-y)),...peaks.reverse().map(([x,y])=>x+','+(8+y))].join(' ');
  content='<svg class="waveform" viewBox="0 0 1000 16" preserveAspectRatio="none" aria-hidden="true"><polygon points="'+wave+'"/></svg><span>'+content+'</span>'
 }
 const bar='<button class="track-block '+(sel?'chosen':'')+'" data-track="'+l.id+'" style="--layer:'+type[2]+';left:'+pt(l.start)+'%;width:'+Math.max(.18,pt(l.end-l.start))+'%"><i class="trim" data-trim="start"></i>'+content+'<i class="trim" data-trim="end"></i></button>';
 return '<div class="track-row '+(sel?'selected':'')+'" data-track-row="'+l.id+'">'+bar+keys.map(t=>'<i class="key overview" style="left:'+pt(t)+'%"></i>').join('')+'</div>'
}
function renderTimeline(){
 const c=C(),cont=$('#bottom-content'),old=cont.querySelector('.timeline'),top=old?.scrollTop||0,left=old?.scrollLeft||0;
 const detail=timeZoom>=6?.25:timeZoom>=3?.5:1,step=Math.ceil(c.duration/(148*detail))*detail,ticks=Array.from({length:Math.floor(c.duration/(step/4))+1},(_,i)=>i*step/4);
 const big=ticks.filter((_,i)=>i%4===0);
 let row='',track='';
 for(const [i,l] of c.layers.entries()){
  row+=layerRow(l,i);track+=trackBlock(l);
  if(expanded.has(l.id))for(const [k,p] of layerParameters(l).filter(([k,p])=>p.keys.length||p.expr||['position','scale','rotation','opacity'].includes(k))){
   const label=esc(parameterLabel(l,k));
   row+='<div class="layer-row prop-track">'+btn('timeline-key:'+l.id+':'+k,'key','创建或删除当前关键帧','icon'+(p.keys.length?' on':''))+'<button data-action="curve:'+l.id+':'+k+'">'+label+(p.expr?' ƒx':'')+'</button></div>';
   track+='<div class="track-row prop-track">'+p.keys.map(f=>{const id=keyId(l.id,k,f.t);return '<button class="key '+(keySel.has(id)?'sel':'')+'" data-key="'+id+'" style="left:'+pt(f.t)+'%" aria-label="'+label+' '+f.t.toFixed(2)+' 秒"></button>'}).join('')+'</div>'
  }
 }
 const chapters=c.chapters.length?c.chapters.map((ch,i)=>'<button class="chapter" data-jump="'+ch.t+'" style="--ch:'+ch.color+';left:'+pt(ch.t)+'%;width:calc('+pt((c.chapters[i+1]?.t??c.duration)-ch.t)+'% - 3px)">'+esc(ch.name)+'</button>').join(''):'<button class="chapter" style="--ch:#9bad73;left:'+pt(c.work[0])+'%;width:'+pt(c.work[1]-c.work[0])+'%" data-action="settings">工作区</button>';
 cont.innerHTML='<div class="timeline"><div class="layer-column"><div class="layer-head"><div class="layer-head-top"><button class="timecode" data-action="goto">'+timecode(time)+'</button>'+btn('add-menu','plus','新建图层')+'</div><div class="layer-head-bottom">'+ic('eye')+ic('lock')+'<span>图层名称</span><span>父级</span></div></div>'+row+'</div><div class="time-column" style="width:'+100*timeZoom+'%"><div class="ruler-wrap"><div class="ruler">'+ticks.map((t,i)=>'<i class="tick '+(i%4===0?'big':'')+'" style="left:'+pt(t)+'%">'+(i%4===0&&t<c.duration-.1?'<label>'+String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0')+(step<1?'.'+String(Math.round(t%1*100)).padStart(2,'0'):'')+'</label>':'')+'</i>').join('')+'</div><div class="chapters">'+chapters+'</div></div><div class="track-area"><div class="track-grid">'+big.map(t=>'<i style="left:'+pt(t)+'%"></i>').join('')+'</div>'+track+'</div><div class="playhead" style="left:'+pt(time)+'%"></div></div></div>';
 const tl=cont.querySelector('.timeline');tl.scrollTop=top;tl.scrollLeft=left
}
function renderCurve(){
 const l=S(),list=layerParameters(l).filter(([,p])=>typeof p.v==='number'||Array.isArray(p.v)&&typeof p.v[0]==='number').map(([k])=>k);
 if(list.length&&!list.includes(curveProp))curveProp=list[0];
 const p2=parameter(l,curveProp);
 if(Array.isArray(p2?.v))curveComponent=clamp(curveComponent,0,p2.v.length-1);
 $('#bottom-content').innerHTML='<div class="graph"><div class="graph-toolbar">'+ic('curve')+'<span>'+(l?esc(l.name):'选择一个图层')+'</span><select id="curve-property" aria-label="曲线属性">'+options(list.map(k=>[k,parameterLabel(l,k)]),curveProp)+'</select><select id="curve-kind" aria-label="曲线类型">'+options([['value','值曲线'],['speed','速度曲线']],curveType)+'</select>'+(Array.isArray(p2?.v)?'<select id="curve-component" aria-label="分量">'+options([[0,'X'],[1,'Y'],[2,'Z']].slice(0,p2.v.length),curveComponent)+'</select>':'')+'<span style="margin-left:auto">拖动关键帧或时间手柄</span></div><svg id="curve-svg" viewBox="0 0 1200 190" preserveAspectRatio="none"></svg></div>';
 updateCurve()
}
let graphState;
function updateCurve(){
 const svg=$('#curve-svg'),l=S(),c=C(),p=parameter(l,curveProp);if(!svg||!p||typeof p.v!=='number'&&typeof p.v?.[0]!=='number')return;
 const sample=t=>curveProp.includes('.')?F.base(p,t):F.sampler(project,c,t).val(l,curveProp),component=v=>Array.isArray(v)?v[curveComponent]:v;
 const speed=t=>{
  const a=sample(Math.max(0,t-.004)),b=sample(Math.min(c.duration,t+.004));
  const dt=Math.min(c.duration,t+.004)-Math.max(0,t-.004);
  return Array.isArray(a)?Math.hypot(...b.map((v,i)=>v-a[i]))/dt:Math.abs(b-a)/dt
 };
 const val=t=>curveType==='speed'?speed(t):component(sample(t));
 const data=Array.from({length:201},(_,i)=>val(c.duration*i/200)).filter(Number.isFinite);
 p.keys.forEach(k=>data.push(val(k.t)));
 const lo=Math.min(...data),hi=Math.max(...data),gap=Math.max(.25,(hi-lo)*.22),min=lo-gap,max=hi+gap;
 const x=t=>58+1118*t/c.duration,y=v=>166-148*(v-min)/(max-min||1);
 graphState={x,y,min,max};
 const curve=Array.from({length:241},(_,i)=>{const t=c.duration*i/240;return (i?'L':'M')+x(t).toFixed(2)+' '+y(val(t)).toFixed(2)}).join(' ');
 const grid=Array.from({length:6},(_,i)=>{const v=lerp(min,max,i/5),cy=y(v);return '<line x1="58" x2="1176" y1="'+cy+'" y2="'+cy+'" stroke="#2c2d33"/><text x="48" y="'+(cy+3)+'" text-anchor="end">'+N(v)+'</text>'}).join('')+Array.from({length:16},(_,i)=>{const t=c.duration*i/15,cx=x(t);return '<line x1="'+cx+'" x2="'+cx+'" y1="11" y2="167" stroke="#292b30"/><text x="'+cx+'" y="183" text-anchor="middle">'+N(t)+'s</text>'}).join('');
 const keys=p.keys.map((k,i)=>{
  const id=keyId(l.id,curveProp,k.t),xx=x(k.t),yy=y(curveType==='speed'?val(k.t):component(k.v));
  let handles='';
  if(keySel.has(id)||k.in==='bezier'||k.out==='bezier')for(const sign of [-1,1]){
   const side=sign<0?'in':'out',next=p.keys[i+sign];if(!next)continue;
   const control=sign<0?'easeIn':'easeOut',reach=k[side]==='bezier'?(k[control+'X']??1/3):1/3;
   const dx=Math.abs(x(next.t)-xx)*reach*sign,dy=(y(curveType==='speed'?val(next.t):component(next.v))-yy)*(k[side]==='bezier'?(k[control]??0):1/3);
   handles+='<line x1="'+xx+'" x2="'+(xx+dx)+'" y1="'+yy+'" y2="'+(yy+dy)+'" stroke="#9aac75"/><circle data-handle="'+side+'" data-keyref="'+id+'" cx="'+(xx+dx)+'" cy="'+(yy+dy)+'" r="4" fill="#bdcba2" style="cursor:grab"/>'
  }
  return handles+'<rect data-key="'+id+'" width="8" height="8" x="'+(xx-4)+'" y="'+(yy-4)+'" transform="rotate(45 '+xx+' '+yy+')" fill="'+(keySel.has(id)?'#edffa3':'#bcca9b')+'" stroke="#30362b" style="cursor:grab"/>'
 }).join('');
 svg.innerHTML=grid+'<path d="'+curve+'" fill="none" stroke="#d7f188" stroke-width="1.8"/>'+keys+'<line x1="'+x(time)+'" x2="'+x(time)+'" y1="10" y2="167" stroke="#d7f188" opacity=".75" pointer-events="none"/>'
}
const portColor={geometry:'#86dcbc',field:'#c7a1ec',scalar:'#e6ce83',vector:'#8ab6ed',color:'#f4a989'};
function describeNode(s,node){
 const val=F.nodeValue(s,node.id),kind=F.nodeInfo[node.type]?.[2];
 if(kind==='geometry')return (val?.length||0)+' 轮廓 · '+(val?.reduce((a,p)=>a+p.points.length,0)||0)+' 顶点';
 if(kind==='field')return val?.name||'无场';
 return '值  '+(Array.isArray(val)?val.map(N).join(' / '):N(val)??'—')
}
const nodePorts=n=>{
 const [_,input,out]=F.nodeInfo[n.type]||[];
 if(n.type==='group'&&n.inputs)return {ins:n.inputs,out};
 const additional={deform:[['field','field']],transform:[['vector','vector']],repeat:[['vector','vector'],['scalar','scalar']],rect:[['scalar','scalar']],style:[['color','color']]};
 return {ins:[...(input?[['input',input]]:[]),...(additional[n.type]||[])],out}
};
function renderNodes(){
 const c=C(),n=c.nodes.find(q=>q.id===nodeSel),s=F.sampler(project,c,time),area=$('#bottom-content'),prev=area.querySelector('.node-graph'),scroll=[prev?.scrollLeft||0,prev?.scrollTop||0];
 const names={geometry:'几何',field:'场',scalar:'标量',vector:'向量',color:'颜色'};
 const getAt=(a,b)=>{const i=nodePorts(a).ins.findIndex(p=>p[0]===b);return a.y+58+Math.max(0,i)*20};
 const wires=c.nodes.filter(q=>!q.hidden).flatMap(to=>nodePorts(to).ins.map(([key,typ])=>{
  const from=c.nodes.find(x=>x.id===to[key]&&!x.hidden);if(!from)return '';
  const x1=from.x+143,x2=to.x,y1=from.y+58,y2=getAt(to,key),dx=Math.max(32,Math.abs(x2-x1)*.49);
  return '<path fill="none" stroke="'+portColor[typ]+'" opacity=".72" stroke-width="1.6" d="M'+x1+' '+y1+' C'+(x1+dx)+' '+y1+' '+(x2-dx)+' '+y2+' '+x2+' '+y2+'"/>'
 })).join('');
 const cards=c.nodes.filter(q=>!q.hidden).map(q=>{
  const {ins,out}=nodePorts(q),describe=describeNode(s,q);
  const port=(side,key,type)=>'<button data-port="'+side+':'+q.id+':'+key+':'+type+'" title="'+(side==='out'?'连接输出':'连接输入 · 右键断开')+'" class="port '+side+'" style="--port:'+portColor[type]+'">'+names[type]+'</button>';
  return '<div class="node-card '+(q.id===nodeSel?'sel':'')+'" style="left:'+q.x+'px;top:'+q.y+'px;--node:'+portColor[out]+'"><div class="node-title" data-node-drag="'+q.id+'">'+ic('nodes')+esc(q.name)+'</div><div class="node-result" data-node-result="'+q.id+'" title="'+esc(describe)+'">'+esc(describe)+'</div>'+Array.from({length:Math.max(1,ins.length)},(_,i)=>'<div class="node-ports" style="height:20px">'+(ins[i]?port('in',...ins[i]):'<span></span>')+(i===0?port('out','out',out):'')+'</div>').join('')+'</div>'
 }).join('');
 const groupAction=n?.type==='group'?'<button class="subtle" data-action="node-unpack">解组</button>':'<button class="subtle" data-action="node-group">封装节点</button>';
 area.innerHTML='<div class="graph"><div class="graph-toolbar">'+btn('node-add','plus','添加节点')+'<button class="subtle" data-action="node-add">添加节点</button>'+(n?'<button class="subtle" data-action="node-edit">节点参数</button><button class="subtle" data-action="node-use">连接到所选图层</button>'+groupAction+btn('node-copy','layers','复制节点')+btn('node-delete','minus','删除节点'):'')+'<span class="node-status">'+(chosenPort?'选择匹配的输入端口':'单击输出与输入以连接 · 双击节点编辑')+'</span></div><div class="node-graph"><div class="node-space" style="min-width:'+Math.max(900,...c.nodes.map(n=>n.x+175))+'px;min-height:'+Math.max(200,...c.nodes.map(n=>n.y+95))+'px"><svg class="node-wires" width="100%" height="100%">'+wires+'</svg>'+cards+'</div></div></div>';
 const g=area.querySelector('.node-graph');g.scrollLeft=scroll[0];g.scrollTop=scroll[1]
}
function renderBottom(){
 $('#bottom-tabs').innerHTML=[['timeline','timeline','时间轴'],['curve','curve','曲线编辑器'],['nodes','nodes','节点编辑器']].map(([k,i,n])=>'<button data-action="bottom:'+k+'" class="'+(bottomTab===k?'active':'')+'">'+ic(i)+n+'</button>').join('');
 $('#timeline-tools').innerHTML=bottomTab==='timeline'?btn('snap','magnet','时间吸附','icon'+(snap?' on':''))+'<span class="sep"></span>'+btn('zoom-out','minus','缩小时间轴')+'<input type="range" min="1" max="8" step=".25" id="time-zoom" value="'+timeZoom+'" aria-label="时间轴缩放">'+btn('zoom-in','plus','放大时间轴'):'';
 if(bottomTab==='timeline')renderTimeline();else if(bottomTab==='curve')renderCurve();else renderNodes()
}
function syncValues(){
 if(!renderReady)return;
 const s=RF.sampler;
 for(const i of $$('[data-prop]')){
  if(i===document.activeElement)continue;
  const l=L(i.dataset.layer);if(!l||!s)continue;
  const v=s.val(l,i.dataset.prop),n=+i.dataset.idx??-1;
  if(v!==undefined)i.value=Array.isArray(v)&&n>=0?N(v[n]):N(v);
  if(i.type==='color'&&i.nextElementSibling?.hasAttribute('data-color-label'))i.nextElementSibling.textContent=String(v).toUpperCase()
 }
 for(const line of $$('.expr-error')){
  const l=S(),k=line.closest('.prop').dataset.k,e=l&&s?.errors.get(l.id+':'+k);
  line.hidden=!e;line.textContent=e||''
 }
 for(const i of $$('[data-sub]')){
  const v=S()?.[i.dataset.sub]?.[i.dataset.index]?.[i.dataset.name];
  if(v!==undefined&&i!==document.activeElement){const val=v?.keys?F.base(v,time):v;i.value=Array.isArray(val)?N(val[+i.dataset.idx]):N(val)}
 }
}
function fitView(){
 const area=$('#stage-area'), stage=$('#stage'),c=C(),a=c.width/c.height;
 const z=$('#zoom-view').value, padX=36,padY=28;
 const w=z==='fit'?Math.min(area.clientWidth-padX,(area.clientHeight-padY)*a):c.width*Number(z);
 const h=w/a;stage.style.width=Math.max(2,w)+'px';stage.style.height=Math.max(2,h)+'px';
 stage.style.transform='translate('+viewOffset[0]+'px,'+viewOffset[1]+'px)';
 stage.classList.toggle('checker',grid);
 if(renderReady){RF.size(w,h);refreshFrame()}
}
function refreshFrame(){
 if(!renderReady)return;
 RF.render(project,C(),time,alternate);
 const empty=$('#empty-stage'),visible=C().layers.some(l=>l.visible&&['shape','text','precomp','geometry','particle','plate','stage','hammer'].includes(l.type));
 empty.style.display=visible?'none':'grid';empty.innerHTML=visible?'':'<b>合成为空</b><span>使用工具栏绘制形状，或添加文字图层</span>';
 for(const a of $$('.timecode'))a.textContent=timecode(time);
 for(const a of $$('.playhead'))a.style.left=pt(time)+'%';
 const chapter=C().chapters.filter(ch=>ch.t<=time).at(-1);
 for(const a of $$('.chapter[data-jump]'))a.classList.toggle('current',+a.dataset.jump===chapter?.t);
 updateAudioMeter();
 syncValues();drawGuide();if(bottomTab==='curve'&&!drag)updateCurve();
 if(bottomTab==='nodes')for(const el of $$('[data-node-result]')){
  const node=C().nodes.find(n=>n.id===el.dataset.nodeResult);
  if(node){const str=describeNode(RF.sampler,node);if(el.textContent!==str)el.textContent=el.title=str}
 }
}
function refreshUI(){
 renderTools();renderProject();renderIns();renderBottom();$('#undo').disabled=!previous.length;$('#redo').disabled=!future.length;
 fitView()
}

function popup(el,list,event){
 const p=$('#popup');p.innerHTML='';
 for(const [title,action,keys] of list){
  const b=document.createElement('button');b.innerHTML=esc(title)+(keys?'<kbd>'+esc(keys)+'</kbd>':'');b.onclick=()=>{p.hidden=true;action()};p.append(b)
 }
 const r=el?.getBoundingClientRect();p.hidden=false;
 p.style.left=clamp(event?.clientX??r?.left??90,5,innerWidth-p.offsetWidth-6)+'px';
 p.style.top=clamp(event?.clientY??r?.bottom??140,5,innerHeight-p.offsetHeight-6)+'px'
}
function dialog(title,fields,cb,extra=''){
 const d=$('#dialog');d.innerHTML='<form method="dialog"><h2>'+esc(title)+'</h2>'+extra+fields.map(f=>{
  const [id,label,type,value,list]=f;
  return type==='textarea'?'<label>'+esc(label)+'</label><textarea name="'+id+'" aria-label="'+esc(label)+'">'+esc(value)+'</textarea>':'<label>'+esc(label)+(type==='select'?'<select name="'+id+'">'+options(list,value)+'</select>':'<input name="'+id+'" type="'+type+'" '+(type==='checkbox'?value?'checked':'':'value="'+esc(value)+'"')+' '+(type==='number'?'step="any"':'')+'>')+'</label>'
 }).join('')+'<div class="dialog-actions"><button value="cancel" type="button" id="cancel-dialog">取消</button><button value="default" type="submit">确定</button></div></form>';
 $('#cancel-dialog').onclick=()=>d.close();
 d.querySelector('form').onsubmit=e=>{e.preventDefault();const form=d.querySelector('form'),values={};for(const a of form.elements)if(a.name)values[a.name]=a.type==='number'?Number(a.value):a.type==='checkbox'?a.checked:a.value;d.close();cb?.(values)};
 d.showModal()
}
function save(){
 const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=project.name+'.forge';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 $('#doc-status').textContent='本地工程';message('工程已保存')
}
function valid(p){
 const id=x=>typeof x==='string'&&/^[a-z0-9_.-]+$/i.test(x);
 const unique=items=>new Set(items.map(x=>x.id)).size===items.length;
 return p&&typeof p.name==='string'&&Array.isArray(p.comps)&&p.comps.length&&unique(p.comps)&&p.comps.every(c=>
  id(c.id)&&typeof c.name==='string'&&c.duration>0&&c.duration<=1200&&c.width>0&&c.height>0&&Number.isInteger(c.fps)&&c.fps>0&&
  Array.isArray(c.work)&&Array.isArray(c.chapters)&&c.chapters.every(ch=>/^#[a-f\d]{6}$/i.test(ch.color)&&Number.isFinite(ch.t))&&
  Array.isArray(c.layers)&&unique(c.layers)&&c.layers.every(l=>id(l.id)&&Object.hasOwn(descriptors,l.type)&&Array.isArray(l.p?.position?.keys)&&parameterGroups.every(g=>Array.isArray(l[g])))&&
  Array.isArray(c.nodes)&&unique(c.nodes)&&c.nodes.every(n=>id(n.id)&&Object.hasOwn(F.nodeInfo,n.type)&&Number.isFinite(n.x)&&Number.isFinite(n.y))
 )
}
function load(newProject,sel=null,remember=true){
 stop();if(remember)record();project=newProject;
 for(const c of project.comps)for(const l of c.layers.filter(q=>q.type==='particle')){
  const defaults=F.layer('particle','',c,'defaults').p;
  for(const [k,p] of Object.entries(defaults))if(!l.p[k])l.p[k]=p
 }
 if(!project.comps.some(x=>x.id===project.active))project.active=project.comps[0].id;
 selected=new Set(sel?[sel]:[]);expanded.clear();keySel.clear();nodeSel=null;time=0;timeZoom=1;detailsState={};bottomTab='timeline';insTab='properties';changed()
}
function settings(create=false){
 const c=create?F.comp('合成 '+String(project.comps.length+1).padStart(2,'0')):C();
 dialog(create?'新建合成':'合成设置',[
  ['name','合成名称','text',c.name],['width','宽度','number',c.width],['height','高度','number',c.height],['fps','帧率','number',c.fps],['duration','持续时间（秒）','number',c.duration],
  ['in','工作区起点','number',c.work[0]],['out','工作区终点','number',c.work[1]],['blur','启用运动模糊','checkbox',c.blur],['shutter','快门角度','number',c.shutter],['phase','快门相位','number',c.phase]
 ],v=>edit(()=>{
  const old=c.duration;
  c.name=v.name||c.name;c.width=clamp(Math.round(v.width),16,8192);c.height=clamp(Math.round(v.height),16,8192);c.fps=clamp(Math.round(v.fps),1,120);c.duration=clamp(v.duration,.2,1200);
  c.work=[clamp(v.in,0,c.duration-.01),clamp(v.out,clamp(v.in+.01,.01,c.duration),c.duration)];
  if(create&&v.out===old&&v.duration!==old)c.work[1]=c.duration;
  c.shutter=clamp(v.shutter,0,720);c.phase=clamp(v.phase,-720,720);c.blur=v.blur;
  for(const l of c.layers)if(l.end===old)l.end=c.duration;
  if(create){project.comps.push(c);project.active=c.id;time=0;selected.clear()}
  time=clamp(time,0,c.duration)
 }))
}
const types=['shape','text','null','adjust','precomp','camera','light','geometry','particle','audio','field'];
function addLayer(type,opt={},commit=true){
 const c=C(),l=F.layer(type,opt.name,c); const src=S();
 if(type==='geometry'&&src&&['shape','text','geometry'].includes(src.type)){
  l.source=src.id;l.p.position.v=copy(RF.sampler?.val(src,'position')||src.p.position.v); l.p.scale.v=copy(src.p.scale.v);l.p.rotation.v=copy(src.p.rotation.v);l.parent=src.parent;
  if(commit&&!src.locked)opt.hideSource=src.id
 }
 if(type==='particle'&&src&&['geometry','shape','text'].includes(src.type))l.source=src.id;
 if(type==='precomp')l.source=project.comps.find(q=>q.id!==c.id)?.id||null;
 if(type==='shape'&&opt.shape)l.shape=opt.shape;
 if(type==='shape'&&l.shape==='path')l.p.path=prop(opt.points||[F.ring([[-100,-80],[105,-70],[21,100]])]);
 if(type==='text'&&opt.text!==undefined)l.p.text.v=opt.text;
 if(opt.position)l.p.position.v=opt.position;
 if(opt.size){l.p.width.v=opt.size[0];l.p.height.v=opt.size[1]}
 const work=()=>{if(opt.hideSource){const q=L(opt.hideSource);if(q)q.visible=false}c.layers.unshift(l);selected=new Set([l.id]);insTab='properties'};
 if(commit)edit(work);else work();
 return l
}
function newText(position){dialog('创建文字',[['txt','文字内容','textarea','火']],v=>{addLayer('text',{text:v.txt,position});tool='select';renderTools()})}
function newLayer(type){
 if(type==='text')return newText();
 if(type==='precomp'&&project.comps.length<2){message('请先创建可引用的合成');settings(true);return}
 addLayer(type)
}
function duplicate(){
 const ids=[...selected];if(!ids.length)return;
 edit(()=>{
  const map=new Map(ids.map(id=>[id,F.uid('layer')]));
  const layers=C().layers;
  for(const id of ids.slice().reverse()){
   const i=layers.findIndex(x=>x.id===id),l=copy(layers[i]);l.id=map.get(id);l.name+=' 副本';if(l.type==='precomp')l.inline=false;
   l.parent=map.get(l.parent)||l.parent;l.source=map.get(l.source)||l.source;
   layers.splice(i,0,l)
  }
  selected=new Set(map.values())
 })
}
function del(){
 if(keySel.size){edit(()=>{for(const l of C().layers)if(!l.locked)for(const [k,p] of layerParameters(l))p.keys=p.keys.filter(f=>!keySel.has(keyId(l.id,k,f.t)));keySel.clear()});return}
 if(bottomTab==='nodes'&&nodeSel){deleteNode();return}
 if(!selected.size)return;
 edit(()=>{const ids=new Set([...selected].filter(id=>!L(id)?.locked));C().layers=C().layers.filter(l=>!ids.has(l.id));for(const l of C().layers)if(ids.has(l.parent))l.parent=null;selected.clear()})
}
function parent(l,id){
 if(l.locked)return;
 let p=L(id),cycle=false;
 while(p){if(p.id===l.id){cycle=true;break}p=L(p.parent)}
 if(cycle){message('父级连接会形成循环');renderBottom();return}
 const s=F.sampler(project,C(),time),world=s.matrix(l).clone();
 const local=id?s.matrix(L(id)).clone().invert().multiply(world):world,position=new T.Vector3(),scale=new T.Vector3(),q=new T.Quaternion();
 local.multiply(new T.Matrix4().makeTranslation(...s.val(l,'anchor'))).decompose(position,q,scale);
 const e=new T.Euler().setFromQuaternion(q,'ZYX');
 const composed=new T.Matrix4().compose(position,new T.Quaternion().setFromEuler(e),scale);
 const affine=composed.clone().invert().multiply(local),identity=new T.Matrix4();
 edit(()=>{
  l.parent=id||null;l.affine=affine.elements.some((v,i)=>Math.abs(v-identity.elements[i])>.000001)?affine.toArray():null;
  F.set(l,'position',time,[...position]);F.set(l,'scale',time,[...scale].map(v=>v*100));F.set(l,'rotation',time,[e.x,e.y,e.z].map(v=>v*180/Math.PI))
 })
}
function precompose(){
 const c=C(),layers=c.layers.filter(l=>selected.has(l.id));
 if(!layers.length)return message('请先选择要预合成的图层');
 dialog('预合成',[['name','合成名称','text',c.name+' · 预合成']],v=>edit(()=>{
  const sub=F.comp(v.name||'预合成');Object.assign(sub,{width:c.width,height:c.height,duration:c.duration,fps:c.fps,work:[...c.work],shutter:c.shutter,phase:c.phase,blur:c.blur});
  const order=c.layers.map(l=>l.id), ids=new Map(c.nodes.map(n=>[n.id,F.uid('node')]));
  sub.nodes=c.nodes.map(n=>{const q=copy(n);q.id=ids.get(n.id);for(const k of ['input','field','scalar','vector','color','internal'])if(q[k])q[k]=ids.get(q[k])||q[k];return q});sub.chapters=copy(c.chapters);
  sub.layers=c.layers.map(l=>{
   const q=copy(l);if(q.node)q.node=ids.get(q.node)||q.node;
   if(!selected.has(l.id)){
    q.preDependency=true;
    if(!['camera','light','field','null'].includes(l.type)&&!layers.some(a=>a.matte?.source===l.id))q.visible=false;
   }
   return q
  });
  for(const l of c.layers.filter(l=>!selected.has(l.id)&&selected.has(l.parent))){const helper=copy(L(l.parent));helper.type='null';helper.name+=' · 父级';helper.visible=false;helper.preProxy=true;l._preserve=helper}
  const idx=c.layers.findIndex(l=>selected.has(l.id));
  c.layers=c.layers.filter(l=>!selected.has(l.id));
  for(const l of [...c.layers])if(l._preserve){if(!c.layers.some(p=>p.id===l._preserve.id))c.layers.push(l._preserve);delete l._preserve}
  const pre=F.layer('precomp',sub.name,c);pre.source=sub.id;pre.inline=true;pre.originalOrder=order;pre.members=layers.map(l=>l.id);
  c.layers.splice(idx,0,pre);project.comps.push(sub);selected=new Set([pre.id])
 }))
}
function expression(l,k){
 if(!l||l.locked||!l.p[k])return;
 const p=l.p[k];
 dialog('表达式 · '+(labels[k]||k),[['expr','表达式','textarea',p.expr]],v=>edit(()=>p.expr=v.expr.trim()),'<p>可用 time、value、wiggle(频率, 幅度)、loopOut("cycle") 与 ease()。<br>通过 thisComp.layer("图层名").transform.position.x 引用其他图层。</p>')
}
function toggleKey(l,k,removeAnimation=false){
 const p=parameter(l,k);if(!p||l.locked)return;
 const value=copy(F.base(p,time));
 edit(()=>{
  if(removeAnimation&&p.keys.length){p.v=value;p.keys=[]}
  else{const i=p.keys.findIndex(x=>Math.abs(x.t-time)<.00001);if(i>=0){p.keys.splice(i,1);if(!p.keys.length)p.v=value}else{p.keys.push({t:time,v:value,in:'linear',out:'linear'});p.keys.sort((a,b)=>a.t-b.t)}expanded.add(l.id)}
 })
}
function toggleObjectKey(p){const value=copy(F.base(p,time));if(p.keys.length){p.keys=[];p.v=value}else{p.keys=[{t:time,v:value,in:'linear',out:'linear'}]}}
function keyBy(str){const [id,k,ts]=str.split('~'),l=L(id),p=parameter(l,k);return {l,k,p,f:p?.keys.find(f=>Math.abs(f.t-+ts)<.000002)}}
function keyContext(el,e){
 const id=el.dataset.key;
 if(!keySel.has(id)){keySel.clear();keySel.add(id)}
 const apply=(side,interp)=>edit(()=>{for(const id of keySel){const {f}=keyBy(id);if(f){if(side!=='out')f.in=interp;if(side!=='in')f.out=interp}}});
 const spatial=(mode)=>edit(()=>{for(const id of keySel){const {k,p,f}=keyBy(id);if(k!=='position'||!f)continue;const i=p.keys.indexOf(f),a=p.keys[i-1]?.v||f.v,b=p.keys[i+1]?.v||f.v;
  if(mode==='linear'){delete f.spatialIn;delete f.spatialOut}
  else if(mode==='corner'){f.spatialIn=a.map((v,j)=>(v-f.v[j])*.28);f.spatialOut=b.map((v,j)=>(v-f.v[j])*.28)}
  else {f.spatialOut=b.map((v,j)=>(v-a[j])*.18);f.spatialIn=f.spatialOut.map(v=>-v)}
 }guide=true});
 popup(el,[['线性',()=>apply('both','linear')],['缓入缓出',()=>apply('both','bezier'),'F9'],['定格（离开）',()=>apply('out','hold')],['定格（进入）',()=>apply('in','hold')],['缓入（进入）',()=>apply('in','bezier')],['缓出（离开）',()=>apply('out','bezier')],['空间 · 曲线',()=>spatial('smooth')],['空间 · 尖角',()=>spatial('corner')],['空间 · 直线',()=>spatial('linear')],['按比例拉伸时间',stretchKeys],['删除所选关键帧',del]],e)
}
function stretchKeys(){
 if(keySel.size<2)return message('至少选择两个关键帧');
 dialog('拉伸关键帧时间',[['scale','时间比例','number',2]],v=>edit(()=>{
  const entries=[...keySel].map(keyBy).filter(q=>q.f), min=Math.min(...entries.map(q=>q.f.t));
  keySel.clear();
  for(const {l,k,p,f} of entries){f.t=clamp(min+(f.t-min)*Math.max(.01,v.scale),0,C().duration);p.keys.sort((a,b)=>a.t-b.t);keySel.add(keyId(l.id,k,f.t))}
 }))
}
function copyKeys(){
 if(!keySel.size){clipboard={layers:[...selected].map(L).filter(Boolean).map(copy)};return}
 const entries=[...keySel].map(keyBy).filter(q=>q.f),min=Math.min(...entries.map(q=>q.f.t));
 clipboard={keys:entries.map(({l,k,f})=>({id:l.id,k,f:{...copy(f),t:f.t-min}}))};message('已复制 '+entries.length+' 个关键帧')
}
function pasteKeys(){
 if(clipboard?.layers?.length){edit(()=>{for(const l of clipboard.layers){const q=copy(l);q.id=F.uid('layer');q.name+=' 副本';if(q.type==='precomp')q.inline=false;C().layers.unshift(q)} });return}
 if(!clipboard?.keys?.length)return;
 edit(()=>{keySel.clear();for(const {id,k,f} of clipboard.keys){
  const l=(selected.size===1&&parameter(S(),k)?S():L(id)),p=parameter(l,k);if(!p||l.locked)continue;
  const t=clamp(time+f.t,0,C().duration);
  p.keys=p.keys.filter(x=>Math.abs(x.t-t)>.00001);p.keys.push({...copy(f),t});p.keys.sort((a,b)=>a.t-b.t);keySel.add(keyId(l.id,k,t));expanded.add(l.id)
 }})
}
function effectAdd(type){const l=S();if(!l||l.locked)return;edit(()=>{l.effects.push({type,amount:prop(type==='hsb'?0:23),power:prop(.92),color:prop(type==='shadow'?'#000000':'#ff8b55'),x:prop(15),y:prop(13),sat:prop(1),light:prop(1)});detailsState.effects=true})}
function maskAdd(type,params={}){
 const l=S();if(!l||l.locked)return;
 edit(()=>{const m={type,width:prop(params.width||250),height:prop(params.height||175),position:prop(params.position||[0,0,0]),feather:prop(0),invert:false,mode:'add'};
 if(type==='path')m.path=prop(params.points||[[-120,-90],[125,-90],[60,115]]);l.masks.push(m);insTab='effects';guide=true;detailsState.masks=true})
}
function opAdd(type){
 const l=S();if(!l||l.locked)return;
 edit(()=>{const op={type,amount:prop(type==='repeat'?3:100)};if(type==='repeat')op.offset=prop([90,45]);if(type==='trim')op.start=prop(0);if(!['trim','repeat'].includes(type))op.source='';l.ops.push(op);detailsState.ops=true})
}
function listLinks(l,particle){
 const c=C(),field=c.layers.filter(x=>x.type==='field'),col=c.layers.filter(x=>['shape','geometry','stage','text','precomp','hammer'].includes(x.type)&&x.id!==l.id);
 const f=field.map(x=>['f_'+x.id,x.name,'checkbox',l.fields.includes(x.id)]);
 if(particle)f.push(...col.map(x=>['c_'+x.id,'碰撞 / '+x.name,'checkbox',l.colliders.includes(x.id)]),['attraction','吸引 / 排斥力','number',l.attraction||0],['secondary','碰撞次级发射','checkbox',l.secondary],['life','碰撞后寿命（0 无）','number',l.hitLife||0],['tint','碰撞时改变颜色','checkbox',Boolean(l.hitColor)],['color','碰撞颜色','color',l.hitColor||'#ffb16a']);
 dialog(particle?'粒子力场与碰撞':'混合空间场',f,v=>edit(()=>{
  l.fields=field.filter(x=>v['f_'+x.id]).map(x=>x.id);
  if(particle){l.colliders=col.filter(x=>v['c_'+x.id]).map(x=>x.id);l.secondary=v.secondary;l.hitLife=v.life;l.attraction=v.attraction;l.hitColor=v.tint?v.color:null}
 }),!f.length?'<p>先创建一个空间场图层。</p>':'')
}
const nodeDefaults={number:1,vector:[45,25,0],color:'#e29a66',rect:125,transform:60,repeat:4,deform:1,trim:66,style:'#efc28c'};
function nodeAdd(type){
 const c=C(),n={id:F.uid('node'),name:F.nodeInfo[type][0],type,x:38+(c.nodes.length%5)*171,y:30+Math.floor(c.nodes.length/5)*111};
 if(type in nodeDefaults)n.param=prop(copy(nodeDefaults[type]));
 if(type==='source')n.source=S()?.id||c.layers.find(l=>['shape','text','geometry'].includes(l.type))?.id||null;
 if(type==='field')n.source=c.layers.find(l=>l.type==='field')?.id||null;
 edit(()=>{c.nodes.push(n);nodeSel=n.id;bottomTab='nodes'})
}
function nodeEdit(){
 const c=C(),outer=c.nodes.find(q=>q.id===nodeSel);if(!outer)return;
 let n=outer;
 const seen=new Set();
 while(n.internal&&!seen.has(n.internal)){seen.add(n.id);const child=c.nodes.find(q=>q.id===n.internal);if(!child)break;n=child}
 const fs=[['name','节点名称','text',outer.name]],val=n.param?F.base(n.param,time):null;
 if(n.type==='source'||n.type==='field')fs.push(['source',n.type==='source'?'轮廓源':'空间场','select',n.source,[['','无'],...c.layers.filter(l=>n.type==='source'?['shape','text','geometry'].includes(l.type):l.type==='field').map(l=>[l.id,l.name])]]);
 if(n.param){fs.push(['anim','启用关键帧','checkbox',n.param.keys.length]);if(Array.isArray(val))val.forEach((v,i)=>fs.push(['v'+i,['X','Y','Z'][i],'number',v]));else fs.push(['v','参数值',typeof val==='number'?'number':'color',val])}
 dialog('节点参数',fs,v=>edit(()=>{
  outer.name=v.name||outer.name;if('source'in v)n.source=v.source||null;
  if(n.param){
   const value=Array.isArray(val)?val.map((_,i)=>v['v'+i]):v.v;
   if(v.anim){const old=n.param.keys.find(k=>Math.abs(k.t-time)<.00001);if(old)old.v=value;else n.param.keys.push({t:time,v:value,in:'linear',out:'linear'});n.param.keys.sort((a,b)=>a.t-b.t)}
   else{n.param.v=value;n.param.keys=[]}
  }
 }))
}
function deleteNode(){
 const n=C().nodes.find(x=>x.id===nodeSel);if(!n)return;
 edit(()=>{C().nodes=C().nodes.filter(x=>x.id!==n.id);for(const q of C().nodes)for(const k of ['input','field','vector','scalar','color','internal'])if(q[k]===n.id)delete q[k];for(const l of C().layers)if(l.node===n.id)l.node=null;nodeSel=null})
}
function connectPort(str,disconnect=false){
 const [side,id,key,type]=str.split(':'), n=C().nodes.find(q=>q.id===id);if(!n)return;
 if(disconnect){if(side==='in')edit(()=>delete n[key]);else edit(()=>{for(const m of C().nodes)for(const [k] of nodePorts(m).ins)if(m[k]===id)delete m[k]});return}
 if(!chosenPort||chosenPort.startsWith(side+':')){chosenPort=str;nodeSel=id;renderNodes();return}
 const other=chosenPort.split(':'),from=side==='out'?[side,id,key,type]:other,to=side==='in'?[side,id,key,type]:other;
 chosenPort=null;
 if(from[3]!==to[3]||from[1]===to[1]){message('端口类型不兼容');renderNodes();return}
 const c=C(),target=c.nodes.find(q=>q.id===to[1]);
 function reaches(q,id,seen=new Set()){if(!q||seen.has(q.id))return false;if(q.id===id)return true;seen.add(q.id);return nodePorts(q).ins.some(([k])=>reaches(c.nodes.find(n=>n.id===q[k]),id,seen))}
 if(reaches(c.nodes.find(q=>q.id===from[1]),target.id)){message('节点连接会形成循环');renderNodes();return}
 edit(()=>{target[to[2]]=from[1];nodeSel=target.id})
}

const xyz=(v,def=0)=>[v?.[0]??def,v?.[1]??def,v?.[2]??def];
const vec=v=>new T.Vector3(...xyz(v));
const project2=(p,m)=>RF.projectPoint(vec(p).applyMatrix4(m));
function drawGuide(){
 const svg=$('#overlay');svg.setAttribute('viewBox','0 0 '+RF.width+' '+RF.height);
 const l=S(),s=RF.sampler;if(!s||!RF.camera){svg.innerHTML='';return}
 let str='',m=l?s.matrix(l):new T.Matrix4();
 const poly=(pts,stroke,other='')=>'<polyline points="'+pts.filter(p=>p.every(Number.isFinite)).map(p=>p.map(N).join(',')).join(' ')+'" fill="none" stroke="'+stroke+'" '+other+'/>';
 const dot=(p,a='',c='#dcf585',r=3.7)=>'<circle cx="'+N(p[0])+'" cy="'+N(p[1])+'" r="'+r+'" fill="#282d21" stroke="'+c+'" '+a+'/>';
 if(pathDraft?.points.length){
  const all=pathDraft.points.map(p=>project2(p,pathDraft.matrix||new T.Matrix4()));
  str+=poly(all,'#dcf585','stroke-width="1.2"')+all.map(p=>dot(p)).join('')
 }
 if(guide&&!play&&!currentRun&&l){
  const center=project2(s.val(l,'anchor'),m);
  const box=s.active(l)?RF.layerBounds(l):null;
  if(box){
   str+=poly([...box,box[0]],'#dcf585','opacity=".8"')+box.map((p,i)=>dot(p,'data-box="'+i+'" style="pointer-events:auto;cursor:nwse-resize"')).join('');
   str+=dot([center[0],Math.min(...box.map(p=>p[1]))-16],'data-rotate="1" style="pointer-events:auto;cursor:grab"','#e5f2b8',4)
  }
  str+=dot(center,'data-anchor="1" style="pointer-events:auto;cursor:move"','#eaf4b1',3);
  if(['geometry','camera','light','null','particle','field'].includes(l.type)){
   const anchors=[[66,0,0],[0,66,0],[0,0,66]],cs=['#e47f73','#b5d67a','#7ab2eb'];
   anchors.forEach((a,i)=>{
    const p=project2(s.val(l,'anchor').map((v,j)=>v+a[j]),m),label=['X','Y','Z'][i];
    str+=poly([center,p],cs[i],'stroke-width="1.25"')+dot(p,'data-axis="'+i+'" style="pointer-events:auto;cursor:move"',cs[i],3)+'<text x="'+(p[0]+5)+'" y="'+(p[1]+4)+'" fill="'+cs[i]+'" font-size="9">'+label+'</text>'
   })
  }
  if(s.active(l)&&['field','light','camera'].includes(l.type)){
   let pts;
   if(l.type==='field'){const r=s.val(l,'radius');pts=Array.from({length:65},(_,i)=>project2([Math.cos(i*Math.PI/32)*r,Math.sin(i*Math.PI/32)*r,0],m))}
   else {const target=vec(s.val(l,'target')),parent=L(l.parent);if(parent)target.applyMatrix4(s.matrix(parent));pts=[center,RF.projectPoint(target)]}
   str+=poly(pts,'#c7a2f2','stroke-dasharray="4 4"');
  }
  for(let i=0;i<(l.pins||[]).length;i++){
   const p=l.pins[i],v=project2(F.base(p.position,time),m);
   str+=dot(v,'data-pin="'+i+'" style="pointer-events:auto;cursor:move"','#ffbc80',5);
  }
  if(insTab==='effects')l.masks.forEach((mask,j)=>{
   const pos=F.base(mask.position,time),w=F.base(mask.width,time)/2,h=F.base(mask.height,time)/2;
   const path=mask.type==='path'?F.base(mask.path,time):mask.type==='ellipse'?Array.from({length:64},(_,i)=>[w*Math.cos(i*Math.PI/32),h*Math.sin(i*Math.PI/32)]):[[-w,-h],[w,-h],[w,h],[-w,h]];
   const points=path.map(([x,y])=>project2([x+pos[0],y+pos[1],pos[2]],m));
   if(!points.length)return;
   str+=poly([...points,points[0]],'#e2b693','stroke-dasharray="6 3" stroke-width="1.2"');
   if(mask.type==='path')str+=points.map((p,i)=>dot(p,'data-mask-point="'+j+':'+i+'" style="pointer-events:auto;cursor:move"','#e2b693')).join('')
  });
  if(l.shape==='path'&&l.p.path){
   F.base(l.p.path,time).forEach((ring,j)=>{
    const pts=ring.points.map(p=>project2(p,m));
    str+=poly(ring.closed?[...pts,pts[0]]:pts,'#b6cb79','stroke-dasharray="3 3"');
    pts.forEach((p,i)=>{
     str+=dot(p,'data-path="'+j+':'+i+'" style="pointer-events:auto;cursor:move"','#d1e495');
     if(ring.handles?.[i])for(const k of ['in','out']){
      const off=ring.handles[i][k]||[0,0],ctrl=project2(ring.points[i].map((v,m)=>v+off[m]),m);
      str+=poly([p,ctrl],'#8cbaab')+dot(ctrl,'data-tangent="'+j+':'+i+':'+k+'" style="pointer-events:auto;cursor:move"','#7fdec9',3)
     }
    })
   })
  }
  if(l.p.position.keys.length>=1){
   const ks=l.p.position.keys, P=L(l.parent), frameMat=t=>P?F.sampler(project,C(),t).matrix(P):new T.Matrix4();
   if(ks.length>1){const beg=ks[0].t,end=ks.at(-1).t;str+=poly(Array.from({length:81},(_,i)=>{const t=lerp(beg,end,i/80),q=F.sampler(project,C(),t);return project2(q.val(l,'position'),frameMat(t))}),'#c3d980','stroke-dasharray="3 3" stroke-width="1.2"')}
   ks.forEach((k,i)=>{
    const x=project2(k.v,frameMat(k.t));str+=dot(x,'data-spatial="'+i+':v" style="pointer-events:auto;cursor:move"','#d9ed9b',3);
    for(const hd of ['spatialIn','spatialOut'])if(k[hd]){const y=project2(k.v.map((a,j)=>a+k[hd][j]),frameMat(k.t));str+=poly([x,y],'#cbd78d')+dot(y,'data-spatial="'+i+':'+hd+'" style="pointer-events:auto;cursor:move"','#f2d992',3)}
   })
  }
 }
 svg.innerHTML=str
}
function stageUV(e){
 const r=$('#stage').getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height]
}
function finishPath(closed){
 const d=pathDraft;if(!d||d.points.length<2)return;
 pathDraft=null;
 if(d.mask){maskAdd('path',{points:d.points.map(p=>p.slice(0,2))});tool='select';renderTools();return}
 const xs=d.points.map(p=>p[0]),ys=d.points.map(p=>p[1]),center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,0];
 const r={points:d.points.map(p=>[p[0]-center[0],p[1]-center[1]]),closed,handles:d.handles};
 if(d.append&&S()?.shape==='path'){
  const l=S(),s=RF.sampler,inv=s.matrix(l).clone().invert();r.points=d.points.map(p=>[...vec(p).applyMatrix4(inv)].slice(0,2));
  edit(()=>F.set(l,'path',time,[...copy(F.base(l.p.path,time)),r]))
 }else addLayer('shape',{name:'贝塞尔路径',shape:'path',points:[r],position:center});
 guide=true;tool='select';renderTools();drawGuide()
}
function startStage(e){
 if(e.button!==0&&e.button!==1||currentRun)return;
 const uv=stageUV(e), p=RF.world(...uv),l=S(),s=RF.sampler;if(!s)return;
 e.preventDefault();
 if(play)stop();
 if(tool==='text'){newText([...p]);return}
 if(tool==='pen'||tool==='mask'&&(e.altKey||pathDraft?.mask)){
  if(!pathDraft)pathDraft={points:[],handles:[],append:e.shiftKey,mask:tool==='mask',matrix:tool==='mask'&&l?s.matrix(l):null};
  if(e.detail>1){finishPath(true);return}
  const viewport=pathDraft.matrix?s.matrix(l):new T.Matrix4();
  if(pathDraft.points.length>2){
   const old=project2(pathDraft.points[0],viewport),cursor=[uv[0]*RF.width,uv[1]*RF.height];
   if(Math.hypot(old[0]-cursor[0],old[1]-cursor[1])<10){finishPath(true);return}
  }
  const source=pathDraft.matrix?RF.world(...uv,new T.Vector3().setFromMatrixPosition(viewport),vec([0,0,1]).transformDirection(viewport)).applyMatrix4(viewport.clone().invert()):p;
  pathDraft.points.push([...source]);pathDraft.handles.push({in:[0,0],out:[0,0]});
  drag={type:'pen',uv,point:source};drawGuide();return
 }
 if(tool==='rect'||tool==='ellipse'||tool==='mask'){
  if(tool==='mask'&&!l)return message('先选择要添加蒙版的图层');
  const m=tool==='mask'?s.matrix(l):new T.Matrix4(),origin=new T.Vector3().setFromMatrixPosition(m), plane=vec([0,0,1]).transformDirection(m);
  drag={type:'draw',kind:tool,uv,origin,plane,inv:m.clone().invert(),p:RF.world(...uv,origin,plane).applyMatrix4(m.clone().invert())};return
 }
 if(tool==='hand'||e.button===1){drag={type:'view',x:e.clientX,y:e.clientY,offset:[...viewOffset]};return}
 const data=e.target.dataset, isHandle=['pin','path','tangent','spatial','anchor','box','rotate','axis','maskPoint'].some(k=>data[k]!==undefined);
 if(tool==='pin'){
  if(!l||l.locked)return message('先选择可编辑的图层');
  const m=s.matrix(l),o=new T.Vector3().setFromMatrixPosition(m),q=RF.world(...uv,o,vec([0,0,1]).transformDirection(m)).applyMatrix4(m.clone().invert());
  edit(()=>{l.pins.push({origin:[...q],position:prop([...q]),rotation:prop(0),scale:prop(100),radius:prop(135)});guide=true;tool='select';insTab='geometry'});return
 }
 const hit=isHandle||tool!=='select'?l:RF.pick(...uv,C());
 if(!hit){choose(null);return}
 if(!selected.has(hit.id)||e.shiftKey)choose(hit.id,e.shiftKey);
 if(hit.locked||!selected.has(hit.id))return;
 const mo=data.box!==undefined?'scale':data.rotate!==undefined?'rotate':data.anchor!==undefined?'anchor':tool;
 const hitM=s.matrix(hit),o=new T.Vector3().setFromMatrixPosition(hitM),plane=isHandle&&data.axis===undefined?vec([0,0,1]).transformDirection(hitM):null;
 if(data.spatial!==undefined){
  const [j,k]=data.spatial.split(':'),f=hit.p.position.keys[+j],par=L(hit.parent),pMat=par?F.sampler(project,C(),f.t).matrix(par):new T.Matrix4();
  const prior=k==='v'?f.v:f.v.map((a,i)=>a+f[k][i]),world=vec(prior).applyMatrix4(pMat);
  drag={type:'spatial',f,k,pMat,world,base:copy(f.v),l:hit,uv};return
 }
 if(data.pin!==undefined||data.path||data.tangent||data.maskPoint){
  const sel=data.pin!==undefined?['pin',+data.pin]:data.path?['path',...data.path.split(':')]:data.maskPoint?['mask',...data.maskPoint.split(':')]:['tangent',...data.tangent.split(':')];
  const origin=sel[0]==='mask'?vec(F.base(hit.masks[+sel[1]].position,time)).applyMatrix4(hitM):o;
  drag={type:'point',l:hit,sel,uv,origin,plane,inv:hitM.clone().invert()};return
 }
 const snapshot=[...selected].map(L).filter(x=>!x.locked).map(l=>{
  const par=L(l.parent),pMat=par?s.matrix(par).clone():new T.Matrix4(), m=s.matrix(l).clone();
  return {l,m,pMat,inv:pMat.clone().invert(),point:vec(s.val(l,'position')).applyMatrix4(pMat),position:s.val(l,'position'),rotation:s.val(l,'rotation'),scale:s.val(l,'scale'),anchor:s.val(l,'anchor')}
 });
 const pivot=RF.projectPoint(vec(s.val(hit,'anchor')).applyMatrix4(hitM));
 drag={type:'transform',kind:mo,uv,o,plane,x:e.clientX,y:e.clientY,start:RF.world(...uv,o,plane),snapshot,axis:data.axis===undefined?null:+data.axis,pivot};
}
function beginDrag(){if(!drag.did){record();drag.did=true}}
function continueStage(e){
 const d=drag,uv=stageUV(e);
 if(d.type==='view'){
  viewOffset=[d.offset[0]+e.clientX-d.x,d.offset[1]+e.clientY-d.y];
  $('#stage').style.transform='translate('+viewOffset[0]+'px,'+viewOffset[1]+'px)';return
 }
 if(d.type==='pen'){const q=RF.world(...uv);const a=pathDraft?.handles.at(-1);if(a){a.out=[q.x-d.point.x,q.y-d.point.y];a.in=a.out.map(v=>-v)}return}
 if(d.type==='draw'){
  const r=$('#stage').getBoundingClientRect(),x=uv[0]*RF.width,y=uv[1]*RF.height,a=d.uv[0]*RF.width,b=d.uv[1]*RF.height;
  drawGuide();$('#overlay').insertAdjacentHTML('beforeend','<rect x="'+Math.min(x,a)+'" y="'+Math.min(y,b)+'" width="'+Math.abs(x-a)+'" height="'+Math.abs(y-b)+'" fill="#dcf58518" stroke="#dcf585" stroke-dasharray="4 3"/>');return
 }
 if(Math.hypot(uv[0]-d.uv[0],uv[1]-d.uv[1])<.002&&!d.did)return;
 beginDrag();
 if(d.type==='spatial'){
  const p=RF.world(...uv,d.world).applyMatrix4(d.pMat.clone().invert());d.f[d.k]=d.k==='v'?[...p]:[...p].map((v,i)=>v-d.base[i])
 }else if(d.type==='point'){
  const p=RF.world(...uv,d.origin,d.plane).applyMatrix4(d.inv),[type,j,k,side]=d.sel;
  if(type==='pin'){const pin=d.l.pins[j];F.set({p:{p:pin.position}},'p',time,[...p])}
  else if(type==='mask'){
   const mask=d.l.masks[j],pos=F.base(mask.position,time),points=copy(F.base(mask.path,time));
   points[k]=[p.x-pos[0],p.y-pos[1]];F.set({p:{p:mask.path}},'p',time,points)
  }
  else{
   const rings=copy(F.base(d.l.p.path,time)),r=rings[j];
   if(type==='path')r.points[k]=[p.x,p.y];
   else {r.handles[k][side]=[p.x-r.points[k][0],p.y-r.points[k][1]]}
   F.set(d.l,'path',time,rings)
  }
 }else{
  const w=RF.world(...uv,d.o,d.plane),delta=w.clone().sub(d.start);
  const start=[d.uv[0]*RF.width-d.pivot[0],d.uv[1]*RF.height-d.pivot[1]],end=[uv[0]*RF.width-d.pivot[0],uv[1]*RF.height-d.pivot[1]];
  const angle=(Math.atan2(start[1],start[0])-Math.atan2(end[1],end[0]))*180/Math.PI;
  for(const x of d.snapshot){
   const l=x.l;
   if(d.kind==='rotate'){F.set(l,'rotation',time,[x.rotation[0],x.rotation[1],x.rotation[2]+F.mod(angle+180,360)-180]);continue}
   if(d.kind==='scale'){const f=clamp(Math.hypot(...end)/Math.max(4,Math.hypot(...start)),.01,15);F.set(l,'scale',time,x.scale.map(v=>v*f));continue}
   let movement=delta;
   if(d.axis!==null){
    const local=vec([0,0,0]);local.setComponent(d.axis,1);
    const axis=local.transformDirection(x.m);
    const shift=RF.axisDistance(...uv,x.point,axis)-RF.axisDistance(...d.uv,x.point,axis);
    movement=axis.multiplyScalar(shift)
   }
   const p=x.point.clone().add(movement).applyMatrix4(x.inv);
   F.set(l,'position',time,[...p]);
   if(d.kind==='anchor'){
    const localDelta=x.point.clone().add(movement).applyMatrix4(x.m.clone().invert()).sub(vec(x.anchor));F.set(l,'anchor',time,x.anchor.map((v,i)=>v+localDelta.getComponent(i)))
   }
  }
 }
 changed(false)
}
function endStage(e){
 const d=drag;if(d.type==='draw'){
  const uv=stageUV(e),q=RF.world(...uv,d.origin,d.plane).applyMatrix4(d.inv),size=[Math.abs(q.x-d.p.x),Math.abs(q.y-d.p.y)],center=[(d.p.x+q.x)/2,(d.p.y+q.y)/2,0];
  if(d.kind==='mask')maskAdd('rect',{width:size[0]||220,height:size[1]||160,position:center});
  else addLayer('shape',{name:d.kind==='rect'?'矩形':'椭圆',shape:d.kind,position:center,size:size[0]>3&&size[1]>3?size:[245,155]});
  guide=true;tool='select';renderTools()
 }
 if(d.did){renderBottom();renderIns();$('#undo').disabled=false}
 drawGuide()
}
let audioCtx,audioBus,oscillators=[],hitTimes=new Set(),noiseBuffer;
const transients=new Set();
const audioLastTime=new Map();
function initializeAudio(){
 if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioCtx=new AC();audioBus=audioCtx.createGain();audioBus.gain.value=.7;audioBus.connect(audioCtx.destination)}
 if(audioCtx.state==='suspended')audioCtx.resume()
}
function clearAudio(){
 for(const g of oscillators){try{g.osc.stop()}catch{}g.osc.disconnect();g.gain.disconnect()}
 for(const node of transients){try{node.stop()}catch{}}
 transients.clear();
 oscillators=[];hitTimes.clear();audioLastTime.clear()
}
function transient(node,route){
 transients.add(node);
 node.onended=()=>{transients.delete(node);node.disconnect();route.forEach(p=>p.disconnect())}
}
function doHit(l,scheduled,strength){
 if(!audioCtx||mute||currentRun)return;
 const now=Math.max(audioCtx.currentTime,scheduled),dur=.72;
 if(!noiseBuffer){
  noiseBuffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*dur),audioCtx.sampleRate);
  const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(F.hash(i*.471)*2-1)*Math.exp(-i/(audioCtx.sampleRate*.115))
 }
 const n=audioCtx.createBufferSource(),bp=audioCtx.createBiquadFilter(),gn=audioCtx.createGain();n.buffer=noiseBuffer;bp.type='bandpass';bp.frequency.value=950;bp.Q.value=.47;gn.gain.value=strength*.64;n.connect(bp).connect(gn).connect(audioBus);transient(n,[bp,gn]);n.start(now);
 [66,354,756,1161].forEach((f,i)=>{
  const o=audioCtx.createOscillator(),a=audioCtx.createGain();o.type=i?'sine':'triangle';o.frequency.value=f;o.frequency.exponentialRampToValueAtTime(f*.82,now+.35);a.gain.setValueAtTime(strength*(i===0?.37:.13/(i*.7)),now);a.gain.exponentialRampToValueAtTime(.0001,now+.32+i*.11);o.connect(a).connect(audioBus);transient(o,[a]);o.start(now);o.stop(now+.35+i*.11)
 })
}
function audioLayers(comp,t,parents=[],gain=1,prefix=''){
 if(parents.includes(comp.id))return [];
 const s=F.sampler(project,comp,t);
 return comp.layers.filter(s.active).flatMap(l=>{
  const id=prefix+l.id,a=gain*s.val(l,'opacity')/100;
  if(l.type==='audio')return [{id,l,s,t,a}];
  if(l.type!=='precomp')return [];
  const sub=project.comps.find(q=>q.id===l.source);
  if(!sub)return [];
  const time=l.p.remap.keys.length||l.p.remap.expr?s.val(l,'remap'):t-l.start+(l.offset||0);
  return audioLayers(sub,clamp(time,0,sub.duration),[...parents,comp.id],a,id+'/')
 })
}
function updateAudioMeter(){
 const meter=$('#audio-meter');if(!meter)return;
 let level=0;
 if(!mute||currentRun)for(const {l,s,t,a} of audioLayers(C(),time)){
  const volume=clamp(s.val(l,'volume')*a);
  const fade=Math.min(clamp((t-l.start)/.37),clamp((l.end-t)/.85));
  const pulse=l.voice==='pulse'?.22+.78*Math.pow(Math.max(0,Math.sin(t*Math.PI*4)),8):.70+.30*Math.sin(t*Math.PI*.55);
  const hit=(l.hits||[]).reduce((value,x)=>t>=x?Math.max(value,Math.exp(-(t-x)*10)):value,0);
  level=Math.max(level,volume*(.7*pulse*fade+2.3*hit))
 }
 const value=Math.round(clamp(level)*100);
 meter.setAttribute('aria-valuenow',value);
 [...meter.children].forEach((bar,i)=>bar.classList.toggle('on',value>=4+i*19))
}
function audioTick(globalTime){
 if(!audioCtx||mute||currentRun)return;
 const tracks=audioLayers(C(),globalTime), active=new Set(tracks.map(q=>q.id));
 const now=audioCtx.currentTime;
 for(const g of oscillators)if(!active.has(g.id))g.gain.gain.setTargetAtTime(0,now,.02);
 for(const {id,l:track,s,t,a} of tracks){
  const base=s.val(track,'frequency'),vol=s.val(track,'volume')*a;
  let set=oscillators.filter(g=>g.id===id);
  if(!set.length){
   const harmonics=track.voice==='forge'?[1,1.505,2.009,3.02]:track.voice==='pulse'?[1,2]:[1,1.5,2];
   set=harmonics.map((f,i)=>{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=i===0?'sine':track.voice==='forge'?'triangle':'sine';osc.frequency.value=base*f;gain.gain.value=0;osc.connect(gain).connect(audioBus);osc.start();return {osc,gain,f,i,id}});
   oscillators.push(...set)
  }
  const fade=Math.min(clamp((t-track.start)/.37),clamp((track.end-t)/.85));
  for(const g of set){
   const pulse=track.voice==='pulse'?.22+.78*Math.pow(Math.max(0,Math.sin(t*Math.PI*4)),8):.70+.30*Math.sin(t*(Math.PI*.55+g.i*.13));
   g.gain.gain.setTargetAtTime(Math.max(0,vol*(g.i?.035/g.i:.12)*pulse*fade),now,.025);
   g.osc.frequency.setTargetAtTime(Math.max(1,base*g.f*(1+.007*Math.sin(t*.77+g.i))),now,.035)
  }
  const last=audioLastTime.get(id)??(t-.085);
  for(const stamp of track.hits||[]){
   const key=id+':'+stamp;
   if(t<last&&stamp>t+.09)hitTimes.delete(key);
   if(stamp>=Math.min(last,t-.085)&&stamp<t+.09&&!hitTimes.has(key)){hitTimes.add(key);doHit(track,now+stamp-t,vol)}
  }
  audioLastTime.set(id,t)
 }
}
function run(timestamp){
 if(!play||currentRun)return;
 const c=C(),dt=Math.max(0,(timestamp-lastTick)/1000);lastTick=timestamp;
 previousTime=time;time+=dt;
 if(time>=c.work[1]){if(loop){time=c.work[0]+F.mod(time-c.work[0],c.work[1]-c.work[0]);clearAudio()}else{stop();setTime(c.work[1]);return}}
 refreshFrame();audioTick(time);raf=requestAnimationFrame(run)
}
function start(){
 if(currentRun)return;
 if(time<C().work[0]||time>=C().work[1])time=C().work[0];
 initializeAudio();play=true;lastTick=performance.now();renderTools();audioTick(time);raf=requestAnimationFrame(run)
}
function stop(){play=false;cancelAnimationFrame(raf);clearAudio();if($('#transport'))renderTools()}
function navigateKey(dir){
 const l=S(),keys=(l?[l]:C().layers).flatMap(l=>layerParameters(l).flatMap(([,p])=>p.keys.map(x=>x.t))).sort((a,b)=>a-b);
 const next=dir>0?keys.find(t=>t>time+.0001):[...keys].reverse().find(t=>t<time-.0001);
 if(next!==undefined){stop();setTime(next,true)}
}

function addMenu(e){popup(e,types.map(type=>[descriptors[type][0]+'图层',()=>newLayer(type)]))}
function layerMenu(e){
 const l=S();
 popup(e,[['新建图层',()=>addMenu(e)],['重命名',()=>rename(l)],['复制图层',duplicate,'Ctrl+D'],['预合成',precompose,'Ctrl+Shift+C'],['挤出所选轮廓',()=>addLayer('geometry')],['上移图层',()=>orderLayers(-1)],['下移图层',()=>orderLayers(1)],['删除所选',del,'Delete']])
}
function rename(l){
 if(!l)return;
 dialog('重命名图层',[['name','名称','text',l.name]],v=>edit(()=>{if(v.name)l.name=v.name}))
}
function orderLayers(dir){
 if(!S())return;
 edit(()=>{const a=C().layers,i=a.indexOf(S()),j=clamp(i+dir,0,a.length-1);[a[i],a[j]]=[a[j],a[i]]})
}
function help(){
 dialog('键盘快捷键',[],null,'<p>空格　播放 / 暂停　　← / →　逐帧<br>J / K　上一个 / 下一个关键帧<br>V 选择　H 视图　W 旋转　S 缩放　Y 锚点<br>Q 矩形　G 钢笔　T 文字<br>钢笔拖动创建切线，Enter 完成开路径，点击首点闭合<br>Shift 扩选，Shift + 钢笔绘制第二轮廓<br>F9 缓入缓出　Alt + 秒表 编辑表达式<br>Ctrl + Z 撤销　Ctrl + Shift + Z 重做<br>Ctrl + D 复制图层　Ctrl + Shift + C 预合成</p>')
}
const menus={
 file:el=>popup(el,[['新建空工程',()=>load(F.empty()),'Ctrl+N'],['打开工程',()=>$('#file-input').click(),'Ctrl+O'],['保存工程',save,'Ctrl+S'],['载入「锻字」示例',()=>load(makeDemo(),'glyph')]]),
 edit:el=>popup(el,[['撤销',()=>restore(-1),'Ctrl+Z'],['重做',()=>restore(1),'Ctrl+Shift+Z'],['复制',copyKeys,'Ctrl+C'],['粘贴',pasteKeys,'Ctrl+V'],['删除',del,'Delete'],['拉伸关键帧时间',stretchKeys]]),
 comp:el=>popup(el,[['新建合成',()=>settings(true)],['合成设置',()=>settings()],['预合成',precompose,'Ctrl+Shift+C'],['添加阶段标记',()=>dialog('阶段标记',[['name','名称','text','阶段'],['color','颜色','color','#cde58e']],v=>edit(()=>{C().chapters.push({name:v.name,color:v.color,t:time});C().chapters.sort((a,b)=>a.t-b.t)}))],['设定工作区起点',()=>workPoint(0),'B'],['设定工作区终点',()=>workPoint(1),'N']]),
 layer:layerMenu,
 view:el=>popup(el,[['时间轴',()=>setBottom('timeline')],['曲线编辑器',()=>setBottom('curve')],['节点编辑器',()=>setBottom('nodes')],['显示 / 隐藏图层控件',()=>act('guide')],['透明网格',()=>act('grid')],['最大化合成视图',()=>act('focus')],['键盘快捷键',help]])
};
function setBottom(tab){bottomTab=tab;renderBottom()}
function workPoint(i){edit(()=>{const c=C(),v=clamp(time,i?c.work[0]+1/FPS():0,i?c.duration:c.work[1]-1/FPS());c.work[i]=v})}
function act(action,el,e={}){
 const [a,b,c,d]=action.split(':'),l=S();
 if(a==='tool'){tool=b;pathDraft=null;if(b==='pin'||b==='anchor')guide=true;renderTools();drawGuide();return}
 if(a==='bottom')return setBottom(b);
 if(a==='comp')return activate(b);
 if(a==='ins'){insTab=b;renderIns();drawGuide();return}
 if(a==='select')return choose(b,e.shiftKey||e.ctrlKey);
 if(a==='expand'){if(expanded.has(b))expanded.delete(b);else expanded.add(b);renderTimeline();return}
 if(a==='visible'||a==='lock'){const q=L(b);edit(()=>{const k=a==='visible'?'visible':'locked';q[k]=!q[k]});return}
 if(a==='animation')return e.altKey?expression(l,b):toggleKey(l,b,true);
 if(a==='expr')return expression(l,b);
 if(a==='timeline-key')return toggleKey(L(b),c);
 if(a==='curve'){choose(b);curveProp=c;return setBottom('curve')}
 if(a==='subkey'){if(l&&!l.locked)edit(()=>{const item=l[b][c];if(!item[d]?.keys)item[d]=prop(item[d]);toggleObjectKey(item[d]);expanded.add(l.id)});return}
 if(a==='remove'){if(l&&!l.locked)edit(()=>l[b].splice(+c,1));return}
 if(a==='reorder'){
  const i=+c,j=i+ +d;if(l&&!l.locked&&j>=0&&j<l[b].length)edit(()=>{[l[b][i],l[b][j]]=[l[b][j],l[b][i]]});return
 }
 if(a==='node-add')return popup(el,Object.entries(F.nodeInfo).filter(([k])=>k!=='group').map(([k,v])=>[v[0],()=>nodeAdd(k)]));
 if(a==='node-edit')return nodeEdit();
 if(a==='node-delete')return deleteNode();
 if(a==='node-copy'){
  const nodes=C().nodes,n=nodes.find(q=>q.id===nodeSel);
  if(n)edit(()=>{
   const clone=(p,seen=new Set())=>{
    const q=copy(p);q.id=F.uid('node');q.x+=28;q.y+=34;seen.add(p.id);
    const inner=nodes.find(a=>a.id===q.internal&&!seen.has(a.id));if(inner)q.internal=clone(inner,seen).id;
    nodes.push(q);return q
   };
   const q=clone(n);q.name+=' 副本';nodeSel=q.id
  });return
 }
 if(a==='node-group'){
  const n=C().nodes.find(q=>q.id===nodeSel);if(n&&nodePorts(n).out==='geometry')edit(()=>{
   const inputs=nodePorts(n).ins;
   const group={id:F.uid('node'),type:'group',name:n.name+' · 组',x:n.x,y:n.y,inputs,internal:n.id};
   for(const [key] of inputs)if(n[key])group[key]=n[key];
   for(const q of C().nodes)for(const [k] of nodePorts(q).ins)if(q[k]===n.id)q[k]=group.id;
   for(const l of C().layers)if(l.node===n.id)l.node=group.id;
   n.hidden=true;C().nodes.push(group);nodeSel=group.id
  });return
 }
 if(a==='node-unpack'){
  const outer=C().nodes.find(q=>q.id===nodeSel&&q.type==='group'),inner=C().nodes.find(q=>q.id===outer?.internal);
  if(inner)edit(()=>{
   inner.hidden=false;inner.x=outer.x;inner.y=outer.y;
   for(const [k] of nodePorts(outer).ins)inner[k]=outer[k]||null;
   for(const q of C().nodes)for(const [k] of nodePorts(q).ins)if(q[k]===outer.id)q[k]=inner.id;
   for(const l of C().layers)if(l.node===outer.id)l.node=inner.id;
   C().nodes=C().nodes.filter(q=>q!==outer);nodeSel=inner.id
  });return
 }
 if(a==='node-use'){
  const n=C().nodes.find(q=>q.id===nodeSel);
  if(!n||!l||l.locked||nodePorts(n).out!=='geometry'||!['shape','text','geometry','particle'].includes(l.type))return message('请选择可编辑的几何或粒子图层与几何输出');
  edit(()=>l.node=n.id);return
 }
 if(a==='play'){play?stop():start();drawGuide();return}
 if(a==='loop'){loop=!loop;renderTools();return}
 if(a==='start'||a==='end'||a==='back'||a==='forward'){
  stop();setTime(a==='start'?C().work[0]:a==='end'?C().work[1]:time+(a==='back'?-1:1)/FPS());return
 }
 if(a==='snap'){snap=!snap;renderBottom();return}
 if(a==='zoom-in'||a==='zoom-out'){timeZoom=clamp(timeZoom+(a==='zoom-in'?.5:-.5),1,8);renderBottom();return}
 if(a==='guide'){guide=!guide;renderTools();drawGuide();return}
 if(a==='grid'){grid=!grid;$('#stage').classList.toggle('checker',grid);renderTools();return}
 if(a==='focus'){document.body.classList.toggle('focus-view');fitView();return}
 if(a==='settings')return settings();
 if(a==='add-menu')return addMenu(el);
 if(a==='goto')return dialog('转到时刻',[['t','秒','number',N(time)]],v=>{stop();setTime(v.t)});
 if(!l||l.locked)return;
 if(a==='effect-menu')return popup(el,Object.entries(fxNames).map(([k,v])=>[v,()=>effectAdd(k)]));
 if(a==='mask-menu')return popup(el,[['矩形蒙版',()=>maskAdd('rect')],['椭圆蒙版',()=>maskAdd('ellipse')],['自由路径蒙版',()=>{tool='mask';renderTools();message('按住 Alt 用钢笔绘制蒙版路径')}]]); 
 if(a==='op-menu')return popup(el,Object.entries(opNames).map(([k,v])=>[v,()=>opAdd(k)]));
 if(a==='mask-options'){
  const m=l.masks[+b];
  const fs=[['invert','反转','checkbox',m.invert],['mode','组合模式','select',m.mode,[['add','添加'],['subtract','减去'],['intersect','交集']]]];
  if(m.path)fs.push(['path','路径坐标（JSON）','textarea',JSON.stringify(F.base(m.path,time))],['anim','为路径设置关键帧','checkbox',Boolean(m.path.keys.length)]);
  return dialog('蒙版选项',fs,v=>{
   let pts;try{if(v.path){pts=JSON.parse(v.path);if(!Array.isArray(pts)||!pts.every(p=>Array.isArray(p)&&p.slice(0,2).every(Number.isFinite)))throw Error()}}catch{return message('路径坐标格式不对')}
   edit(()=>{m.invert=v.invert;m.mode=v.mode;
    if(pts){if(v.anim){if(!m.path.keys.length)m.path.keys=[{t:time,v:pts,in:'linear',out:'linear'}];else F.set({p:{p:m.path}},'p',time,pts)}else m.path=prop(pts)}
   })
  })
 }
 if(a==='matte')return dialog('轨道遮罩',[
  ['source','源图层','select',l.matte?.source,[['','无'],...C().layers.filter(q=>q.id!==l.id).map(q=>[q.id,q.name])]],
  ['mode','遮罩模式','select',l.matte?.mode||1,[[1,'Alpha'],[2,'Alpha 反转'],[3,'亮度'],[4,'亮度反转']]]
 ],v=>edit(()=>l.matte=v.source?{source:v.source,mode:+v.mode}:null));
 if(a==='trim-dialog')return dialog('图层入点与出点',[['in','入点','number',l.start],['out','出点','number',l.end]],v=>edit(()=>{l.start=clamp(v.in,0,C().duration);l.end=clamp(v.out,l.start,C().duration)}));
 if(a==='particle-links'||a==='field-links')return listLinks(l,a==='particle-links');
 if(a==='path-keys'){toggleKey(l,'path');guide=true;drawGuide();return}
 if(a==='remap-setup'){
  if(!l.p.remap.keys.length)edit(()=>{l.p.remap.keys=prop(0,[[l.start,0],[l.end,l.end-l.start]]).keys;expanded.add(l.id)});return
 }
 if(a==='burst')return dialog('爆发事件',[['events','每行输入 秒数, 粒子数','textarea',(l.bursts||[]).map(x=>x.join(', ')).join('\n')]],v=>edit(()=>l.bursts=v.events.split('\n').map(x=>x.split(/[,，]/).map(Number)).filter(x=>x.length===2&&x.every(Number.isFinite)).map(([t,n])=>[clamp(t,0,C().duration),clamp(Math.floor(n),0,350)])));
 if(a==='audio-hits')return dialog('重音时间',[['events','秒数（逗号分隔）','text',(l.hits||[]).join(', ')]],v=>edit(()=>l.hits=v.events.split(/[,，]/).filter(x=>x.trim()).map(Number).filter(Number.isFinite)));
}
document.addEventListener('click',e=>{
 const p=$('#popup');if(!e.target.closest('#popup'))p.hidden=true;
 const action=e.target.closest('[data-action]'),menu=e.target.closest('[data-menu]'),jump=e.target.closest('[data-jump]'),port=e.target.closest('[data-port]');
 if(menu)return menus[menu.dataset.menu]?.(menu);
 if(action)return act(action.dataset.action,action,e);
 if(jump){stop();setTime(+jump.dataset.jump);return}
 if(port)connectPort(port.dataset.port);
});
document.addEventListener('dblclick',e=>{
 const l=e.target.closest('.layer-name'),n=e.target.closest('[data-node-drag]'),p=e.target.closest('[data-expression]');
 if(l)rename(L(l.dataset.action.split(':')[1]));
 else if(n){nodeSel=n.dataset.nodeDrag;nodeEdit()}
 else if(p)expression(S(),p.dataset.expression)
});
document.addEventListener('contextmenu',e=>{
 const k=e.target.closest('[data-key]'),p=e.target.closest('[data-port]'),r=e.target.closest('[data-layer-row]'),path=e.target.closest('[data-path]');
 if(k){e.preventDefault();keyContext(k,e)}
 else if(p){e.preventDefault();connectPort(p.dataset.port,true)}
 else if(path&&S()?.p.path){e.preventDefault();const l=S(),[j,i]=path.dataset.path.split(':');popup(path,[['添加切线',()=>edit(()=>{const rs=copy(F.base(l.p.path,time)),row=rs[j];row.handles||=[];row.handles[i]={in:[-21,0],out:[21,0]};F.set(l,'path',time,rs)})],['删除控制点',()=>edit(()=>{const rs=copy(F.base(l.p.path,time)),row=rs[j];if(row.points.length>2){row.points.splice(i,1);row.handles?.splice(i,1);F.set(l,'path',time,rs)}})]],e)}
 else if(r){e.preventDefault();if(!selected.has(r.dataset.layerRow))choose(r.dataset.layerRow);layerMenu(r)}
});
document.addEventListener('change',e=>{
 const el=e.target,d=el.dataset,l=S();
 if(el.id==='zoom-view'){viewOffset=[0,0];return fitView()}
 if(el.id==='time-zoom'){timeZoom=+el.value;renderTimeline();return}
 if(el.id==='curve-property'){curveProp=el.value;renderCurve();return}
 if(el.id==='curve-kind'){curveType=el.value;updateCurve();return}
 if(el.id==='curve-component'){curveComponent=+el.value;updateCurve();return}
 if(d.parent!==undefined)return parent(L(d.parent),el.value);
 if(d.prop){
  const q=L(d.layer),p=q?.p[d.prop];if(!p||q.locked)return syncValues();
  let v=el.type==='number'?+el.value:el.value;
  if(el.type==='number'&&(el.value===''||!Number.isFinite(v)))return syncValues();
  const old=F.base(p,time);
  if(Array.isArray(old)){let next=copy(old);next[+d.idx]=v;v=next}
  edit(()=>F.set(q,d.prop,time,v),d.prop==='text');return
 }
 if(!l||l.locked)return;
 if(d.option){
  const val=el.type==='checkbox'?el.checked:el.value;
  edit(()=>{l[d.option]=val||(['source','node'].includes(d.option)?null:val);if(d.option==='shape'&&val==='path'&&!l.p.path)l.p.path=prop([F.ring([[-100,-70],[100,-70],[0,105]])])});return
 }
 if(d.opSource!==undefined){edit(()=>l.ops[+d.opSource].source=el.value);return}
 if(d.sub){
  const item=l[d.sub][+d.index],p=item[d.name]?.keys?item[d.name]:prop(item[d.name]);let v=el.type==='number'?+el.value:el.value;
  if(d.idx!==undefined){const a=copy(F.base(p,time));a[+d.idx]=v;v=a}
  edit(()=>{item[d.name]=p;F.set({p:{p}},'p',time,v)},false)
 }
});
$('#time-zoom')?.addEventListener('input',()=>{});
$('#file-input').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{const p=JSON.parse(await file.text());if(!valid(p))throw Error();load(p);$('#doc-status').textContent='本地工程';message('工程已打开')}
 catch{message('无法打开此工程文件')}
 e.target.value=''
});
let rowDrag;
$('#bottom-content').addEventListener('dragstart',e=>{const r=e.target.closest('[data-layer-row]');if(r){rowDrag=r.dataset.layerRow;e.dataTransfer.setData('text/plain',rowDrag);e.dataTransfer.effectAllowed='move'}});
$('#bottom-content').addEventListener('dragover',e=>{if(rowDrag&&e.target.closest('[data-layer-row]'))e.preventDefault()});
$('#bottom-content').addEventListener('drop',e=>{const r=e.target.closest('[data-layer-row]');if(!r||!rowDrag)return;e.preventDefault();const to=L(r.dataset.layerRow),from=L(rowDrag);rowDrag=null;if(!from||from===to||from.locked)return;edit(()=>{const ls=C().layers,i=ls.indexOf(to);ls.splice(ls.indexOf(from),1);ls.splice(i,0,from)})});
$('#bottom-content').addEventListener('dragend',()=>rowDrag=null);
$('#stage').addEventListener('pointerdown',startStage);
$('#stage').addEventListener('contextmenu',e=>{if(e.target.closest('[data-path]'))return;e.preventDefault();if(pathDraft)finishPath(false);else if(S())layerMenu($('#stage'))});
function snapTime(value,width,excluded=new Set()){
 const c=C(),t=clamp(value,0,c.duration);
 if(!snap)return t;
 let closest=Math.round(t*FPS())/FPS(),best=5*c.duration/width;
 const consider=mark=>{const d=Math.abs(t-mark);if(d<best){best=d;closest=mark}};
 [...c.work,...c.chapters.map(ch=>ch.t)].forEach(consider);
 for(const l of c.layers){
  consider(l.start);consider(l.end);
  if(selected.has(l.id))for(const [k,p] of layerParameters(l))for(const f of p.keys)if(!excluded.has(keyId(l.id,k,f.t)))consider(f.t)
 }
 return closest
}
function timeFrom(e,rect){return snapTime((e.clientX-rect.left)/rect.width*C().duration,rect.width)}
function curveCoord(e,r){return [(e.clientX-r.left)/r.width*1200,(e.clientY-r.top)/r.height*190]}
$('#bottom-content').addEventListener('pointerdown',e=>{
 if(e.button!==0||currentRun)return;
 const key=e.target.closest('[data-key]'),hd=e.target.closest('[data-handle]'),ruler=e.target.closest('.ruler'),t=e.target.closest('[data-track]'),n=e.target.closest('[data-node-drag]'),svg=e.target.closest('#curve-svg');
 if(n){
  const item=C().nodes.find(q=>q.id===n.dataset.nodeDrag);nodeSel=item.id;drag={type:'node',item,x:e.clientX,y:e.clientY,base:[item.x,item.y]};e.preventDefault();return
 }
 if(play&&(ruler||key||t||svg))stop();
 if(key||hd){
  e.preventDefault();const id=(key||hd).dataset[hd?'keyref':'key'];
  if(!keySel.has(id)&&!e.shiftKey)keySel.clear();
  if(!hd&&e.shiftKey&&keySel.has(id))keySel.delete(id);else keySel.add(id);
  const q=keyBy(id);if(!q.f||q.l.locked)return;
  if(!svg)selected=new Set([q.l.id]);
  const rect=(svg||$('.time-column')).getBoundingClientRect();
  drag={type:hd?'curve-handle':svg?'curve-key':'key',primary:q,els:[...keySel].map(keyBy).filter(x=>x.f&&!x.l.locked).map(x=>({...x,t:x.f.t,v:copy(x.f.v)})),graph:graphState,rect,x:e.clientX,y:e.clientY,side:hd?.dataset.handle};
  time=q.f.t;refreshFrame();if(!svg){renderTimeline();renderIns()}else updateCurve();return
 }
 if(ruler){e.preventDefault();drag={type:'scrub',rect:$('.time-column').getBoundingClientRect()};setTime(timeFrom(e,drag.rect),true);return}
 if(t){
  const l=L(t.dataset.track);if(!selected.has(l.id)||e.shiftKey)choose(l.id,e.shiftKey);
  if(l.locked)return;
  const rect=$('.time-column').getBoundingClientRect();
  drag={type:'clip',l,rect,start:l.start,end:l.end,mode:e.target.dataset.trim||'move',where:timeFrom(e,rect),x:e.clientX};e.preventDefault();return
 }
 if(svg){const [x]=curveCoord(e,svg.getBoundingClientRect());setTime((x-58)/1118*C().duration);return}
 if(e.target.closest('.track-area')&&!e.target.closest('button')){
  e.preventDefault();
  const cont=$('#bottom-content'),r=cont.getBoundingClientRect();
  if(e.shiftKey||e.altKey){
   marquee=document.createElement('div');marquee.className='drag-marquee';cont.append(marquee);drag={type:'marquee',x:e.clientX,y:e.clientY,rect:r,ext:e.shiftKey};
  }else{drag={type:'scrub',rect:$('.time-column').getBoundingClientRect()};setTime(timeFrom(e,drag.rect),true)}
 }
});
window.addEventListener('pointermove',e=>{
 if(!drag)return;
 const d=drag;
 if(['view','pen','draw','transform','spatial','point'].includes(d.type))return continueStage(e);
 if(d.type==='scrub'){setTime(timeFrom(e,d.rect),true);return}
 if(d.type==='marquee'){
  const x=Math.min(e.clientX,d.x),y=Math.min(e.clientY,d.y),w=Math.abs(e.clientX-d.x),h=Math.abs(e.clientY-d.y);
  Object.assign(marquee.style,{left:x-d.rect.left+'px',top:y-d.rect.top+'px',width:w+'px',height:h+'px'});d.bounds=[x,y,x+w,y+h];return
 }
 if(Math.hypot(e.clientX-d.x,e.clientY-(d.y??e.clientY))<3&&!d.did)return;
 beginDrag();
 if(d.type==='node'){
  d.item.x=Math.max(10,d.base[0]+e.clientX-d.x);d.item.y=Math.max(10,d.base[1]+e.clientY-d.y);renderNodes();return
 }
 if(d.type==='clip'){
  const dt=timeFrom(e,d.rect)-d.where,l=d.l;
  if(d.mode==='start')l.start=clamp(d.start+dt,0,d.end);
  else if(d.mode==='end')l.end=clamp(d.end+dt,d.start,C().duration);
  else {
   const move=clamp(dt,-d.start,C().duration-d.end);l.start=d.start+move;l.end=d.end+move;
   if(d.lastMove===undefined)d.lastMove=0;
   for(const [,p] of layerParameters(l))for(const k of p.keys)k.t+=move-d.lastMove;
   if(l.bursts)l.bursts=l.bursts.map(([t,n])=>[t+move-d.lastMove,n]);
   if(l.hits)l.hits=l.hits.map(t=>t+move-d.lastMove);d.lastMove=move
  }
  renderTimeline();changed(false);return
 }
 if(d.type==='curve-handle'){
  const [x,y]=curveCoord(e,d.rect),q=d.primary,sign=d.side==='in'?-1:1;
  const next=q.p.keys[q.p.keys.indexOf(q.f)+sign],key=d.side==='in'?'easeIn':'easeOut';
  if(next){
   const index=curveComponent,v=a=>Array.isArray(a)?a[index]:a, yy=d.graph.y(v(q.f.v)),delta=d.graph.y(v(next.v))-yy;
   q.f[key]=delta?clamp((y-yy)/delta,-.5,1.5):0;
   q.f[key+'X']=clamp(Math.abs(x-d.graph.x(q.f.t))/Math.abs(d.graph.x(next.t)-d.graph.x(q.f.t)),.015,.495);
   q.f[d.side]='bezier'
  }
  changed(false);updateCurve();return
 }
 if(d.type==='key'||d.type==='curve-key'){
  const dx=(e.clientX-d.x)/d.rect.width*C().duration*(d.type==='curve-key'?1200/1118:1);
  const min=Math.min(...d.els.map(q=>q.t)),max=Math.max(...d.els.map(q=>q.t));
  const original=d.els.find(q=>q.f===d.primary.f)?.t??min;
  const excluded=new Set(d.els.map(q=>keyId(q.l.id,q.k,q.f.t)));
  const shift=clamp(snapTime(original+dx,d.rect.width,excluded)-original,-min,C().duration-max);
  keySel.clear();
  for(const q of d.els){
   q.f.t=q.t+shift;const v=q.v;
   if(d.type==='curve-key'){
    const diff=-(e.clientY-d.y)/d.rect.height*190/148*(d.graph.max-d.graph.min);
    if(curveType==='value'){if(Array.isArray(v)){q.f.v=copy(v);q.f.v[curveComponent]+=diff}else if(typeof v==='number')q.f.v=v+diff}
    else{q.f.out='bezier';q.f.easeOut=clamp(diff/(d.graph.max-d.graph.min),-.5,1)}
   }
   q.p.keys.sort((a,b)=>a.t-b.t);keySel.add(keyId(q.l.id,q.k,q.f.t))
  }
  time=d.primary.f.t;
  if(d.type==='key')renderTimeline();else updateCurve();changed(false)
 }
});
window.addEventListener('pointerup',e=>{
 if(!drag)return;
 const d=drag;
 if(['view','pen','draw','transform','spatial','point'].includes(d.type))endStage(e);
 if(d.type==='marquee'&&marquee){
  if(!d.ext)keySel.clear();
  if(d.bounds)for(const k of $$('.track-area [data-key]')){
   const {left,top,width,height}=k.getBoundingClientRect(),[a,b,c,f]=d.bounds;if(left+width>=a&&left<=c&&top+height>=b&&top<=f)keySel.add(k.dataset.key)
  }
  marquee.remove();marquee=null;renderTimeline()
 }
 if(d.did){$('#undo').disabled=false;$('#redo').disabled=true}
 drag=null
});
window.addEventListener('keydown',e=>{
 if(currentRun||$('#dialog').open||e.target.matches('input,textarea,select,[contenteditable=true]'))return;
 const k=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;
 if(ctrl){
  const action=k==='s'?save:k==='o'?()=>$('#file-input').click():k==='n'?()=>load(F.empty()):k==='z'?()=>restore(e.shiftKey?1:-1):k==='y'?()=>restore(1):k==='d'?duplicate:k==='c'?e.shiftKey?precompose:copyKeys:k==='v'?pasteKeys:null;
  if(action){e.preventDefault();action()}return
 }
 if(k===' '){e.preventDefault();act('play');return}
 if(k==='arrowleft'||k==='arrowright'){e.preventDefault();act(k==='arrowleft'?'back':'forward');return}
 if(k==='home'||k==='end'){e.preventDefault();act(k==='home'?'start':'end');return}
 if(k==='j'||k==='k'){navigateKey(k==='j'?-1:1);return}
 if(k==='delete'||k==='backspace'){e.preventDefault();del();return}
 if(k==='enter'&&pathDraft){e.preventDefault();finishPath(false);return}
 if(k==='escape'){$('#popup').hidden=true;pathDraft=null;chosenPort=null;drawGuide();return}
 if(k==='f9'){
  e.preventDefault();const set=keySel.size?[...keySel].map(keyBy).filter(x=>x.f&&!x.l.locked).map(x=>x.f):S()?.locked?[]:layerParameters(S()).flatMap(([,p])=>p.keys.filter(f=>Math.abs(f.t-time)<=.001));
  if(set.length){edit(()=>set.forEach(f=>{f.in=f.out='bezier';f.easeIn=f.easeOut=0}));message('已应用缓入缓出')};return
 }
 if(k==='b'||k==='n'){workPoint(k==='b'?0:1);return}
 const t={v:'select',h:'hand',w:'rotate',s:'scale',y:'anchor',q:'rect',g:'pen',t:'text'}[k];if(t)act('tool:'+t);
});
for(const [id,i,fn] of [
 ['save','save',save],['undo','undo',()=>restore(-1)],['redo','redo',()=>restore(1)],['help','help',help],['project-add','plus',()=>settings(true)],['project-options','dots',()=>menus.comp($('#project-options'))],
 ['focus-view','expand',()=>act('focus')],['guide','guide',()=>act('guide')],['grid','grid',()=>act('grid')],['sound','sound',()=>{mute=!mute;clearAudio();renderTools();updateAudioMeter()}],
 ['view-mode','camera',()=>{alternate=!alternate;renderTools();refreshFrame()}],['ins-menu','dots',()=>layerMenu($('#ins-menu'))]
]){
 const b=$('#'+id);b.innerHTML=ic(i)+(id==='save'?'保存工程':'');b.onclick=fn
}
$('#project-title').innerHTML=ic('folder')+'<b>项目</b>';$('#viewer-icon').innerHTML=ic('comp');
function nextPaint(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}
window.videoExport={
 runs:['demo'],
 async begin(runId,{fps=60}={}){
  if(runId!=='demo'||!Number.isFinite(fps)||fps<=0)throw Error('导出配置无效');
  if(currentRun)this.end();
  const saved={project,time,selected,tool,insTab,bottomTab,timeZoom,detailsState,guide,alternate,grid,play,expanded:[...expanded],keySel:[...keySel],nodeSel,focus:document.body.classList.contains('focus-view'),zoom:$('#zoom-view').value,viewOffset:[...viewOffset]};
  stop();currentRun={saved,fps};guide=false;alternate=false;grid=false;tool='select';project=makeDemo();selected=new Set(['glyph']);time=0;insTab='properties';bottomTab='timeline';timeZoom=1;detailsState={};expanded.clear();keySel.clear();nodeSel=null;
  document.body.classList.remove('focus-view');$('#zoom-view').value='fit';viewOffset=[0,0];
  changed();await document.fonts.ready;await nextPaint();refreshFrame();return {frames:15*fps}
 },
 async frame(i){
  if(!currentRun||i<0||i>=15*currentRun.fps||!Number.isInteger(i))throw Error('帧索引超出范围');
  time=i/currentRun.fps;refreshFrame();await new Promise(resolve=>requestAnimationFrame(resolve))
 },
 end(){
  if(!currentRun)return;
  const o=currentRun.saved;currentRun=null;
  ({project,time,selected,tool,insTab,bottomTab,timeZoom,detailsState,guide,alternate,grid,nodeSel}=o);expanded=new Set(o.expanded);keySel=new Set(o.keySel);
  document.body.classList.toggle('focus-view',o.focus);$('#zoom-view').value=o.zoom;viewOffset=o.viewOffset;
  changed();if(o.play)start()
 }
};
try{RF.init($('#render'));renderReady=true}
catch(e){$('#engine-status').textContent='WebGL 2 不可用';message(e.message)}
refreshUI();
new ResizeObserver(()=>fitView()).observe($('#stage-area'));

