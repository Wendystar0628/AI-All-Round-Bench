import {btn,esc,appInfo,get} from './ui.js';
import {setFixtures,loadWorld,exportWorld,world,systems,byId,children,ancestry,effective,bridge,fresh,writeFile,readFile,fileName,
 spawn,spawnNative,queue,enqueue,endProc,restartTree,stopTree,snapshot,restoreTree,tick,STEP,rule,reserveMemory} from './runtime.js';
import {mounts,handlers,browserInfo,closeBrowser,externalTab,clearFileClipboard} from './apps.js';
import {mountSheet,saveBook,setupBook,bookTitle,calculate} from './sheet.js';
import {playerSetup,initialPlayer,playerClock,playerProcess,physicsDevice,flightCall,mountPlayer,chartSetup,initialChart,chartInput,chartPublish,chartClock,mountChart,clearChartUpdates,clearAllChartUpdates,chartBacklogMemory} from './media.js';
import {SCENE} from './fixtures.js';
import {clone,bytes} from './vm.js';
import {encodeState,decodeState} from './state-codec.js';
import {trimGraphics,paint} from './graphics.js';
import {validateScene} from './flight.js';
import * as shell from './shell.js';
let dirty=true,saveDue=0,pendingSave=Promise.resolve(),ready=false;
const highest=s=>Object.values(s.wins).filter(w=>!w.min).sort((a,b)=>b.z-a.z)[0];
function persist(){saveDue=Date.now()+360;}
function persistNow(){
 if(!ready)return;
 saveDue=0;const data=exportWorld(),root=data.systems.outer;
 for(const w of Object.values(root.wins))if(w.appId==='browser'){delete root.wins[w.id];if(root.procs[w.pid])root.procs[w.pid].state='ended';}
 pendingSave=pendingSave.catch(()=>{}).then(()=>host.save(encodeState(data))).catch(err=>console.error('保存失败',err));
 return pendingSave;
}
function changed(){dirty=true;persist();}
function notify(s,message,type='ok'){
 if(!s)return;
 s.notes.unshift({message:String(message),type,time:s.time});s.notes.splice(35);persist();
 if(!s.settings.dnd)shell.toast(s,message,type);
}
function copy(s,value){
 s.clips.unshift(String(value));s.clips=[...new Set(s.clips)].slice(0,18);persist();
 for(const w of Object.values(s.wins))if(w.appId==='widgets')remount(s,w);
 return host.copy(value);
}
document.addEventListener('copy',ev=>{
 if(ev.defaultPrevented)return;const n=document.activeElement;
 let value=window.getSelection()?.toString();
 if(n instanceof HTMLTextAreaElement||n instanceof HTMLInputElement){const a=n.selectionStart,b=n.selectionEnd;if(b>a)value=n.value.slice(a,b);}
 if(value)copy(byId(n.closest('[data-system-id]')?.dataset.systemId)??byId('outer'),value);
});
function title(s,w){
 if(w.appId==='projection')return (appInfo[w.sourceAppId]?.[0]??'应用')+' · '+w.sourceSystemId+' 投送';
 if(w.appId==='system')return (byId(w.target)?.name??w.target)+' · 子系统';
 if(w.appId==='spreadsheet')return w.data.path?bookTitle(w.data)+(w.data.dirty?' ●':''):'电子表格';
 if(w.appId==='editor')return w.data.path?fileName(w.data.path)+(w.data.saved!==w.data.text?' ●':''):'文本与程序';
 if(w.appId==='canvas')return '程序画布 · '+(fileName(w.data.path)||('PID '+w.data.ownerPid));
 return appInfo[w.appId]?.[0]??w.appId;
}
function job(s){
 let p=Object.values(s.procs).find(x=>x.kind==='job'&&x.winId===null&&!['ended','error'].includes(x.state));
 if(!p)p=spawnNative(s,'文件与快照服务','job',null);return p.pid;
}
function createWindow(s,app,data={},multiple=false){
 if(!shell.desks(s).includes(app)&&!['system','projection','canvas'].includes(app))throw Error('当前桌面未提供此应用');
 if(!multiple&&app!=='system'&&app!=='projection'){
   const existing=Object.values(s.wins).find(w=>w.appId===app);
   if(existing){existing.min=false;focusNow(s,existing);changed();return existing;}
 }
 const layer=ancestry(s).length;
 const rects={system:layer===1?[.128,.057,.838,.903]:[.035,.036,.944,.941],systems:layer===1?[.20,.12,.58,.71]:[.095,.08,.77,.81],
  player:[.093,.048,.875,.921],charts:[.088,.062,.868,.87],projection:[.156,.077,.774,.846],files:[.13,.109,.75,.78],spreadsheet:[.14,.105,.743,.781],
  editor:[.144,.102,.73,.78],tasks:[.137,.106,.75,.81],browser:[.11,.086,.789,.822],widgets:[.14,.101,.659,.786],
  settings:[.194,.118,.615,.73],help:[.18,.105,.65,.79],canvas:[.16,.114,.71,.76]};
 const box=rects[app],count=Object.values(s.wins).filter(w=>w.appId===app).length,id='win-'+(++world.windowSerial);
 const x=Math.min(1-box[2],box[0]+Math.min(.035,count*.018)),y=Math.min(1-box[3],box[1]+Math.min(.025,count*.016));
 const w={id,systemId:s.id,appId:app,title:appInfo[app]?.[0],z:++s.z,box:[x,y,box[2],box[3]],min:false,mode:null,data,...(app==='system'?{target:data.target}:{}),...(app==='projection'?data:{})};
 s.wins[id]=w;
 try{
   if(!['system','projection','canvas'].includes(app)){
     const map={player:'/System/player.str',charts:'/System/chart.str',files:'/System/files.str'};
     w.pid=spawn(s,map[app]??'/System/service.str',{},id).pid;s.procs[w.pid].name=appInfo[app][0];
   }
   if(app==='player'){playerSetup(s,w,data.path??SCENE);initialPlayer(s,w,api);}
   if(app==='charts'){chartSetup(s,w);initialChart(s,w,api);}
   if(app==='spreadsheet')setupBook(s,w,data.path);
 }catch(err){delete s.wins[w.id];for(const p of Object.values(s.procs))if(p.winId===w.id)endProc(s,p);throw err;}
 focusNow(s,w);changed();return w;
}
function open(s,app,data={},multiple=false){wm(s,{verb:'app',app,data,multiple});}
function openFile(s,path){
 if(path.endsWith('.snapshot')){shell.dialog(s,'打开子树快照',fileName(path),[{label:'从快照启动',value:true,primary:true},{label:'取消',value:false}]).then(ok=>{if(ok)system(s,'system-fork',{path});});return;}
 if(path.endsWith('.sheet')&&s.id==='outer'){
   const same=Object.values(s.wins).find(w=>w.appId==='spreadsheet'&&w.data.path===path);
   if(same){wm(s,{verb:'restoreWindow',id:same.id});return;}
   const current=Object.values(s.wins).filter(w=>w.appId==='spreadsheet'&&w.data.dirty).sort((a,b)=>b.z-a.z)[0];
   if(current?.appId==='spreadsheet'&&current.data.dirty){
     allowSave(s,current).then(ok=>{if(ok){removeWindow(s,current);open(s,'spreadsheet',{path},true);}});return;
   }
   open(s,'spreadsheet',{path},true);return;
 }
 if(/\.(scene|flight)$/i.test(path)&&s.id!=='outer'){open(s,'player',{path},true);return;}
 open(s,'editor',{path},true);
}
function focusNow(s,w){
 if(!w||w.min||(s.focus===w.id&&highest(s)?.id===w.id))return;
 const z=rule(s,s.wmpid,'focus',[w.z,s.z],s.z+1);
 w.z=Number.isFinite(+z)?+z:s.z+1;s.z=Math.max(s.z,w.z);s.focus=w.id;changed();
}
function settledFocus(s){s.focus=highest(s)?.id??null;}
function wm(s,p){
 if(effective(s)!=='running')return;
 try{if(s.id==='outer')windowEvent(s,p);else if(s.wmpid)enqueue(s,s.wmpid,p);}
 catch(err){notify(s,err.message,'error');}
}
function windowEvent(s,p){
 const {verb,id}=p??{},w=s.wins[id];
 if(verb==='app'){createWindow(s,p.app,p.data,p.multiple);return;}
 if(verb==='system'){system(s,p.cmd,p.value);return;}
 if(verb==='projection'){makeProjection(s,p.value);return;}
 if(!w)return;
 if(verb==='focus'){focusNow(s,w);return;}
 if(verb==='restoreWindow'){w.min=false;focusNow(s,w);changed();return;}
 if(verb==='taskbar'){if(!w.min&&s.focus===w.id){w.min=true;settledFocus(s);}else{w.min=false;focusNow(s,w);}changed();return;}
 if(verb==='min'){w.min=true;settledFocus(s);changed();return;}
 if(verb==='windowMode'){w.mode=p.mode;focusNow(s,w);changed();return;}
 if(verb==='max'){w.mode=w.mode==='max'?null:'max';focusNow(s,w);changed();return;}
 if(verb==='bounds'){w.mode=p.mode??null;w.box=p.box;focusNow(s,w);changed();return;}
 if(verb==='close'){
   if(w.appId==='system'){const c=byId(w.target);stopTree(c);if(s.procs[c?.carrier])s.procs[c.carrier].state='ended';refreshSystems(s);}
   removeWindow(s,w);
 }
}
function removeWindow(s,w){
 if(!s.wins[w.id])return;
 delete s.wins[w.id];
 if(w.appId==='charts')clearChartUpdates(w);
 if(w.appId==='browser')closeBrowser(w);
 if(w.appId==='spreadsheet')for(const sys of systems())for(const c of Object.values(sys.wins))if(c.appId==='charts'&&c.data.link?.identity===w.data.identity){
   clearChartUpdates(c);c.data.link=null;c.data.connectionState='数据源已关闭';initialChart(sys,c,api);
 }
 if(w.appId==='player'||w.appId==='charts')for(const target of systems())for(const p of Object.values(target.wins))if(p.sourceWindowId===w.id&&p.sourceSystemId===s.id){removeWindow(target,p);notify(target,'源窗口已关闭 · 投送结束');}
 if(w.appId==='canvas')endProc(s,s.procs[w.data.ownerPid]);
 for(const p of Object.values(s.procs))if(p.winId===w.id)endProc(s,p);
 shell.discard(w.id);if(s.focus===w.id)settledFocus(s);changed();
}
async function allowSave(s,w){
 const v=await shell.dialog(s,'保存工作簿？',bookTitle(w.data)+' 有未保存的修改。',[{label:'保存',value:'save',primary:true},{label:'不保存',value:'discard'},{label:'取消',value:null}]);
 if(v==='save')try{saveBook(s,w,get(shell.view(w.id)?.body??document,'sheet-filename')?.value??w.data.path,api);}catch(err){notify(s,err.message,'error');return false;}
 return v!==null;
}
async function close(s,w){
 if(w.appId==='system'&&!await api.confirm(s,'关闭子系统？',w.target+' 与它的全部后代将停止。也可以最小化，保留运行。'))return;
 if(w.appId==='spreadsheet'&&w.data.dirty&&!await allowSave(s,w))return;
 if(w.appId==='editor'&&w.data.text!==w.data.saved){
   const v=await shell.dialog(s,'保存源文件？',fileName(w.data.path)+' 有未保存的修改。',[{label:'保存',value:'save',primary:true},{label:'不保存',value:'discard'},{label:'取消',value:null}]);
   if(!v)return;
   if(v==='save')try{writeFile(s,w.data.path,w.data.text);refreshFiles(s);}catch(err){notify(s,err.message,'error');return;}
 }
 wm(s,{verb:'close',id:w.id});
}
function showChild(parent,s){
 if(s.state==='stopped'){restartTree(s);s.autoPlayer=true;}
 const existing=Object.values(parent.wins).find(w=>w.appId==='system'&&w.target===s.id);
 if(existing){existing.min=false;focusNow(parent,existing);changed();return existing;}
 return createWindow(parent,'system',{target:s.id},true);
}
function refreshSystems(s){for(const w of Object.values(s.wins))if(w.appId==='systems'||w.appId==='tasks')remount(s,w);changed();}
function system(s,cmd,v){
 if(effective(s)!=='running')return;
 const c=byId(v?.id);if(c&&c.parentId!==s.id)return;
 try{
   if(cmd==='system-new'){const t=fresh(s);t.autoPlayer=true;showChild(s,t);notify(s,'已启动 '+t.id);}
   if(cmd==='system-open'&&c)showChild(s,c);
   if(cmd==='system-pause'&&c&&c.state==='running'){
     c.state='paused';
     const current=document.activeElement?.closest('[data-system-id]');
     if(current&&ancestry(byId(current.dataset.systemId)).includes(c))document.activeElement.blur();
   }
   if(cmd==='system-resume'&&c&&c.state==='paused')c.state='running';
   if(cmd==='system-step'&&c&&c.state==='paused'){c.stepRequested=true;notify(s,c.id+' · 单步 40 ms');}
   if(cmd==='system-rate'&&c)c.rate=v.rate;
   if(cmd==='system-restart'&&c){restartTree(c);c.autoPlayer=c.state==='running';if(!c.error)notify(s,'已重启 '+c.id);}
   if(cmd==='system-close'&&c){stopTree(c);for(const w of Object.values(s.wins))if(w.target===c.id)removeWindow(s,w);if(s.procs[c.carrier])s.procs[c.carrier].state='ended';}
   if(cmd==='system-snapshot'&&c){
     const snap=snapshot(c),path='/Snapshots/'+c.id+'-'+Math.round(c.time*1000)+'.snapshot',content=JSON.stringify(encodeState(snap));
     queue(s,job(s),{verb:'saveSnapshot',path,content},1+Math.ceil(content.length/1024));notify(s,'正在写入子树快照');
   }
   if((cmd==='system-restore'||cmd==='system-fork')&&v.path){
     const snap=decodeState(JSON.parse(readFile(s,v.path)));
     const priorCharts=[];
     function remember(x){
       for(const w of Object.values(x.wins))if(w.appId==='charts')priorCharts.push(w);
       children(x).forEach(remember);
     }
     if(cmd==='system-restore'&&c)remember(c);
     const child=restoreTree(s,snap,cmd==='system-restore'?c?.id:null);
     priorCharts.forEach(clearChartUpdates);
     shell.prune();showChild(s,child);
     for(const n of snapshot(child).systems){const r=byId(n.id);for(const w of Object.values(r.wins))if(w.appId==='charts')initialChart(r,w,api);}
     notify(s,(cmd==='system-restore'?'已恢复 ':'已分叉 ')+child.id);
   }
   refreshSystems(s);refreshFiles(s);
 }catch(err){notify(s,err.message,'error');}
}
function refreshFiles(s){for(const w of Object.values(s.wins))if(w.appId==='files')remount(s,w);changed();}
function act(s,w,verb,value){
 if(effective(s)!=='running')return;
 try{
   if(s.id==='outer'&&w.appId!=='files'){handlers[w.appId]?.(s,w,verb,value,api);persist();}
   else if(w.pid)enqueue(s,w.pid,{verb,value},0);
 }catch(err){notify(s,err.message,'error');}
}
function books(){return Object.values(byId('outer')?.wins??{}).filter(w=>w.appId==='spreadsheet'&&w.data.cells).map(w=>w.data);}
function publish(book){for(const s of systems())for(const w of Object.values(s.wins))if(w.appId==='charts'&&w.data.link?.identity===book.identity)try{chartPublish(s,w,book);}catch(err){notify(s,err.message,'error');}}
function recalc(s,w){
 const process=s.procs[w.calcPid];
 if(!process||['error','ended'].includes(process.state))w.calcPid=spawnNative(s,'工作簿重算 / '+bookTitle(w.data),'job',w.id).pid;
 const cells={...w.data.cells};
 let cost=2;
 for(const value of Object.values(cells)){
   const text=String(value);
   cost+=1+Math.ceil(text.length/32);
   if(text.startsWith('=')){
     for(const hit of text.matchAll(/([A-Z]{1,3})([1-9]\d*):([A-Z]{1,3})([1-9]\d*)/gi)){
       const col=name=>[...name.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
       const size=(Math.abs(col(hit[1])-col(hit[3]))+1)*(Math.abs(+hit[2]-+hit[4])+1);
       cost+=Math.min(20000,size);
     }
   }
 }
 if(queue(s,w.calcPid,{verb:'recalc',window:w.id,cells},cost))w.data.pendingRecalc=(w.data.pendingRecalc??0)+1;
}
const packet=w=>w.data.packet;
function submit(s,w,data,change){
 w.data.packet=data;
 for(const x of ancestry(s).slice(0,-1))for(const p of Object.values(x.wins))if(p.sourceSystemId===s.id&&p.sourceWindowId===w.id){
   const {resource,...rest}=data;
   if(resource&&p.data.packet?.resource?.assetId===resource.assetId)p.data.packet={...clone(rest),resource:p.data.packet.resource};
   else p.data.packet=clone(data);
 }
 if(change)changed();
}
function mediaInput(s,w,verb,value){
 const src=w.appId==='projection'?byId(w.sourceSystemId):s,sw=w.appId==='projection'?src?.wins[w.sourceWindowId]:w;
 if(!src||!sw||effective(src)!=='running')return;
 try{enqueue(src,sw.pid,{verb,value,route:{system:s.id,window:w.id}});}catch(err){notify(s,err.message,'error');}
}
function makeProjection(a,request){
 const s=byId(request.sid),w=s?.wins[request.id];
 if(!w||effective(s)!=='running'||!ancestry(s).slice(0,-1).includes(a))return;
 const list=ancestry(s).slice(0,-1).reverse();
 for(const target of list){
   const existing=Object.values(target.wins).find(t=>t.sourceSystemId===s.id&&t.sourceWindowId===w.id);
   if(existing){wm(target,{verb:'restoreWindow',id:existing.id});return;}
 }
 createWindow(a,'projection',{title:appInfo[w.appId][0]+' · '+s.id+' 投送',sourceSystemId:s.id,sourceWindowId:w.id,sourceAppId:w.appId,data:{packet:clone(packet(w))}},true);
 notify(a,'已接收 '+s.id+' 的投送');
}
function projectMenu(s,w,ev){
 const list=ancestry(s).slice(0,-1).reverse();
 shell.menu(s,ev,list.map(a=>[a.name+' · '+a.id,()=>mediaInput(s,w,'project',a.id),'project-target',{'data-target-system-id':a.id}]));
}
function acceptInput(s,w,ev){
 if(s.id==='outer'||!s.wmpid||effective(s)!=='running')return true;
 const rect=ev.currentTarget.getBoundingClientRect();
 try{return !!rule(s,s.wmpid,'input',[w.id,s.focus,(ev.clientX-rect.x)/rect.width,(ev.clientY-rect.y)/rect.height,ev.button],true);}
 catch(err){notify(s,err.message,'error');return false;}
}
function remount(s,w){const v=shell.view(w.id);if(v&&v.w===w)mount(s,w,v.body);}
function mount(s,w,e){
 e.refresh=null;
 if(w.appId==='projection'){if(w.sourceAppId==='player')mountPlayer(s,w,e,api,null);else mountChart(s,w,e,api,null);}
 else if(w.appId==='player')mountPlayer(s,w,e,api);
 else if(w.appId==='charts')mountChart(s,w,e,api);
 else if(w.appId==='spreadsheet')mountSheet(s,w,e,api);
 else if(w.data.drawing?.resource){
   e.innerHTML='<div class="viewport program-viewport"><canvas aria-label="程序的三维输出"></canvas></div>';
   const canvas=e.querySelector('canvas');e.refresh=()=>paint(canvas,w.data.drawing);
 }else if(w.data.drawing){
   const p=w.data.drawing,svg=(Array.isArray(p.items)?p.items:[]).slice(0,10000).map(d=>d.type==='rect'?'<rect x="'+(+d.x||0)+'" y="'+(+d.y||0)+'" width="'+(+d.width||10)+'" height="'+(+d.height||10)+'" fill="'+esc(d.color??'#7cc')+'"/>':d.type==='circle'?'<circle cx="'+(+d.x||0)+'" cy="'+(+d.y||0)+'" r="'+(+d.r||5)+'" fill="'+esc(d.color??'#ffc')+'"/>':'<text x="'+(+d.x||0)+'" y="'+(+d.y||0)+'" fill="'+esc(d.color??'#111')+'">'+esc(d.text)+'</text>').join('');
   e.innerHTML='<svg style="width:100%;height:100%" viewBox="0 0 640 400">'+svg+'</svg>';
 }else mounts[w.appId]?.(s,w,e,api);
}
const api={wm,title,close,mount,acceptInput,replaceBook:async(s,w)=>{
 if(w.data.dirty&&!await allowSave(s,w))return false;
 removeWindow(s,w);return true;
},ask:shell.ask,pick:shell.pick,confirm:async(s,a,b)=>!!await shell.dialog(s,a,b,[{label:'确定',value:true,primary:true},{label:'取消',value:false}]),menu:shell.menu,notices:shell.notices,act,notify,copy,open,openFile,projectMenu,refreshFiles,system,
 focus:(s,w)=>wm(s,{verb:'focus',id:w.id}),remount,update:changed,persist,persistNow,publish,recalc,books,packet,submit,mediaInput,browsers:browserInfo};
shell.attach(api);
bridge.change=changed;bridge.notify=notify;
bridge.extraMemory=s=>s.id==='outer'?chartBacklogMemory():0;
function sceneCost(asset){
 if(!asset)return 0;
 return (asset.parts.length+(asset.decor?.length??0)+(asset.obstacles?.length??0))*18100+
   (asset.terrain?.grass??0)*100+(asset.terrainProps?.pines??0)*1800+600000;
}
bridge.sceneCost=w=>sceneCost(w.data.asset??w.data.drawing?.resource);
bridge.eventCost=(s,p,kind,packet)=>{
 const w=s.wins[p.winId],verb=packet?.verb,v=packet?.value;
 if(kind==='files'){
   if(verb==='paste'){
     const origin=byId(v?.sid);
     return Math.ceil((v?.paths??[]).reduce((n,path)=>n+Object.entries(origin?.files??{}).filter(([q])=>q===path||q.startsWith(path+'/')).reduce((a,[,f])=>a+f.content.length+8,0),0)/512);
   }
   if(verb==='restore'||verb==='delete'||verb==='rename')return Math.ceil(Object.keys(s.files).length/6);
 }
 if(kind==='window'&&verb==='app'&&packet.app==='player')return 1+Math.ceil((s.files[packet.data?.path??SCENE]?.content?.length??0)/512);
 if(kind==='player'&&verb==='open')return Math.ceil((s.files[v]?.content?.length??0)/512);
 if(kind==='airframe'&&w&&verb==='sample')return 2+Math.ceil(w.data.asset.parts.length/8)+(w.data.mode==='flight'?8:0);
 if(kind==='physicsFloor'&&w)return 2+Math.ceil(((w.data.asset.terrainProps?.pines??0)+(w.data.asset.obstacles?.length??0))/16);
 if(kind==='effects'&&w)return 3+Math.ceil((w.data.asset.terrain?.grass??0)/180);
 if(kind==='chart'&&verb==='data')return (v.matrix?.length??0)*Math.ceil((v.series?.split(/[,，]/).length??1)*1.5);
 return 0;
};
bridge.stop=(s,p)=>{
 if(p.winId){
   const w=s.wins[p.winId];
   if(w?.pid===p.pid)removeWindow(s,w);
   if(w?.calcPid===p.pid){w.data.pendingRecalc=0;w.calcPid=null;shell.view(w.id)?.body.refresh?.();}
 }
 if(p.kind==='carrier')refreshSystems(s);
};
bridge.event=(s,p,kind,v)=>{
 if(kind==='tick'){
   if(s.timer?.until!=null&&s.time>=s.timer.until){s.timer.until=null;s.timer.remaining=0;notify(s,'倒计时结束');}
   if(s.autoPlayer&&s.booted){s.autoPlayer=false;open(s,'player');}
   for(const w of Object.values(s.wins)){
     if(w.appId==='player')playerClock(s,w);
     if(w.appId==='charts')chartClock(s,w,api);
   }
   return;
 }
 if(kind==='window'){try{windowEvent(s,v);}catch(err){notify(s,err.message,'error');}return;}
 if(kind==='windowInfo'){
   const w=s.wins[v];return w?{focused:s.focus===w.id,min:w.min,mode:w.mode}:null;
 }
 if(kind==='job'){
   if(v.verb==='recalc'){
     const book=s.wins[v.window];
     if(!book)return;
     const d=book.data;
     d.values=calculate(v.cells);d.version++;
     d.pendingRecalc=Math.max(0,(d.pendingRecalc??1)-1);
     publish(d);shell.view(book.id)?.body.refresh?.();persist();
     return;
   }
   if(v.verb==='saveSnapshot')try{writeFile(s,v.path,v.content);notify(s,'快照已保存 · '+fileName(v.path));refreshFiles(s);}catch(err){notify(s,err.message,'error');}
   return;
 }
 if(kind==='sensor'||kind==='control')return flightCall(s,p,kind,v);
 const w=s.wins[p.winId];
 if(kind==='display'){
   try{
     let data=clone(v);
     if(data?.scene){
       validateScene(data.scene);
       const code=JSON.stringify(data.scene),seq=(p.displaySequence??0)+1;
       let hash=0;for(const ch of code)hash=(Math.imul(hash,31)+ch.charCodeAt(0))|0;
       p.displaySequence=seq;
       data={revision:s.id+'-'+p.pid+'-'+seq,resource:{...data.scene,assetId:s.id+':'+p.pid+':'+hash},frame:{t:s.time,x:0,y:0,z:0,yaw:0,pitch:0,roll:0,spin:0,...data.frame},camera:data.camera,isDefault:data.scene.camera?.mode==='cinema'};
     }
     const out=w??s.wins[p.displayWindow],old=out?.data.drawing;
     reserveMemory(s,sceneCost(data?.resource)+bytes(data)-sceneCost(old?.resource)-bytes(old));
     if(out){
       const same=!!old?.resource&&!!data?.resource;
       out.data.drawing=data;if(!same)remount(s,out);
     }else{
       const nw=createWindow(s,'canvas',{path:p.path,ownerPid:p.pid,drawing:data},true);p.displayWindow=nw.id;
     }
     return true;
   }catch(err){return {ok:false,error:err.message};}
 }
 if(!w)return null;
 if(kind==='fileState')return {path:w.data.path,selected:clone(w.data.selected)};
 if(kind==='fileExists')return !!s.files[v];
 if(kind==='timelineState'){
   const {wanted,playing,last,mode,rate,loop,duration,airframe,effects,epoch}=w.data;
   if(v?.epoch!==undefined&&v.epoch!==epoch)return null;
   return {wanted,playing,last,mode,rate,loop,duration,airframe,effects,epoch,
     airQueued:s.procs[airframe]?.inbox.length??0,effectsQueued:s.procs[effects]?.inbox.length??0};
 }
 if(kind==='timelineMark'){
   if(v.epoch!==undefined&&v.epoch!==w.data.epoch)return false;
   Object.assign(w.data,{wanted:v.wanted,playing:v.playing,last:v.last});return true;
 }
 try{
   if(kind.startsWith('physics'))return physicsDevice(s,w,p,kind,v,api);
   if((kind==='chart'||kind==='player')&&v?.verb==='project'){
     const a=byId(v.value);if(a)wm(a,{verb:'projection',value:{sid:s.id,id:w.id}});return true;
   }
   if(['player','timeline','effects','airframe'].includes(kind)){if(kind==='player')persist();return playerProcess(s,w,p,kind,v,api);}
   if(kind==='chart'){persist();return chartInput(s,w,v?.verb,v?.value,api);}
   if(kind==='application'||kind==='files'){handlers[w.appId]?.(s,w,v?.verb,v?.value,api);persist();return true;}
 }catch(err){notify(s,err.message,'error');return false;}
};
host.onNewTab(externalTab);
function reconcile(){
 for(const s of systems())for(const w of Object.values(s.wins))if(w.appId==='projection'){
   const src=byId(w.sourceSystemId)?.wins[w.sourceWindowId];
   if(!src)removeWindow(s,w);else if(src.data.packet?.revision!==w.data.packet?.revision)w.data.packet=clone(src.data.packet);
 }
}
function inspect(){
 const list=systems(),wins=list.flatMap(s=>Object.values(s.wins));
 return {
   systems:list.map(s=>({id:s.id,parentId:s.parentId,name:s.name,state:effective(s)})),
   windows:wins.map(w=>({id:w.id,systemId:w.systemId,appId:w.appId,title:title(byId(w.systemId),w),state:w.min?'minimized':w.mode??'normal'})),
   browsers:browserInfo(),
   players:wins.filter(w=>w.appId==='player').map(w=>({windowId:w.id,systemId:w.systemId,state:packet(w)?.state,position:w.data.position,duration:w.data.duration,rate:w.data.rate,scene:w.data.path,frameTime:w.data.frame?.t})),
   charts:wins.filter(w=>w.appId==='charts').map(w=>({windowId:w.id,systemId:w.systemId,sourceTitle:w.data.sourceTitle,range:w.data.range,chartType:w.data.chartType,connectionState:w.data.connectionState,version:w.data.version})),
   projections:wins.filter(w=>w.appId==='projection').map(w=>({windowId:w.id,systemId:w.systemId,sourceSystemId:w.sourceSystemId,sourceWindowId:w.sourceWindowId,sourceAppId:w.sourceAppId,state:w.min?'minimized':effective(byId(w.sourceSystemId))}))
 };
}
const start=Promise.all([fetch('./assets/helicopter-24.scene').then(r=>r.text()),fetch('./README.md').then(r=>r.text()),host.load()]).then(([scene,help,data])=>{
 setFixtures(scene,help);
 let loadError=null;
 try{loadWorld(decodeState(data));}catch(err){loadError=err.message;loadWorld(null);}
 shell.redraw();ready=true;
 if(loadError)notify(byId('outer'),'无法读取保存的运行状态 · '+loadError,'error');
});
window.bench={version:1,ready:async()=>{await start;return true;},reset:async()=>{
 await start;for(const w of Object.values(byId('outer').wins))if(w.appId==='browser')closeBrowser(w);
 clearAllChartUpdates();clearFileClipboard();shell.clear();loadWorld(null);shell.redraw();await persistNow();return true;
},inspect:async()=>{await start;return inspect();}};
await start;
let lastTrim=0, nextTick=performance.now()+STEP*1000;
setInterval(()=>{
 try{
   const now=performance.now();let steps=0;
   while(now>=nextTick&&steps++<7){tick();nextTick+=STEP*1000;}
   if(now-nextTick>STEP*7000)nextTick=now;
   if(dirty){dirty=false;reconcile();shell.redraw();}shell.frame();if(saveDue&&Date.now()>=saveDue)persistNow();
 if(Date.now()-lastTrim>5000){
   lastTrim=Date.now();const assets=new Set(systems().flatMap(s=>Object.values(s.wins).map(w=>packet(w)?.resource?.assetId??w.data.drawing?.resource?.assetId).filter(Boolean)));
   trimGraphics(assets);
 }}catch(err){console.error(err);}
},Math.round(STEP*750));
