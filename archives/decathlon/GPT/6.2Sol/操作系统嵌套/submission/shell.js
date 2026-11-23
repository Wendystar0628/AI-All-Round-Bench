import {attrs,btn,ico,badge,el,esc,on,get,appInfo,stamp} from './ui.js';
import {systems,byId,children,ancestry,effective,stateNames} from './runtime.js';
const names={...stateNames,running:'运行中',error:'内核错误'};
const clockFmt=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const dateFmt=new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',weekday:'short'});
const rootApps=['files','spreadsheet','browser','widgets','editor','tasks','settings','systems','help'];
const innerApps=['player','charts','files','editor','tasks','systems','settings','help'];
export const desks=s=>s.id==='outer'?rootApps:innerApps;
const deskApps=s=>s.id==='outer'?rootApps.slice(0,8):innerApps.slice(0,6);
const desktops=new Map(),windows=new Map();
let api, globalDialog=null, globalMenu=null;
export function attach(shellApi){api=shellApi;}
export const view=id=>windows.get(id);
export function discard(id){windows.get(id)?.node.remove();windows.delete(id);}
export function clear(){
 closeMenu();globalDialog?.resolve(null);for(const v of windows.values())v.node.remove();
 desktops.clear();windows.clear();document.getElementById('mount').replaceChildren();
}
export function prune(){
 for(const d of desktops.values())if(byId(d.s.id)!==d.s){d.node.remove();desktops.delete(d.s.id);}
 for(const [id,v] of windows)if(byId(v.w.systemId)?.wins[id]!==v.w)discard(id);
 if(globalDialog&&!globalDialog.box.isConnected)globalDialog.resolve(null);
 if(globalMenu&&!globalMenu.isConnected)closeMenu();
}
export function toast(s,message,type){
 const d=desktops.get(s.id);if(!d)return;
 const n=el('div','toast '+type,ico(type==='error'?'close':'check')+'<span>'+esc(message)+'</span>');
 d.toast.append(n);while(d.toast.children.length>3)d.toast.firstChild.remove();
 setTimeout(()=>n.remove(),3200);if(!d.notice.hidden)drawNotices(s,d);
}
function drawNotices(s,d){
 d.notice.innerHTML='<header><div><div class="eyebrow">ACTIVITY</div><b>通知中心</b></div>'+btn(s.settings.dnd?'关闭免打扰':'开启免打扰','notice-dnd')+'</header><div class="notice-list">'+(s.notes.length?s.notes.map(n=>'<div class="notice-item">'+ico(n.type==='error'?'close':'bell')+'<div><strong>'+esc(n.message)+'</strong><small>'+clockFmt.format(new Date(s.epoch+n.time*1000))+' · '+esc(s.id)+'</small></div></div>').join(''):'<p>暂无通知。</p>')+'</div>';
 stamp(d.notice,s.id);on(d.notice,'notice-dnd',()=>{s.settings.dnd=!s.settings.dnd;drawNotices(s,d);api.persist();});
}
export function notices(s){const d=desktops.get(s.id);if(!d)return;d.notice.hidden=!d.notice.hidden;if(!d.notice.hidden){d.start.hidden=true;drawNotices(s,d);}}
function closeMenu(){if(globalMenu){globalMenu.remove();globalMenu=null;}}
export function menu(s,ev,items){
 closeMenu();if(effective(s)!=='running')return;
 const d=desktops.get(s.id);if(!d)return;
 const surface=d.stage, r=surface.getBoundingClientRect(), z=r.width/surface.offsetWidth;
 const m=el('div','popup-menu',items.map(([label,_,id,extra])=>btn(label,id,{attrs:extra})).join(''));
 surface.append(m);globalMenu=m;
 const ox=(ev.clientX-r.left)/z,oy=(ev.clientY-r.top)/z;
 Object.assign(m.style,{left:Math.max(5,Math.min(ox,surface.offsetWidth-m.offsetWidth-5))+'px',top:Math.max(5,Math.min(oy,surface.offsetHeight-m.offsetHeight-5))+'px'});
 stamp(m,s.id,ev.currentTarget?.closest('[data-window-id]')?.dataset.windowId);
 [...m.children].forEach((n,i)=>n.onclick=()=>{closeMenu();items[i][1]();});
}
export function dialog(s,title,message,actions,body=''){
 if(globalDialog)globalDialog.resolve(null);
 let d=desktops.get(s.id)??desktops.get('outer');
 if(!d||!d.node.offsetWidth)d=desktops.get('outer');
 if(!d)return Promise.resolve(null);
 const previousFocus=document.activeElement;
 const box=el('div','dialog-layer','<section role="dialog" aria-modal="true" aria-label="'+esc(title)+'" class="dialog"><div class="dialog-head">'+badge('system',true)+'<b>'+esc(title)+'</b></div><div class="dialog-body">'+(message?'<p>'+esc(message)+'</p>':'')+body+'</div><footer>'+actions.map((a,i)=>btn(a.label,'dialog-action-'+i,{cls:a.primary?'primary':''})).join('')+'</footer></section>');
 d.stage.append(box);stamp(box,d.s.id);
 return new Promise(resolve=>{
   const close=value=>{
     box.remove();if(globalDialog?.box===box)globalDialog=null;
     if(previousFocus?.isConnected&&previousFocus.offsetWidth)previousFocus.focus({preventScroll:true});
     resolve(value);
   };
   globalDialog={box,resolve:close};
   actions.forEach((a,i)=>on(box,'dialog-action-'+i,()=>close(typeof a.value==='function'?a.value(box):a.value)));
   const key=box.querySelector('input,select')??box.querySelector('.primary')??box.querySelector('button');
   key?.focus();box.onkeydown=ev=>{
     if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();close(null);return;}
     if(ev.key==='Enter'&&ev.target.tagName==='INPUT'){ev.preventDefault();box.querySelector('.primary')?.click();return;}
     if(ev.key==='Tab'){
       const controls=[...box.querySelectorAll('input,button,select,textarea,[tabindex]')].filter(n=>!n.disabled&&n.offsetWidth>0&&n.tabIndex>=0);
       const first=controls[0],last=controls.at(-1);
       if(ev.shiftKey&&ev.target===first){ev.preventDefault();last?.focus();}
       else if(!ev.shiftKey&&ev.target===last){ev.preventDefault();first?.focus();}
     }
   };
 });
}
export function ask(s,title,label,value=''){
 return dialog(s,title,'',[{label:'确定',value:n=>n.querySelector('input').value,primary:true},{label:'取消',value:null}],'<label>'+esc(label)+'<input data-testid="dialog-value" value="'+esc(value)+'" aria-label="'+esc(label)+'"></label>');
}
export function pick(s,title,predicate,cb,displaySystem=s){
 const choices=Object.keys(s.files).filter(p=>s.files[p].kind!=='dir'&&predicate(p));
 const markup=choices.length?'<select data-testid="file-picker" aria-label="'+esc(title)+'" size="'+Math.min(11,Math.max(3,choices.length))+'">'+choices.map((p,i)=>'<option'+(i===0?' selected':'')+' value="'+esc(p)+'">'+esc(p)+'</option>').join('')+'</select>':'<p>没有符合条件的文件。</p>';
 const out=dialog(displaySystem,title,'',choices.length?[{label:'打开',value:n=>get(n,'file-picker').value,primary:true},{label:'取消',value:null}]:[{label:'关闭',value:null}],markup);
 const sel=globalDialog?.box?.querySelector('select');if(sel)sel.ondblclick=()=>globalDialog.resolve(sel.value);
 return out.then(v=>{if(v&&s.files[v])cb(v);});
}
function desktop(s){
 if(desktops.get(s.id)?.s===s)return desktops.get(s.id);
 const root=s.id==='outer',node=el('section','desktop '+(root?'outer':'inner'));
 node.dataset.testid='os-desktop';node.dataset.systemId=s.id;
 node.innerHTML='<div class="desk-stage"><div class="wallpaper"></div><div class="grain"></div><header class="desktop-head"><div class="brand"><span class="mark">'+ico('logo')+'</span><div><b>STRATA<span> OS</span></b><small>层栈工作空间</small></div></div><div class="head-route"></div><div class="head-right"><span class="head-status"><i></i> 运行中</span>'+(root?'<div class="host-buttons">'+btn('最小化宿主','host-min',{icon:'min',only:true})+btn('最大化宿主','host-max',{icon:'max',only:true})+btn('退出层栈','host-close',{icon:'close',only:true})+'</div>':btn('返回父桌面','return-parent',{icon:'back',only:true}))+'</div></header>'+
 '<div class="desktop-shortcuts"></div><div class="desk-intro"></div><div class="desktop-caption"></div><div class="win-area"></div><div class="desk-frozen" hidden></div><div class="start-menu" data-testid="start-menu" hidden></div><div class="notices" hidden></div><div class="toasts"></div><footer class="taskbar"><div class="taskbar-start">'+btn('开始','start-toggle',{icon:'logo',cls:'start-toggle'})+'</div><div class="task-fixed"></div><span class="task-divider"></span><div class="task-running"></div><div class="task-tray">'+(root?btn('小组件','widgets-toggle',{icon:'widgets',only:true}):'')+btn('通知中心','notifications-toggle',{icon:'bell',only:true})+ico('wifi','tray-wifi')+'<div class="tray-clock"><b></b><small></small></div></div></footer></div>';
 const d={s,node,stage:node.firstElementChild,area:node.querySelector('.win-area'),start:node.querySelector('.start-menu'),notice:node.querySelector('.notices'),toast:node.querySelector('.toasts')};
 desktops.set(s.id,d);
 on(node,'start-toggle',()=>toggleStart(s,d));on(node,'notifications-toggle',()=>notices(s));on(node,'widgets-toggle',()=>api.open(s,'widgets'));
 if(root)for(const a of ['min','max','close'])on(node,'host-'+a,()=>{if(a==='close'){api.persistNow()?.finally(()=>host.window('close'));return;}host.window(a==='min'?'minimize':'maximize');});
 else on(node,'return-parent',()=>{const p=byId(s.parentId),w=Object.values(p.wins).find(w=>w.target===s.id);if(w)api.wm(p,{verb:'min',id:w.id});});
 node.addEventListener('contextmenu',ev=>{
   if(ev.defaultPrevented||ev.target.closest('.desktop')!==node||ev.target.closest('.window,.taskbar,.start-menu,.popup-menu,.dialog'))return;
   ev.preventDefault();menu(s,ev,[['新建子系统',()=>api.wm(s,{verb:'system',cmd:'system-new'})],['打开文件管理器',()=>api.open(s,'files')],['打开系统树',()=>api.open(s,'systems')],['个性化',()=>api.open(s,'settings')]]);
 });
 node.addEventListener('pointerdown',ev=>{
   if(ev.target.closest('.desktop')!==node)return;
   if(!ev.target.closest('.start-menu,[data-testid="start-toggle"]'))d.start.hidden=true;
   if(!ev.target.closest('.notices,[data-testid="notifications-toggle"],[data-testid="widget-notifications"]'))d.notice.hidden=true;
   if(!ev.target.closest('.desk-icon'))node.querySelectorAll('.desk-icon.selected').forEach(n=>n.classList.remove('selected'));
 });
 paintDesk(s,d);return d;
}
function paintDesk(s,d){
 const root=s.id==='outer',level=ancestry(s).length,q=sel=>d.node.querySelector(':scope > .desk-stage > '+sel);
 d.node.style.setProperty('--accent',s.settings.accent);d.stage.style.zoom=s.settings.scale;
 d.node.dataset.level=level;d.node.setAttribute('aria-label',s.name+' 桌面');d.node.classList.toggle('deep',level>2);
 const key=[s.name,s.id,level,s.settings.wallpaper].join('|');
 if(d.renderedKey!==key){
   d.renderedKey=key;q('.wallpaper').className='wallpaper wall-'+s.settings.wallpaper;
   q('.desktop-head .head-route').innerHTML=ancestry(s).map((x,i)=>'<span'+(i===level-1?' class="current"':'')+'>'+esc(i===0?'根桌面':x.id)+'</span>').join('<i>/</i>');
   const shortcuts=q('.desktop-shortcuts');
   const demo=root?'/Demo/sample.sheet':'/Demo/helicopter-24.scene', demoName=root?'示例工作簿':'24 号场景';
   shortcuts.innerHTML=deskApps(s).map(app=>'<button class="desk-icon" data-testid="desktop-icon" data-app-id="'+app+'" aria-label="'+appInfo[app][0]+'">'+badge(app)+'<span>'+appInfo[app][0]+'</span></button>').join('')+
     '<button class="desk-icon desk-file" data-testid="desktop-icon" data-file-path="'+demo+'" aria-label="'+demoName+'">'+badge(root?'spreadsheet':'player')+'<span>'+demoName+'</span></button>'+
     (root?'<button class="desk-icon" data-testid="desktop-icon" data-app-id="help" aria-label="操作说明">'+badge('help')+'<span>操作说明</span></button>':'');
   for(const b of shortcuts.children){
     const open=()=>b.dataset.filePath?api.openFile(s,b.dataset.filePath):api.open(s,b.dataset.appId);
     b.onclick=()=>{[...shortcuts.children].forEach(n=>n.classList.toggle('selected',n===b));};b.ondblclick=open;
     b.onkeydown=ev=>{if(ev.key==='Enter')open();};b.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();menu(s,ev,[['打开 '+b.getAttribute('aria-label'),open]]);};
   }
   const intro=q('.desk-intro');
   intro.innerHTML=root?
   '<div class="intro-kicker"><i></i> 高地观测站 <span>STRATA / FIELD DESKTOP</span></div><div class="intro-main"><div class="intro-layer">系统层级 <code>01 / ROOT</code></div><h1>层栈<span>.</span></h1><p>在同一桌面展开独立的系统。<br>探索飞行、实时数据与程序调度。</p><div class="intro-actions">'+btn('启动子系统','system-new',{icon:'plus',cls:'hero-primary'})+btn('查看系统树','hero-tree',{icon:'tree',cls:'hero-secondary'})+'</div></div><div class="intro-meta"><div><small>当前桌面</small><b>'+esc(s.name)+'</b></div><div><small>直属子系统</small><b class="hero-count">00</b></div><div><small>逻辑时间步</small><b>40 ms</b></div></div>':
   '<div class="intro-kicker"><i></i> 子系统工作空间 <span>LEVEL '+String(level).padStart(2,'0')+'</span></div><div class="intro-main"><div class="intro-layer">所属系统 <code>'+esc(s.parentId)+'</code></div><h1>'+esc(s.name)+'<span>.</span></h1><p>场景播放器与实时图表在本系统运行。</p><div class="intro-actions">'+btn('启动子系统','system-new',{icon:'plus',cls:'hero-primary'})+btn('系统树','hero-tree',{icon:'tree',cls:'hero-secondary'})+'</div></div>';
   on(intro,'system-new',()=>api.wm(s,{verb:'system',cmd:'system-new'}));on(intro,'hero-tree',()=>api.open(s,'systems'));
   q('.desktop-caption').innerHTML=root?'<span class="map-cross">+</span><span><b>松岭湖 · 晨线</b><small>高地观测站 / 桌面壁纸</small></span>':'<span class="map-cross">+</span><span><b>'+esc(s.name)+'</b><small>独立系统 / '+level+' 层</small></span>';
   const fixed=q('.taskbar .task-fixed');fixed.innerHTML=(root?['files','browser','systems']:['player','charts','systems']).map(a=>btn(appInfo[a][0],'pin-'+a,{icon:appInfo[a][1],only:true,attrs:{'data-app-id':a}})).join('');
   for(const n of fixed.children)n.onclick=()=>api.open(s,n.dataset.appId);stamp(d.node,s.id);
 }
 const taskKey=Object.values(s.wins).map(w=>[w.id,w.min,api.title(s,w),s.focus===w.id].join('|')).join(';');
 if(taskKey!==d.taskKey){
   d.taskKey=taskKey;const box=q('.taskbar .task-running');
   box.innerHTML=Object.values(s.wins).map(w=>'<button class="task-item '+(s.focus===w.id&&!w.min?'active':'')+'" data-testid="taskbar-item" data-system-id="'+s.id+'" data-window-id="'+w.id+'" data-app-id="'+w.appId+'" title="'+esc(api.title(s,w))+'" aria-label="'+esc(api.title(s,w))+'">'+ico(appInfo[w.appId]?.[1]??'files')+'<span>'+esc(api.title(s,w))+'</span></button>').join('');
   for(const n of box.children)n.onclick=()=>api.wm(s,{verb:'taskbar',id:n.dataset.windowId});
 }
 const r=q('.desk-intro .hero-count');if(r)r.textContent=String(children(s).filter(x=>x.state!=='stopped').length).padStart(2,'0');
 const state=effective(s),frozen=q('.desk-frozen');frozen.hidden=state==='running';
 if(state!=='running')frozen.innerHTML='<div>'+ico(state==='error'?'close':'pause')+'<b '+(state==='error'?'data-testid="kernel-error" data-system-id="'+s.id+'"':'')+'>'+esc(names[state]??state)+'</b><span>'+esc(s.error||'通过父桌面的系统树继续或重启。')+'</span></div>';
 const st=q('.desktop-head .head-status');st.innerHTML='<i></i> '+esc(names[state]??state);st.classList.toggle('offline',state!=='running');
}
function toggleStart(s,d){
 if(effective(s)!=='running')return;
 d.start.hidden=!d.start.hidden;if(d.start.hidden)return;d.notice.hidden=true;
 d.start.innerHTML='<div class="start-head"><span class="mark">'+ico('logo')+'</span><div><b>'+esc(s.name)+'</b><small>'+esc(s.id)+' · 应用与设置</small></div></div><label class="start-search">'+ico('search')+'<input aria-label="搜索应用" data-testid="start-search" placeholder="搜索应用…"></label><div class="start-apps">'+desks(s).map(a=>'<button data-app-id="'+a+'" data-testid="launch-'+a+'" aria-label="'+appInfo[a][0]+'">'+badge(a,true)+'<b>'+appInfo[a][0]+'</b></button>').join('')+'</div><footer>'+btn('新建子系统','start-system-new',{icon:'plus'})+'<small>STRATA OS</small></footer>';
 stamp(d.start,s.id);
 const input=get(d.start,'start-search'),items=[...d.start.querySelectorAll('[data-app-id]')];
 for(const b of items)b.onclick=()=>{d.start.hidden=true;api.open(s,b.dataset.appId);};
 input.oninput=()=>{const search=input.value.toLowerCase().trim();for(const n of items)n.hidden=!(n.textContent+n.dataset.appId).toLowerCase().includes(search);};
 input.onkeydown=ev=>{if(ev.key==='Enter')items.find(n=>!n.hidden)?.click();};input.focus();
 on(d.start,'start-system-new',()=>{d.start.hidden=true;api.wm(s,{verb:'system',cmd:'system-new'});});
}
function createView(s,w,d){
 const node=el('article','window app-'+w.appId);
 Object.assign(node.dataset,{testid:'app-window',windowId:w.id,systemId:s.id,appId:w.appId});
 if(w.appId==='projection')for(const a of ['sourceSystemId','sourceWindowId','sourceAppId'])node.dataset[a]=w[a];
 node.innerHTML='<header class="window-titlebar" data-testid="window-titlebar" aria-label="窗口标题栏">'+badge(w.appId,true)+'<b></b><span class="window-origin"></span><div class="window-actions">'+btn('最小化','window-minimize',{icon:'min',only:true})+btn('最大化 / 还原','window-maximize',{icon:'max',only:true})+btn('关闭','window-close',{icon:'close',only:true})+'</div></header><div class="window-body"></div><div class="resize-handle" data-edge="se" data-testid="window-resize" aria-label="调整窗口大小"></div><div class="resize-edge top" data-edge="n"></div><div class="resize-edge right" data-edge="e"></div><div class="resize-edge bottom" data-edge="s"></div><div class="resize-edge left" data-edge="w"></div>';
 stamp(node,s.id,w.id);
 const v={w,node,head:node.firstElementChild,body:node.querySelector('.window-body')};windows.set(w.id,v);d.area.append(node);
 on(node,'window-minimize',()=>api.wm(s,{verb:'min',id:w.id}));on(node,'window-maximize',()=>api.wm(s,{verb:'max',id:w.id}));on(node,'window-close',()=>api.close(s,w));
 node.addEventListener('focusin',()=>{
   if(s.focus!==w.id)api.wm(s,{verb:'focus',id:w.id});
 });
 node.addEventListener('pointerdown',ev=>{
   const clicked=ev.target.closest('.window');
   if(clicked===node&&!api.acceptInput(s,w,ev)){
     ev.stopImmediatePropagation();ev.preventDefault();
     const swallow=event=>{event.stopImmediatePropagation();event.preventDefault();};
     document.addEventListener('click',swallow,{capture:true,once:true});
     setTimeout(()=>document.removeEventListener('click',swallow,true),220);
     return;
   }
   if(s.focus!==w.id)api.wm(s,{verb:'focus',id:w.id});
 },{capture:true});
 v.head.ondblclick=e=>{if(!e.target.closest('button'))api.wm(s,{verb:'max',id:w.id});};
 let moving=null;
 function emit(ev,resize){
   if(ev.button!==0||ev.target.closest('button')||effective(s)!=='running')return;
   const r=d.area.getBoundingClientRect(),wr=node.getBoundingClientRect(),box=[(wr.left-r.left)/r.width,(wr.top-r.top)/r.height,wr.width/r.width,wr.height/r.height];
   moving={x:ev.clientX,y:ev.clientY,r,box,resize,mode:null,moved:false};ev.currentTarget.setPointerCapture(ev.pointerId);
 }
 const handles=[...node.querySelectorAll('[data-edge]')];v.head.onpointerdown=ev=>emit(ev,null);
 for(const h of handles)h.onpointerdown=ev=>emit(ev,h.dataset.edge);
 function drag(ev){
   if(!moving)return;
   const m=moving,dx=(ev.clientX-m.x)/m.r.width,dy=(ev.clientY-m.y)/m.r.height;
   if(!m.moved&&Math.hypot(ev.clientX-m.x,ev.clientY-m.y)<4)return;
   m.moved=true;let [x,y,a,b]=m.box;
   if(m.resize){
     const minW=Math.min(.65,268/m.r.width),minH=Math.min(.65,170/m.r.height);
     if(m.resize.includes('e'))a=Math.max(minW,Math.min(1-x,a+dx));
     if(m.resize.includes('s'))b=Math.max(minH,Math.min(1-y,b+dy));
     if(m.resize.includes('w')){const left=Math.max(0,Math.min(x+a-minW,x+dx));a+=x-left;x=left;}
     if(m.resize.includes('n')){const top=Math.max(0,Math.min(y+b-minH,y+dy));b+=y-top;y=top;}
   }
   else{
     if(w.mode){a=Math.min(.85,w.box[2]);b=Math.min(.88,w.box[3]);x=(ev.clientX-m.r.left)/m.r.width-a*.45;y=(ev.clientY-m.r.top)/m.r.height-8/m.r.height;}
     else{x+=dx;y+=dy;}
     x=Math.min(1-a,Math.max(0,x));y=Math.min(1-b,Math.max(0,y));
   }
   m.next=[x,y,a,b];m.mode=m.resize?null:ev.clientX-m.r.left<23?'left':m.r.right-ev.clientX<23?'right':ev.clientY-m.r.top<12?'max':null;
   position(node,m.mode?boxMode(m.mode):m.next);
 }
 function stop(cancel){
   if(!moving)return;const m=moving;moving=null;
   if(m.moved&&!cancel)api.wm(s,{verb:'bounds',id:w.id,box:m.next,mode:m.mode});else position(node,w.mode?boxMode(w.mode):w.box);
 }
 for(const h of [v.head,...handles]){h.onpointermove=drag;h.onpointerup=()=>stop(false);h.onpointercancel=()=>stop(true);h.onlostpointercapture=()=>stop(true);}
 v.moving=()=>moving!==null;
 if(w.appId==='system'&&byId(w.target))v.body.replaceChildren(desktop(byId(w.target)).node);else api.mount(s,w,v.body);
 return v;
}
const boxMode=mode=>mode==='max'?[0,0,1,1]:mode==='left'?[0,0,.50,1]:[.50,0,.50,1];
function position(node,[x,y,w,h]){Object.assign(node.style,{left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%'});}
export function redraw(){
 prune();const root=byId('outer'),d=desktop(root);
 if(!d.node.isConnected)document.getElementById('mount').replaceChildren(d.node);
 const recur=s=>{
   const d=desktop(s);paintDesk(s,d);
   for(const w of Object.values(s.wins)){
     let v=windows.get(w.id);if(!v)v=createView(s,w,d);
     const n=v.node;v.head.querySelector('b').textContent=api.title(s,w);
     v.head.querySelector('.window-origin').textContent=w.appId==='projection'?'↗ '+w.sourceSystemId:s.id;
     n.setAttribute('aria-label',api.title(s,w));n.hidden=w.min;n.style.zIndex=2+w.z;n.classList.toggle('focused',s.focus===w.id);n.classList.toggle('docked',!!w.mode);
     if(!v.moving())position(n,w.mode?boxMode(w.mode):w.box);
     if(w.appId==='system'&&byId(w.target)){const c=desktop(byId(w.target));if(c.node.parentElement!==v.body)v.body.replaceChildren(c.node);recur(c.s);}
   }
 };
 recur(root);
}
export function frame(){
 for(const d of desktops.values())if(d.node.isConnected){
   const now=new Date(d.s.epoch+d.s.time*1000),time=d.node.querySelector(':scope > .desk-stage > .taskbar .tray-clock');
   time.firstElementChild.textContent=clockFmt.format(now);time.lastElementChild.textContent=dateFmt.format(now);
 }
 for(const v of windows.values())if(v.body.refresh&&v.node.offsetWidth>0&&v.node.offsetHeight>0&&v.w.appId!=='spreadsheet')v.body.refresh();
}
document.addEventListener('pointerdown',ev=>{if(globalMenu&&!globalMenu.contains(ev.target))closeMenu();},true);
document.addEventListener('keydown',ev=>{
 if(ev.key!=='Escape')return;if(globalDialog){globalDialog.resolve(null);return;}if(globalMenu){closeMenu();return;}
 const id=document.activeElement?.closest('[data-system-id]')?.dataset.systemId??'outer',d=desktops.get(id);
 if(d){d.start.hidden=true;d.notice.hidden=true;}
});
