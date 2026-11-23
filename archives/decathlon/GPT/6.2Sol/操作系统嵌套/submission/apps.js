import {btn,select,ico,esc,on,set,get,el,fmtBytes,badge,stamp,num} from './ui.js';
import {byId,children,ancestry,effective,instanceToken,fileName,dirName,join,listFiles,readFile,writeFile,moveFile,deleteFile,transferFiles,storageUsed,memoryUsed,procMem,stateNames,rule,spawn,endProc,activateCompiler,STEP} from './runtime.js';
import {KERNEL,COMPILER,FLIGHT} from './fixtures.js';
export const mounts={};
export const handlers={};
const HTML=(e,s,w,h)=>{e.innerHTML=h;stamp(e,s.id,w.id);};
const bar=(...x)=>'<div class="toolbar">'+x.join('')+'</div>';
const empty=(head,details)=>'<div class="empty"><div>'+ico('files')+'</div><strong>'+head+'</strong><small>'+details+'</small></div>';
const rx=p=>p.replace(/\/+$/,'')||'/';
const safeName=x=>x.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,110);
const launchFile=(s,w,path,api)=>{if(s.files[path]?.kind==='dir'){api.act(s,w,'path',path);return;}api.openFile(s,path);};
const dirs=[['/','总览','system'],['/Documents','文档','editor'],['/Downloads','下载','files'],['/Demo','演示资源','player'],['/Programs','程序','terminal'],['/System','系统源文件','settings'],['/Snapshots','快照','system'],['/Trash','回收站','trash']];
let fileClip=null;
export function clearFileClipboard(){fileClip=null;}
const fileDragType='application/x-strata-file';
mounts.files=(s,w,e,api)=>{
  const d=w.data;d.path??='/';d.selected??=[];
  while(d.path!=='/'&&s.files[d.path]?.kind!=='dir')d.path=dirName(d.path);
  const direction=rule(s,w.pid,'order',[],1);
  const list=listFiles(s,d.path).sort((a,b)=>(s.files[a].kind==='dir'?-1:0)-(s.files[b].kind==='dir'?-1:0)||fileName(a).localeCompare(fileName(b),'zh-CN')*direction);
  d.selected=d.selected.filter(path=>list.includes(path));
  HTML(e,s,w,'<div class="app-column files-app">'+bar(
    btn('上一级','files-up',{icon:'back',only:true}),'<input data-testid="files-path" aria-label="目录路径" value="'+esc(d.path)+'">',
    btn('新建文件夹','files-new-folder',{icon:'plus'}),btn('新建文件','files-new-file'),btn('打开','files-open'),btn('复制','files-copy'),btn('粘贴','files-paste'),btn('更多','files-more'))
    +'<div class="file-shell"><aside class="app-sidebar"><small>位置</small>'+dirs.map(([p,l,i])=>btn(l,'files-nav',{icon:i,cls:d.path===p?'active':'',attrs:{'data-file-path':p}})).join('')+
    '</aside><div class="file-body" data-testid="files-list"><div class="file-head"><span>名称</span><span>类型</span><span>大小</span></div>'+
    (list.length?list.map(p=>{const f=s.files[p],dir=f.kind==='dir',name=fileName(p),app=dir?'files':name.endsWith('.sheet')?'spreadsheet':name.endsWith('.scene')||name.endsWith('.flight')?'player':name.endsWith('.str')?'editor':name.endsWith('.snapshot')?'system':'editor';
      return '<div tabindex="0" role="option" aria-selected="'+d.selected.includes(p)+'" class="file-row '+(d.selected.includes(p)?'selected':'')+'" data-testid="files-item" data-file-path="'+esc(p)+'" draggable="true"><span>'+badge(app,true)+esc(name)+'</span><span>'+(dir?'文件夹':name.split('.').at(-1).toUpperCase())+'</span><span>'+(dir?'—':fmtBytes(f.content.length*2))+'</span></div>';
    }).join(''):empty('此文件夹为空','在此新建文件，或拖入其他桌面的文件。'))+
    '</div></div><footer class="status-line"><span>'+list.length+' 项'+(d.selected.length?' · 已选择 '+d.selected.length+' 项':'')+'</span><span>'+esc(s.id)+' / '+fmtBytes(storageUsed(s))+'</span></footer></div>');
  on(e,'files-up',()=>api.act(s,w,'path',dirName(d.path)));
  on(e,'files-path',ev=>{if(ev.key==='Enter')api.act(s,w,'path',rx(ev.target.value));},'keydown');
  for(const n of e.querySelectorAll('[data-testid="files-nav"]'))n.onclick=()=>api.act(s,w,'path',n.dataset.filePath);
  const body=get(e,'files-list');
  const selection=p=>{
    const selectRow=(path,toggle=false,extend=false)=>{
      const anchor=list.indexOf(d.anchor),index=list.indexOf(path);
      let items=[path];
      if(extend&&anchor>=0)items=list.slice(Math.min(anchor,index),Math.max(anchor,index)+1);
      else if(toggle)items=d.selected.includes(path)?d.selected.filter(x=>x!==path):[...d.selected,path];
      if(!extend)d.anchor=path;
      d.selected=items;
      for(const row of body.querySelectorAll('.file-row')){
        row.classList.toggle('selected',items.includes(row.dataset.filePath));
        row.setAttribute('aria-selected',items.includes(row.dataset.filePath));
      }
      e.querySelector('.status-line span').textContent=list.length+' 项 · 已选择 '+items.length+' 项';
    };
    p.onclick=ev=>selectRow(p.dataset.filePath,ev.ctrlKey,ev.shiftKey);
    p.ondblclick=()=>launchFile(s,w,p.dataset.filePath,api);
    p.onkeydown=ev=>{if(ev.key==='Enter')launchFile(s,w,p.dataset.filePath,api);if(ev.key==='Delete')remove();};
    p.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();if(!d.selected.includes(p.dataset.filePath))selectRow(p.dataset.filePath,false);menu(ev);};
    p.ondragstart=ev=>{
      const paths=d.selected.includes(p.dataset.filePath)?[...d.selected]:[p.dataset.filePath];
      ev.dataTransfer.setData(fileDragType,JSON.stringify({sid:s.id,sourceToken:instanceToken(s),paths}));ev.dataTransfer.effectAllowed='copy';
    };
  };
  body.querySelectorAll('.file-row').forEach(selection);
  let highlighted=null;
  function dropFolder(target){
    const row=target.closest('.file-row'),path=row?.dataset.filePath;
    return s.files[path]?.kind==='dir'?{path,row}:{path:d.path,row:null};
  }
  function endDrop(){
    body.classList.remove('drop');
    highlighted?.classList.remove('drop-folder');highlighted=null;
  }
  body.ondragover=ev=>{
    if(!ev.dataTransfer.types.includes(fileDragType))return;
    ev.preventDefault();ev.stopPropagation();ev.dataTransfer.dropEffect='copy';
    const {path,row}=dropFolder(ev.target);
    if(row!==highlighted){highlighted?.classList.remove('drop-folder');row?.classList.add('drop-folder');highlighted=row;}
    body.classList.add('drop');body.dataset.drop='复制到 '+s.name+' '+path;
  };
  body.ondragleave=ev=>{if(!body.contains(ev.relatedTarget))endDrop();};
  body.ondrop=async ev=>{
    ev.preventDefault();ev.stopPropagation();endDrop();
    const raw=ev.dataTransfer.getData(fileDragType);
    if(!raw)return;
    try{await paste(JSON.parse(raw),dropFolder(ev.target).path);}
    catch(err){api.notify(s,'文件拖放失败 · '+err.message,'error');}
  };
  const create=async kind=>{const name=await api.ask(s,kind==='dir'?'新建文件夹':'新建文件','名称',kind==='dir'?'新文件夹':'新文档.txt');if(name&&safeName(name))api.act(s,w,'create',{name:safeName(name),kind});};
  const copy=cut=>{
    if(!d.selected.length)return;
    fileClip={sid:s.id,sourceToken:instanceToken(s),paths:[...d.selected],cut};
    api.notify(s,cut?'已剪切文件':'已复制文件');
  };
  async function paste(clip=fileClip,folder=d.path){
    if(!clip)return;
    if(!Array.isArray(clip.paths)||!clip.paths.length)throw Error('拖动的文件列表为空');
    const conflicts=clip.paths.filter(p=>{
      const dest=join(folder,fileName(p));
      return s.files[dest]&&!(clip.sid===s.id&&p===dest);
    });
    if(conflicts.length&&!await api.confirm(s,'覆盖同名项目？',folder+' 中已有 '+conflicts.map(fileName).join('、')))return;
    api.act(s,w,'paste',{...clip,folder,overwrite:conflicts.length>0});
  }
  const rename=async()=>{const p=d.selected[0];if(!p)return;const name=await api.ask(s,'重命名','新名称',fileName(p));if(name&&safeName(name))api.act(s,w,'rename',safeName(name));};
  const remove=async()=>{if(d.selected.length&&await api.confirm(s,d.path==='/Trash'?'永久删除文件？':'移到回收站？',d.selected.map(fileName).join('、')))api.act(s,w,'delete');};
  const importFile=async()=>{
    try{
      const f=await host.importFile();
      if(!f)return;
      const path=join(d.path,safeName(f.name)),overwrite=!!s.files[path];
      if(overwrite&&!await api.confirm(s,'覆盖同名文件？',path))return;
      api.act(s,w,'import',{...f,path,overwrite});
    }catch(err){api.notify(s,'导入失败 · '+err.message,'error');}
  };
  const exportFile=async()=>{const p=d.selected[0];if(p&&s.files[p].kind!=='dir'&&await host.exportFile({name:fileName(p),content:readFile(s,p)}))api.notify(s,'已导出 '+fileName(p));};
  function menu(ev){api.menu(s,ev,[['打开',()=>d.selected[0]&&launchFile(s,w,d.selected[0],api)],['重命名',rename],['剪切',()=>copy(true)],['复制',()=>copy(false)],['粘贴',()=>paste()],...(d.path==='/Trash'?[['还原',()=>api.act(s,w,'restore')]]:[]),['删除',remove],['从本机导入',importFile],['导出到本机',exportFile]]);}
  on(e,'files-more',menu);on(e,'files-copy',()=>copy(false));on(e,'files-paste',()=>paste());on(e,'files-open',()=>d.selected[0]&&launchFile(s,w,d.selected[0],api));
  on(e,'files-new-file',()=>create('file'));on(e,'files-new-folder',()=>create('dir'));
  body.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();menu(ev);};
};
handlers.files=(s,w,cmd,value,api)=>{
  const d=w.data;
  switch(cmd){
    case 'path':if(s.files[value]?.kind!=='dir')throw Error('目录不存在');d.path=value;d.selected=[];break;
    case 'created':api.notify(s,'已新建 '+fileName(value));break;
    case 'renamed':api.notify(s,'已重命名为 '+fileName(value));d.selected=[];break;
    case 'fileConflict':throw Error('已存在同名项目');
    case 'create':{const p=join(d.path,value.name);if(s.files[p])throw Error('已存在同名项目');writeFile(s,p,'',value.kind);api.notify(s,'已新建 '+fileName(p));break;}
    case 'rename':moveFile(s,d.selected[0],join(d.path,value));api.notify(s,'已重命名为 '+value);d.selected=[];break;
    case 'delete':for(const p of d.selected){
      if(d.path==='/Trash')deleteFile(s,p);
      else{let t=join('/Trash',fileName(p));let i=1;while(s.files[t])t=join('/Trash',i+++'-'+fileName(p));moveFile(s,p,t);s.files[t].origin=p;}
    }api.notify(s,'已删除 '+d.selected.length+' 项');d.selected=[];break;
    case 'restore':for(const p of d.selected){const q=s.files[p]?.origin;if(q){moveFile(s,p,q);delete s.files[q].origin;}}api.notify(s,'已还原所选文件');d.selected=[];break;
    case 'import':{
      const path=value.path??join(d.path,safeName(value.name));
      if(s.files[path]&&!value.overwrite)throw Error('已存在同名文件');
      writeFile(s,path,value.content);api.notify(s,'已导入 '+value.name);break;
    }
    case 'paste':{
      const origin=byId(value.sid);
      if(!origin||value.sourceToken!==undefined&&value.sourceToken!==instanceToken(origin))throw Error('源系统已关闭或更换，请重新选取文件');
      const count=transferFiles(origin,s,value.paths,value.folder??d.path,value.cut,value.overwrite);
      if(value.cut){
        fileClip=null;
        if(origin!==s)api.refreshFiles(origin);
      }
      api.notify(s,'已传入 '+count+' 项');break;
    }
  }
  api.refreshFiles(s);
};
mounts.editor=(s,w,e,api)=>{
  const d=w.data;d.path??='/Documents/未命名.txt';d.text??=s.files[d.path]?readFile(s,d.path):'';d.saved??=d.text;
  HTML(e,s,w,'<div class="app-column editor-app">'+bar(
    '<input data-testid="editor-filename" aria-label="编辑文件路径" value="'+esc(d.path)+'">',btn('新建','editor-new',{icon:'plus'}),btn('打开','editor-open'),btn('保存','editor-save',{cls:'primary'}),btn('运行','editor-run',{icon:'play'}),btn('编译并启用','editor-compiler'))
    +'<div class="editor-label"><span>源文件</span><code>'+esc(s.id)+'</code></div><textarea spellcheck="false" data-testid="editor-text" aria-label="程序源码">'+esc(d.text)+'</textarea><footer class="status-line"><span class="edit-dirty">'+(d.saved===d.text?'已保存':'● 未保存')+'</span><span>UTF-8 · STRATA VM</span></footer></div>');
  const text=get(e,'editor-text'), file=get(e,'editor-filename');
  text.oninput=()=>{d.text=text.value;e.querySelector('.edit-dirty').textContent=d.saved===d.text?'已保存':'● 未保存';api.persist();};
  on(e,'editor-save',()=>api.act(s,w,'save',{path:file.value,text:text.value}));
  on(e,'editor-run',async()=>{let target=null;if(/发送\.str$/.test(file.value))target=await api.ask(s,'启动发送程序','目标进程 PID','');api.act(s,w,'run',{path:file.value,text:text.value,target});});
  on(e,'editor-new',async()=>{if(d.text!==d.saved&&!await api.confirm(s,'放弃编辑？','当前文本尚未保存。'))return;api.act(s,w,'edit',{path:'/Programs/新程序.str',text:'// Strata VM\nprint("你好，层栈");\n'});});
  on(e,'editor-open',()=>api.pick(s,'打开源文件',p=>/\.(str|txt|scene|flight|sheet|snapshot)$/.test(p),path=>api.act(s,w,'edit',{path,text:readFile(s,path)})));
  on(e,'editor-compiler',()=>api.act(s,w,'compiler',{path:file.value,text:text.value}));
  text.onkeydown=ev=>{if(ev.ctrlKey&&ev.key.toLowerCase()==='s'){ev.preventDefault();api.act(s,w,'save',{path:file.value,text:text.value});}
    if(ev.key==='Tab'){ev.preventDefault();text.setRangeText('  ',text.selectionStart,text.selectionEnd,'end');text.oninput();}};
};
handlers.editor=(s,w,cmd,v,api)=>{
  const d=w.data;
  if(cmd==='edit'){Object.assign(d,v,{saved:v.text});api.remount(s,w);return;}
  const path=v.path.startsWith('/')?v.path:join('/Documents',safeName(v.path));
  writeFile(s,path,v.text);Object.assign(d,{path,text:v.text,saved:v.text});
  if(cmd==='run'){const p=spawn(s,path,{target:v.target});api.notify(s,'已启动 '+p.name+' · PID '+p.pid);api.open(s,'tasks');}
  else if(cmd==='compiler'){activateCompiler(s,path);api.notify(s,'编译器已激活');}
  else api.notify(s,'已保存 '+fileName(path));
  api.refreshFiles(s);api.remount(s,w);
};
mounts.settings=(s,w,e,api)=>{
  const d=s.settings;
  HTML(e,s,w,'<div class="settings-app scroll"><div class="app-heading"><div class="eyebrow">SYSTEM PREFERENCES</div><h2>个性化</h2><p>配置当前桌面的外观与可读性。</p></div><div class="settings-preview wall-'+d.wallpaper+'"><div>'+ico('logo')+'<b>'+esc(s.name)+'</b><span>'+esc(s.id)+'</span></div></div><div class="settings-form"><label>系统名称<input data-testid="settings-name" value="'+esc(s.name)+'" aria-label="系统名称"></label><label>壁纸'+select('settings-wallpaper',[['dawn','高地日出'],['ridge','松岭薄暮'],['ocean','雾蓝山谷'],['grid','等高线']],d.wallpaper,{title:'壁纸'})+'</label><label>强调色'+select('settings-accent',[['#f3a777','琥珀'],['#76c1ae','青瓷'],['#ac96f4','鸢紫'],['#e5a3ad','暮粉'],['#85bcf1','冰蓝'],['#ef995d','赤陶']],d.accent,{title:'强调色'})+'</label><label>界面缩放'+select('settings-scale',[['0.85','85%'],['1','100%'],['1.15','115%'],['1.25','125%'],['1.5','150%']],d.scale,{title:'界面缩放'})+'</label></div></div>');
  for(const id of ['name','wallpaper','accent','scale'])set(e,'settings-'+id,v=>api.act(s,w,id,v));
};
handlers.settings=(s,w,cmd,v,api)=>{if(cmd==='name'){if(v.trim())s.name=v.trim().slice(0,36);}else s.settings[cmd]=cmd==='scale'?+v:v;api.update();api.remount(s,w);};
const status=(s)=>effective(s)==='running'?'运行中':stateNames[effective(s)]??'内核错误';
mounts.systems=(s,w,e,api)=>{
  const cs=children(s);
  HTML(e,s,w,'<div class="app-column systems-app"><div class="app-heading system-heading"><div><div class="eyebrow">SYSTEM TREE</div><h2>系统树</h2><p>创建和管理 '+esc(s.name)+' 的直属系统。</p></div>'+btn('新建子系统','system-new',{cls:'primary',icon:'plus'})+'</div><div class="system-list scroll">'+
    (cs.length?cs.map(c=>{const target={'data-target-system-id':c.id};
      return '<section class="system-row"><div class="system-line">'+badge('system')+'<div><b>'+esc(c.name)+'</b><small>'+esc(s.id)+' / '+esc(c.id)+'</small></div><span class="state-chip '+(effective(c)==='running'?'online':'')+'"><i></i>'+status(c)+'</span></div>'+
      (c.error?'<div class="inline-error"'+(' data-testid="kernel-error" data-target-system-id="'+esc(c.id)+'"')+'>'+esc(c.error)+'</div>':'')+
      '<div class="system-controls">'+btn('打开','system-open',{attrs:target})+btn(c.state==='paused'?'继续':'暂停',c.state==='paused'?'system-resume':'system-pause',{attrs:target})+btn('单步','system-step',{attrs:target})+
      select('system-rate',[['0.25','0.25×'],['0.5','0.5×'],['1','1×'],['2','2×'],['4','4×'],['8','8×']],c.rate,{...target,title:'虚拟时间速率'})+btn('重启','system-restart',{attrs:target})+btn('内核源码','kernel-open',{attrs:target})+
      btn('创建快照','system-snapshot',{attrs:target})+btn('恢复','system-restore',{attrs:target})+btn('分叉','system-fork',{attrs:target})+btn('停止','system-close',{attrs:target})+'</div></section>';
    }).join(''):empty('还没有子系统','创建第一个节点，进入独立的图形与数据桌面。'))+
    '</div><footer class="status-line"><span>'+cs.length+' 个直属节点</span><span>逻辑步 '+Math.round(STEP*1000)+' ms</span></footer></div>');
  on(e,'system-new',()=>api.act(s,w,'system-new'));
  for(const c of e.querySelectorAll('[data-target-system-id]')){
    const id=c.dataset.targetSystemId,t=c.dataset.testid;
    if(c.tagName==='SELECT'){c.onchange=()=>api.act(s,w,t,{id,rate:+c.value});continue;}
    c.onclick=async()=>{
      if(t==='kernel-open'){api.open(s,'editor',{path:byId(id).kernelPath},true);return;}
      if(t==='system-restore'||t==='system-fork'){api.pick(s,t==='system-restore'?'选择要恢复的快照':'选择要分叉的快照',p=>p.endsWith('.snapshot'),path=>api.act(s,w,t,{id,path}));return;}
      if(t==='system-close'&&!await api.confirm(s,'停止整个子树？',id+' 和它的后代系统将停止。'))return;
      api.act(s,w,t,{id});
    };
  }
};
handlers.systems=(s,w,cmd,v,api)=>api.system(s,cmd,v);
mounts.tasks=(s,w,e,api)=>{
  const d=w.data;
  HTML(e,s,w,'<div class="app-column tasks-app"><div class="app-heading compact"><div class="eyebrow">PROCESS MONITOR</div><h2>进程管理器</h2></div>'+
    '<div class="resource-grid"><label>逻辑预算 / 步<input type="number" min="1" max="50000" data-testid="tasks-budget" value="'+s.budget+'"></label><label>本步实际<span class="task-actual"></span></label><label>内存配额 / MB<input type="number" min="0.01" step="0.1" data-testid="tasks-memory" value="'+(s.memory/1024**2)+'"></label><label>存储配额 / MB<input type="number" min="0.01" step="0.1" data-testid="tasks-storage" value="'+(s.storage/1024**2)+'"></label></div>'+
    '<div class="grant-row">'+children(s).map(c=>'<label>'+esc(c.id)+' 拨付上限 <input type="number" min="1" data-testid="tasks-grant" aria-label="子系统拨付上限" data-target-system-id="'+esc(c.id)+'" value="'+c.grant+'"></label>').join('')+'</div>'+
    '<div class="process-scroll"><table class="process"><thead><tr><th>PID / 名称</th><th>状态</th><th>本步 / 累计</th><th>剩余</th><th>内存</th><th>队列</th></tr></thead><tbody></tbody></table></div>'+
    '<div class="process-output"><div class="toolbar"><span class="process-name">选择一个进程</span><input data-testid="task-limit" type="number" min="1" value="4096" aria-label="进程额度">'+btn('挂起','task-suspend')+btn('继续','task-resume')+btn('结束','task-end')+'</div><pre></pre></div></div>');
  for(const name of ['budget','memory','storage'])set(e,'tasks-'+name,v=>api.act(s,w,'quota',{name,value:+v}));
  for(const input of e.querySelectorAll('[data-testid="tasks-grant"]'))input.onchange=()=>api.act(s,w,'grant',{id:input.dataset.targetSystemId,value:+input.value});
  set(e,'task-limit',v=>api.act(s,w,'limit',+v));
  for(const a of ['suspend','resume','end'])on(e,'task-'+a,()=>api.act(s,w,a));
  const tbody=e.querySelector('tbody'),rows=new Map();
  e.refresh=()=>{
    e.querySelector('.task-actual').textContent=s.actual+' / '+s.budget+' · 内核 '+s.kUsed+' · '+fmtBytes(memoryUsed(s))+' / '+fmtBytes(storageUsed(s));
    const active=new Set(), place=(key,markup,pid)=>{
      active.add(key);let tr=rows.get(key);
      if(!tr){
        tr=document.createElement('tr');tbody.append(tr);rows.set(key,tr);
        if(pid!==undefined){
          tr.dataset.pid=pid;
          tr.onclick=()=>{d.pid=pid;get(e,'task-limit').value=s.procs[d.pid]?.limit??4096;e.refresh();};
        }
      }
      tr.classList.toggle('selected',pid!==undefined&&d.pid===pid);
      if(tr.displayCells!==markup){tr.displayCells=markup;tr.innerHTML=markup;}
    };
    for(const p of Object.values(s.procs))place('p'+p.pid,'<td><code>'+p.pid+'</code> '+esc(p.name)+(p.kind==='carrier'?'<small>内核 '+p.kernel+' / 内部 '+p.inner+'</small>':'')+'</td><td><i class="dot '+p.state+'"></i>'+stateNames[p.state]+'</td><td>'+p.used+' / '+p.total+'</td><td>'+(p.pending?.left??p.jobs[0]?.left??p.debt??0)+'</td><td>'+fmtBytes(procMem(p))+'</td><td>'+p.inbox.length+'</td>',p.pid);
    if(s.id==='outer')for(const b of api.browsers())place('b'+b.windowId+b.tabId,'<td>Chromium · '+esc(b.tabId)+'</td><td>'+esc(b.loadState)+'</td><td colspan="4">网页设备 · 独立执行</td>');
    for(const [key,tr] of rows)if(!active.has(key)){tr.remove();rows.delete(key);}
    const p=s.procs[d.pid];e.querySelector('.process-name').textContent=p?'PID '+p.pid+' · '+p.name:'选择一个进程';
    const out=(p?.error?'异常 · '+p.error+'\n':'')+(p?.output.join('\n')??'');const pre=e.querySelector('pre');if(pre.textContent!==out){pre.textContent=out;pre.scrollTop=pre.scrollHeight;}
  };
  e.refresh();
};
handlers.tasks=(s,w,cmd,v,api)=>{
  const p=s.procs[w.data.pid],pos=n=>Number.isFinite(n)?Math.max(1,n):1;
  if(cmd==='quota')s[v.name]=v.name==='budget'?Math.min(50000,pos(v.value)):Math.max(.01,v.value||0)*1024**2;
  if(cmd==='grant'&&byId(v.id)?.parentId===s.id)byId(v.id).grant=Math.min(50000,pos(v.value));
  if(p){
    if(cmd==='limit')p.limit=Math.min(50000,pos(v));
    if(cmd==='suspend'&&!['ended','error','suspended'].includes(p.state)){p.before=p.state;p.state='suspended';}
    if(cmd==='resume'&&p.state==='suspended')p.state=p.before??'ready';
    if(cmd==='end')endProc(s,p);
    if(p.kind==='carrier'&&(cmd==='suspend'||cmd==='resume')){
      for(const view of Object.values(s.wins))if(view.appId==='systems')api.remount(s,view);
      api.update();
    }
  }
};
mounts.help=(s,w,e)=>{HTML(e,s,w,'<div class="help-app scroll"><div class="eyebrow">STRATA / FIELD MANUAL</div><h2>层栈操作说明</h2><pre>'+esc(readFile(s,'/Documents/操作说明.txt'))+'</pre></div>');};
const dayfmt=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
const tfmt=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
mounts.widgets=(s,w,e,api)=>{
 const d=w.data,now=new Date(s.epoch+s.time*1000);d.month??=now.getMonth();d.year??=now.getFullYear();
 const today=now.getFullYear()===d.year&&now.getMonth()===d.month?now.getDate():-1;
 const first=(new Date(d.year,d.month,1).getDay()+6)%7,len=new Date(d.year,d.month+1,0).getDate();
 HTML(e,s,w,'<div class="widgets-app scroll"><div class="app-heading compact"><div class="eyebrow">DESKTOP TOOLS</div><h2>小组件</h2></div><div class="widget-grid"><section class="widget-card"><header><span class="widget-clock"></span><small>'+dayfmt.format(now)+'</small></header><div class="month">'+btn('上月','widget-prev',{icon:'back',only:true})+'<b>'+d.year+' 年 '+(d.month+1)+' 月</b>'+btn('下月','widget-next',{icon:'next',only:true})+'</div><div class="calendar">'+['一','二','三','四','五','六','日'].map(x=>'<label>'+x+'</label>').join('')+'<span></span>'.repeat(first)+Array.from({length:len},(_,i)=>'<span class="'+(i+1===today?'today':'')+'">'+(i+1)+'</span>').join('')+'</div></section>'+
 '<section class="widget-card"><h3>倒计时</h3><div class="widget-timer countdown">00:00</div><div class="toolbar"><input data-testid="widget-timer-input" aria-label="倒计时秒数" type="number" min="1" value="'+(s.timer?.seconds??60)+'">'+btn('开始','widget-timer-start',{cls:'primary'})+btn('暂停','widget-timer-pause')+btn('重置','widget-timer-reset')+'</div><h3>秒表</h3><div class="widget-timer stopwatch">00:00.0</div><div class="toolbar">'+btn('开始 / 暂停','widget-watch')+btn('归零','widget-watch-reset')+'</div></section>'+
 '<section class="widget-card"><h3>便笺</h3><textarea data-testid="widget-note-text" aria-label="便笺内容" placeholder="记下一件事…">'+esc(s.note)+'</textarea>'+btn('保存便笺','widget-note-save')+'</section>'+
 '<section class="widget-card"><h3>剪贴板与快捷设置</h3><div class="clips" data-testid="widget-clipboard-list">'+(s.clips.map(x=>'<button type="button" data-copy="'+esc(x)+'">'+esc(x)+'</button>').join('')||'<small>复制文本或表格选区后出现在这里。</small>')+'</div><div class="toolbar">'+btn('通知中心','widget-notifications',{icon:'bell'})+btn(s.settings.dnd?'关闭免打扰':'开启免打扰','widget-dnd')+btn('外观','widget-settings')+'</div></section></div></div>');
 for(const [id,cmd,val] of [['widget-prev','month',-1],['widget-next','month',1],['widget-timer-start','start',()=>+get(e,'widget-timer-input').value],['widget-timer-pause','pause'],['widget-timer-reset','reset'],['widget-watch','watch'],['widget-watch-reset','watchReset'],['widget-note-save','note',()=>get(e,'widget-note-text').value],['widget-dnd','dnd']])on(e,id,()=>api.act(s,w,cmd,typeof val==='function'?val():val));
 on(e,'widget-notifications',()=>api.notices(s));on(e,'widget-settings',()=>api.open(s,'settings'));
 for(const b of e.querySelectorAll('[data-copy]'))b.onclick=()=>api.copy(s,b.dataset.copy);
 e.refresh=()=>{
   const t=s.timer,v=t?.until!=null?Math.max(0,t.until-s.time):t?.remaining??0;
   const ts=Math.ceil(v), watch=s.watch,wt=(watch?.elapsed??0)+(watch?.start!=null?s.time-watch.start:0);
   e.querySelector('.widget-clock').textContent=tfmt.format(new Date(s.epoch+s.time*1000));
   e.querySelector('.countdown').textContent=String(Math.floor(ts/60)).padStart(2,'0')+':'+String(ts%60).padStart(2,'0');
   e.querySelector('.stopwatch').textContent=String(Math.floor(wt/60)).padStart(2,'0')+':'+(wt%60).toFixed(1).padStart(4,'0');
 };e.refresh();
};
handlers.widgets=(s,w,cmd,v,api)=>{
 const d=w.data;
 switch(cmd){
  case 'month':{const date=new Date(d.year,d.month+v,1);d.month=date.getMonth();d.year=date.getFullYear();api.remount(s,w);break;}
  case 'start':{const seconds=s.timer?.remaining>0?s.timer.remaining:Math.max(1,Number(v)||1);s.timer={until:s.time+seconds,seconds:v,remaining:0};break;}
  case 'pause':if(s.timer?.until!=null){s.timer.remaining=Math.max(0,s.timer.until-s.time);s.timer.until=null;}break;
  case 'reset':if(s.timer){s.timer.until=null;s.timer.remaining=0;}break;
  case 'watch':s.watch??={elapsed:0,start:null};if(s.watch.start!=null){s.watch.elapsed+=s.time-s.watch.start;s.watch.start=null;}else s.watch.start=s.time;break;
  case 'watchReset':s.watch={elapsed:0,start:null};break;
  case 'note':s.note=v;api.notify(s,'便笺已保存');break;
  case 'dnd':s.settings.dnd=!s.settings.dnd;api.remount(s,w);break;
 }
};
const webWindows=new Map();
export function browserInfo(){return [...webWindows.values()].flatMap(b=>b.tabs.map(t=>({windowId:b.w.id,tabId:t.id,url:t.url,loadState:t.state})));}
export function closeBrowser(w){const b=webWindows.get(w.id);if(b){for(const t of b.tabs)t.view.remove();webWindows.delete(w.id);}}
export function externalTab(guest,url){for(const b of webWindows.values())if(b.tabs.some(t=>{try{return t.view.getWebContentsId()===guest;}catch{return false;}})){b.add(url);break;}}
mounts.browser=(s,w,e,api)=>{
 if(webWindows.has(w.id))closeBrowser(w);
 HTML(e,s,w,'<div class="app-column browser-app"><div class="browser-tabs"></div>'+bar(
 btn('后退','browser-back',{icon:'back',only:true}),btn('前进','browser-forward',{icon:'next',only:true}),btn('刷新','browser-reload',{icon:'reload',only:true}),btn('停止加载','browser-stop',{icon:'stop',only:true}),
 '<input data-testid="browser-address" aria-label="网址" placeholder="输入网址或搜索关键词">',btn('前往','browser-go',{icon:'next',only:true}))
 +'<div class="web-shell"></div><footer class="status-line"><span class="browser-status"></span><span>Chromium · 隔离网页</span></footer></div>');
 const b={w,tabs:[],active:null,count:0,add:null};webWindows.set(w.id,b);
 const addr=get(e,'browser-address'), deck=e.querySelector('.web-shell'), tabList=e.querySelector('.browser-tabs');
 const active=()=>b.tabs.find(t=>t.id===b.active);
 let renderedTabs='';
 function fail(tab,description){
   if(!b.tabs.includes(tab))return;
   tab.state='error';tab.error='加载失败 · '+description;
   tab.home.querySelector('.web-error').textContent=tab.error;
   draw();
 }
 function draw(){
   const tab=active();
   const signature=JSON.stringify([b.active,b.tabs.map(t=>[t.id,t.title,t.state])]);
   if(signature!==renderedTabs){
     renderedTabs=signature;
     tabList.innerHTML=b.tabs.map(t=>'<div class="browser-tab '+(tab===t?'active':'')+(t.state==='loading'?' loading':'')+'">'+btn(t.title||'新标签页','browser-tab',{icon:'browser',attrs:{'data-tab-id':t.id,'aria-pressed':t===tab}})+btn('关闭标签','browser-close-tab',{icon:'close',only:true,attrs:{'data-tab-id':t.id}})+'</div>').join('')+btn('新建标签','browser-new-tab',{icon:'plus',only:true});
     stamp(tabList,s.id,w.id);on(tabList,'browser-new-tab',()=>b.add());
     for(const n of tabList.querySelectorAll('[data-tab-id]'))n.onclick=()=>{if(n.dataset.testid==='browser-tab'){b.active=n.dataset.tabId;draw();}else close(n.dataset.tabId);};
   }
   for(const t of b.tabs){
     const showPage=t.state!=='error'&&t.loaded&&(t.state!=='stopped'||t.knownPage);
     t.view.style.display=t===tab&&showPage?'flex':'none';
     t.home.hidden=t!==tab||showPage;
     get(t.home,'browser-retry').hidden=t.state!=='error'||!t.url;
   }
   if(document.activeElement!==addr)addr.value=tab?.url??'';
   e.querySelector('.browser-status').textContent=tab?.state==='loading'?'正在联网加载…':tab?.state==='error'?tab.error:tab?.state==='stopped'?'已停止加载':tab?.loaded?'页面已加载':'新标签页';
   get(e,'browser-stop').disabled=tab?.state!=='loading';
 }
 function close(id){const t=b.tabs.find(x=>x.id===id);if(!t)return;t.view.remove();t.home.remove();b.tabs=b.tabs.filter(x=>x!==t);if(!b.tabs.length)b.add();if(b.active===id)b.active=b.tabs.at(-1).id;draw();}
 const navigate=(input,tab=active())=>{
   let url=input.trim();if(!url)return;
   if(!/^https?:\/\//i.test(url))url=/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url)?'https://'+url:'https://www.bing.com/search?q='+encodeURIComponent(url);
   tab.url=url;tab.state='loading';tab.error='';tab.home.querySelector('.web-error').textContent='';
   addr.value=url;addr.blur();
   try{new URL(url);}catch{fail(tab,'网址格式无效');return;}
   const serial=++tab.navigation;
   if(!tab.loaded){tab.view.src=url;deck.append(tab.view);tab.loaded=true;}
   else tab.view.loadURL(url).catch(err=>{
     if(serial===tab.navigation&&tab.state==='loading'&&!String(err.message).includes('ERR_ABORTED'))fail(tab,err.message);
   });
   draw();
 };
 b.add=(url)=> {
   const view=document.createElement('webview');view.partition='persist:strata-browser';view.setAttribute('allowpopups','');view.setAttribute('webpreferences','contextIsolation=yes, sandbox=yes, backgroundThrottling=no');view.tabIndex=0;
   const home=el('div','browser-home','<div class="browser-brand">'+ico('browser')+'</div><h2>层栈浏览器</h2><p>在地址栏输入网址，或打开一个站点。</p><div>'+btn('打开哔哩哔哩','browser-bili',{icon:'next'})+btn('打开示例网页','browser-example')+btn('重试加载','browser-retry',{icon:'reload'})+'</div><small class="web-error" role="status"></small>');
   const t={id:'tab-'+(++b.count),view,home,title:'新标签页',url:'',state:'idle',error:'',loaded:false,knownPage:false,navigation:0};
   stamp(home,s.id,w.id);on(home,'browser-bili',()=>navigate('https://www.bilibili.com/',t));on(home,'browser-example',()=>navigate('https://example.com/',t));on(home,'browser-retry',()=>navigate(t.url,t));
   view.addEventListener('did-start-loading',()=>{t.state='loading';draw();});
   view.addEventListener('did-stop-loading',()=>{if(t.state==='loading')t.state='loaded';draw();});
   view.addEventListener('did-navigate',ev=>{if(/^https?:/i.test(ev.url)){t.url=ev.url;t.knownPage=true;}draw();});
   view.addEventListener('did-navigate-in-page',ev=>{if(ev.isMainFrame){t.url=ev.url;draw();}});
   view.addEventListener('page-title-updated',ev=>{t.title=ev.title;draw();});
   view.addEventListener('did-fail-load',ev=>{if(ev.isMainFrame&&ev.errorCode!==-3)fail(t,ev.errorDescription);});
   view.addEventListener('render-process-gone',()=>fail(t,'网页进程已退出'));
   view.addEventListener('focus',()=>api.focus(s,w));
   deck.append(home);b.tabs.push(t);b.active=t.id;if(url)navigate(url,t);draw();
 };
 on(e,'browser-go',()=>navigate(addr.value));addr.onkeydown=ev=>{if(ev.key==='Enter')navigate(addr.value);};
 const webAction=verb=>{
   const tab=active();if(!tab)return;
   if(verb==='reload'&&tab.state==='error'){navigate(tab.url,tab);return;}
   if(!tab.loaded)return;
   try{
     if(verb==='stop'){tab.state='stopped';tab.navigation++;draw();}
     else if(verb==='reload'){tab.state='loading';draw();}
     tab.view[verb]();
   }catch(err){fail(tab,err.message);}
 };
 on(e,'browser-back',()=>webAction('goBack'));on(e,'browser-forward',()=>webAction('goForward'));on(e,'browser-reload',()=>webAction('reload'));on(e,'browser-stop',()=>webAction('stop'));
 b.add();
};
