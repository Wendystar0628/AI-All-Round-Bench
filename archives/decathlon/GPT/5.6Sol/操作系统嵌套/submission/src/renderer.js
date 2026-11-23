import { buildApp, appCatalog } from './ui-apps.js';

const $ = (selector, root = document) => root.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const deepClone = (value) => structuredClone(value);

const GLYPHS = {
  files: 'F', spreadsheet: 'Σ', widgets: '◷', editor: '{ }', browser: '◎', tasks: '≋',
  settings: '⚙', player: '24', charts: '▥', help: '?', system: '◈', projection: '↗'
};

function defaultFiles(isRoot, id) {
  const common = {
    '/Documents': { type: 'dir' },
    '/Downloads': { type: 'dir' },
    '/Demo': { type: 'dir' },
    '/Programs': { type: 'dir' },
    '/System': { type: 'dir' },
    '/Snapshots': { type: 'dir' },
    '/Documents/欢迎使用.txt': { type: 'text', content: `欢迎来到 ${id}。\n所有程序、文件与运行状态都属于当前系统实例。` },
    '/Programs/accumulate.nos': { type: 'program', content: 'PROGRAM 累加计算\nSET total 0\nLOOP 120\nADD total 1\nEND\nPRINT total\nHALT' },
    '/Programs/sender.nos': { type: 'program', content: 'PROGRAM 消息发送\nSET text 来自进程的问候\nSEND 消息接收 text\nPRINT 已发送\nHALT' },
    '/Programs/receiver.nos': { type: 'program', content: 'PROGRAM 消息接收\nRECV message\nPRINT message\nHALT' },
    '/Programs/continuous.nos': { type: 'program', content: 'PROGRAM 持续计算\nSET counter 0\nFOREVER\nADD counter 1\nEND' },
    '/System/compiler.nos': { type: 'program', content: 'PROGRAM NEST编译器\nCOMPILER NEST/1\nALLOW PROGRAM SET ADD LOOP FOREVER END PRINT SEND RECV WAIT WRITE DISPLAY CALL HALT\nHALT' },
    '/System/desktop-shell.nos': { type: 'program', content: `PROGRAM 桌面外壳\nSERVICE desktop-shell\nAPPS ${isRoot?'files spreadsheet browser widgets editor tasks settings help':'player charts files editor tasks help'}\nLAYOUT vertical\nHALT` },
    '/System/window-manager.nos': { type: 'program', content: 'PROGRAM 窗口管理器\nSERVICE window-manager\nSTACK focused-last\nHITTEST topmost\nFOCUS pointer-down\nHALT' },
    '/System/file-manager.nos': { type: 'program', content: 'PROGRAM 文件管理器\nSERVICE file-manager\nSORT directory-first name-asc\nOVERWRITE confirm\nDELETE recycle-if-root\nHALT' },
    '/System/chart-workbench.nos': { type: 'program', content: 'PROGRAM 图表工作台\nSERVICE chart-workbench\nVALUES numeric scale=1\nTRANSITION 0.28\nSUBSCRIBE version-monotonic\nHALT' },
    '/System/scene-player.nos': { type: 'program', content: 'PROGRAM 场景播放器\nSERVICE scene-player\nSPEED scale=1\nTIMELINE cost=12\nSCENE cost=30\nAPPLICATION cost=6\nREHEARSAL cost=150\nFRAMESTEP 0.033333\nHALT' },
    '/System/projection-service.nos': { type: 'program', content: 'PROGRAM 跨层投送服务\nSERVICE projection-service\nDISPLAY copy\nINPUT message-queue\nHALT' },
    '/System/flight-control.nos': { type: 'program', content: 'PROGRAM 飞控\nEVERY 0.05\nSENSE attitude altitude heading\nCONTROL collective = 0.62 + (targetAltitude-altitude)*0.08\nCONTROL cyclic = -attitude*0.22\nWAIT 0.05\nEND' },
    '/Demo/helicopter-24.scene': { type: 'scene', content: JSON.stringify({
      format:'AEROLITH-SCENE/1', name:'24号 · 暮光谷', duration:15, fps:30, weather:'峡谷薄雾 / 18:40', cameras:['action','follow','free'],
      vehicle:{ type:'helicopter', number:'24', palette:['#7137a8','#f4c849','#32184f'], bodyScale:[2.65,1.25,1.15], tailLength:6.5, mainRotorRadius:7.8, parts:['机身','座舱','尾梁','主旋翼','尾旋翼','起落架'] },
      environment:{ terrain:{ size:[110,90], amplitude:.42, seed:24 }, pads:[{position:[0,0],label:'H-24'},{position:[21,-14],label:'PAD B'}], hangars:4, trees:65, rocks:18 },
      timeline:[
        {t:0,position:[0,1.3,0],rotation:[0,0,0],event:'ready'}, {t:1.2,position:[0,1.35,0],rotation:[0,.02,0],event:'rotor-start'},
        {t:2.8,position:[0,6.7,0],rotation:[.03,.05,0],event:'lift'}, {t:7,position:[17,8.2,-8],rotation:[0,-.5,.1],event:'forward-turn'},
        {t:9.4,position:[24,7,-3],rotation:[.2,.4,.3],event:'fault-warning'}, {t:10.8,position:[27,4.8,-1.2],rotation:[.62,2.7,1.75],event:'loss-control'},
        {t:12.15,position:[29,1.05,-3],rotation:[1,4.9,2.7],event:'impact'}, {t:13.35,position:[29.9,1.05,-2.75],rotation:[1.3,5.2,2.45],event:'settle'},
        {t:15,position:[29.9,1.05,-2.75],rotation:[1.3,5.2,2.45],event:'end'}
      ], effects:{fault:9.4,impact:12.15,settle:13.35,smoke:26,debris:14}
    }, null, 2) }
  };
  if (isRoot) {
    Object.assign(common, {
      '/Recycle Bin': { type: 'dir' },
      '/Recycle Bin/旧航线.txt': { type: 'text', content: '已删除：旧航线草稿', deletedFrom: '/Documents/旧航线.txt' },
      '/Demo/sample.sheet': { type: 'sheet', content: JSON.stringify({
        format: 'AEROLITH-SHEET/1',
        cells: { A1:'项目',B1:'数量',C1:'单价',D1:'小计',A2:'项目 A',B2:'24',C2:'6',D2:'=B2*C2',A3:'项目 B',B3:'12',C3:'8',D3:'=B3*C3',A4:'项目 C',B4:'18',C4:'4',D4:'=B4*C4' }
      }, null, 2) }
    });
  }
  return common;
}

function baseProcesses(isRoot) {
  const list = [
    { id:'p-kernel', name:isRoot?'host-kernel':'nest-kernel', role:'内核调度', state:'ready', used:0, remaining:0, memory:18, quota:140, pc:0, output:[] },
    { id:'p-window', name:'window-manager', role:'窗口与输入', state:'waiting', used:0, remaining:0, memory:12, quota:70, pc:0, output:[] },
    { id:'p-fs', name:'filesystem', role:'文件服务', state:'waiting', used:0, remaining:0, memory:9, quota:55, pc:0, output:[] }
  ];
  if (!isRoot) list.push(
    { id:'p-player', name:'scene-player', role:'播放器应用程序', state:'waiting', used:0, remaining:0, memory:9, quota:80, pc:0, output:[] },
    { id:'p-scene', name:'scene-physics', role:'飞行场景', state:'waiting', used:0, remaining:0, memory:28, quota:150, pc:0, output:[] },
    { id:'p-timeline', name:'timeline', role:'演出时序', state:'waiting', used:0, remaining:0, memory:8, quota:70, pc:0, output:[] },
    { id:'p-flight', name:'flight-control', role:'闭环飞控', state:'waiting', used:0, remaining:0, memory:7, quota:95, pc:0, output:[] },
    { id:'p-chart-rx', name:'chart-receiver', role:'数据接收', state:'waiting', used:0, remaining:0, memory:6, quota:70, pc:0, output:[] },
    { id:'p-chart-draw', name:'chart-render', role:'图表计算', state:'waiting', used:0, remaining:0, memory:10, quota:95, pc:0, output:[] }
  );
  return list;
}

class Runtime {
  constructor() {
    this.systems = new Map();
    this.desktops = new Map();
    this.windows = new Map();
    this.projections = new Map();
    this.chartConnections = new Set();
    this.playerViews = new Set();
    this.nextSystem = 1;
    this.nextWindow = 1;
    this.nextProcess = 1;
    this.tickNumber = 0;
    this.clipboard = [];
    this.notifications = [];
    this.workbook = null;
    this.lastWallTick = performance.now();
    this.readyPromise = new Promise((resolve) => { this.resolveReady = resolve; });
    this.savedRoot = null;
    try { this.savedRoot = JSON.parse(localStorage.getItem('aerolith.root.v1') || 'null'); } catch {}
  }

  initialSystem(id = 'outer', parentId = null, name = 'AEROLITH 外层桌面') {
    const isRoot = parentId === null;
    const system = {
      id, parentId, name, level: isRoot ? 0 : (this.systems.get(parentId)?.level ?? 0) + 1,
      state:'running', ownPaused:false, kernelError:null, virtualTime:0, rate:1,
      budget:isRoot?900:620, grant:isRoot?900:500, actualGrant:isRoot?900:0,
      memoryLimit:isRoot?2048:768, storageLimit:isRoot?4096:1024,
      scheduler:'round-robin', messageRule:'fifo', fileRule:'copy',
      playerRules:{speed:1,timelineCost:12,sceneCost:30,applicationCost:6,rehearsalCost:150,frameStep:1/30},
      desktopApps:isRoot?['files','spreadsheet','browser','widgets','editor','tasks','settings','help']:['player','charts','files','editor','tasks','help'],
      projectionRule:'copy', projectionInput:'message-queue',
      files:defaultFiles(isRoot, id), processes:baseProcesses(isRoot), windows:[], children:[],
      settings:{ accent:isRoot?'#f5c34f':'#b98cff', wallpaper:isRoot?'aerolith':'violet', scale:1, dnd:false },
      note:'', timer:{ remaining:0, running:false, completed:false }, stopwatch:{ elapsed:0, running:false },
      messages:[], snapshots:[], schedulerCursor:0, lastProcessRefresh:0,
      fileVersion:1, workUsed:0
    };
    if (isRoot && this.savedRoot) {
      system.files = { ...system.files, ...(this.savedRoot.files || {}) };
      system.settings = { ...system.settings, ...(this.savedRoot.settings || {}) };
      system.note = this.savedRoot.note || '';
      system.name = this.savedRoot.name || system.name;
      system.fileVersion = this.savedRoot.fileVersion || system.fileVersion;
    }
    return system;
  }

  reset(clearPersistent = false) {
    if (clearPersistent) { localStorage.removeItem('aerolith.root.v1'); this.savedRoot = null; }
    for (const view of this.playerViews) view.dispose?.();
    this.playerViews.clear();
    this.systems.clear(); this.desktops.clear(); this.windows.clear(); this.projections.clear(); this.chartConnections.clear();
    this.nextSystem = 1; this.nextWindow = 1; this.nextProcess = 1; this.clipboard = []; this.notifications = [];
    this.workbook = null;
    $('#workspace').replaceChildren();
    const root = this.initialSystem();
    this.systems.set(root.id, root);
    const desktop = new Desktop(this, root, $('#workspace'), false);
    this.desktops.set(root.id, desktop);
    this.notify('系统就绪', '外层桌面与执行服务已启动', 'outer', false);
    return true;
  }

  persist() {
    const root = this.systems.get('outer');
    if (!root) return;
    const saved = { name:root.name, files:root.files, settings:root.settings, note:root.note, fileVersion:root.fileVersion };
    try { localStorage.setItem('aerolith.root.v1', JSON.stringify(saved)); this.savedRoot = saved; } catch {}
  }

  createSystem(parentId, options = {}) {
    const parent = this.systems.get(parentId);
    if (!parent || parent.level >= 6) return null;
    const id = options.id || `inner-${this.nextSystem++}`;
    const sys = this.initialSystem(id, parentId, options.name || id);
    if (options.snapshotData) Object.assign(sys, deepClone(options.snapshotData), { id, parentId, name:options.name || id, children:[], windows:[], level:parent.level + 1 });
    this.systems.set(id, sys);
    parent.children.push(id);
    parent.files[`/Systems`] ||= { type:'dir' };
    parent.files[`/Systems/${id}`] = { type:'dir' };
    parent.files[`/Systems/${id}/kernel.nos`] = { type:'program', content:'PROGRAM NEST内核\nKERNEL NEST/1\nSCHEDULER round-robin\nMESSAGE fifo\nFILES copy\nSYSCALL echo RETURN ok\nBOOT desktop window-manager filesystem' };
    parent.processes.push({ id:`carrier-${id}`, name:`${id} carrier`, role:'子系统承载', state:'ready', used:0, remaining:0, memory:24, quota:parent.level===0?480:Math.max(140,Math.floor(parent.grant*.58)), pc:0, childId:id, output:[] });
    const w = this.openWindow(parentId, 'system', { title:`${id} · 嵌套执行平面`, childId:id, width:Math.max(690, this.desktops.get(parentId).root.clientWidth*.76), height:Math.max(480,(this.desktops.get(parentId).root.clientHeight-48)*.77), x:Math.max(130, parent.level*22+170), y:Math.max(62,parent.level*18+68) });
    this.desktops.get(parentId)?.refreshChrome();
    this.notify('子系统已启动', `${id} 正在由 ${parentId} 的承载进程执行`, parentId);
    setTimeout(() => {
      if (this.systems.has(id) && !sys.windows.length) this.openWindow(id, 'player', { x:125, y:58, width:Math.min(880, this.desktops.get(id)?.root.clientWidth - 155), height:Math.min(580, this.desktops.get(id)?.root.clientHeight - 115) });
    }, 120);
    return { system:sys, window:w };
  }

  openWindow(systemId, appId, options = {}) {
    const sys = this.systems.get(systemId);
    const desktop = this.desktops.get(systemId);
    if (!sys || !desktop) return null;
    if (!options.allowMultiple && !['editor','player','projection','system'].includes(appId)) {
      const existing = sys.windows.map(id => this.windows.get(id)).find(w => w?.appId === appId && !w.closed);
      if (existing) { existing.restore(); existing.focus(); return existing; }
    }
    const meta = appCatalog[appId] || { title:appId, min:[420,280], size:[720,480] };
    const estimate=appId==='player'?32:appId==='browser'?90:appId==='system'?24:10;
    const memoryUsed=sys.processes.reduce((sum,p)=>sum+(Number(p.memory)||0),0);
    if(memoryUsed+estimate>sys.memoryLimit){this.notify('无法启动应用',`${appId} 需要 ${estimate} MB，${systemId} 内存配额不足`,systemId);return null;}
    const id = options.id || `win-${this.nextWindow++}`;
    const index = sys.windows.length;
    const w = new ManagedWindow(this, desktop, {
      id, systemId, appId, title:options.title || meta.title, childId:options.childId, sourceWindowId:options.sourceWindowId,
      filePath:options.filePath,
      x:options.x ?? 120 + (index%5)*34, y:options.y ?? 70 + (index%4)*28,
      width:options.width ?? meta.size?.[0] ?? 760, height:options.height ?? meta.size?.[1] ?? 520,
      minWidth:meta.min?.[0] ?? 360, minHeight:meta.min?.[1] ?? 230
    });
    this.windows.set(id, w); sys.windows.push(id); desktop.addWindow(w);
    w.setContent();
    sys.processes.push({id:`app-${id}`,name:appId==='projection'?`projection-frame:${id}`:`${appId}:${id}`,role:appId==='projection'?'目标桌面投送外框':'应用服务',state:'waiting',used:0,remaining:0,memory:appId==='player'?32:appId==='browser'?18:10,quota:appId==='player'?120:60,pc:0,windowId:id,output:[]});
    w.focus(); desktop.refreshTaskbar();
    return w;
  }

  mountDesktop(systemId, container) {
    const sys = this.systems.get(systemId);
    if (!sys) return null;
    const existing = this.desktops.get(systemId);
    if (existing) return existing;
    const desktop = new Desktop(this, sys, container, true);
    this.desktops.set(systemId, desktop);
    return desktop;
  }

  closeWindow(win, force = false) {
    if (!win || win.closed) return;
    if (win.appId === 'spreadsheet' && win.workbook?.dirty && !force) {
      if (confirm('工作簿有未保存的修改。现在保存吗？')) win.content.querySelector('[data-testid="sheet-save"]')?.click();
      else if (!confirm('放弃未保存的修改并关闭？选择“取消”可返回工作簿。')) return;
    }
    if (win.appId === 'system' && !force) {
      if (!confirm(`停止 ${win.childId} 及其整棵子树？保存的快照不会删除。`)) return;
      this.stopSubtree(win.childId);
    }
    if (win.appId !== 'projection') {
      for (const p of [...this.windows.values()]) if (p.appId === 'projection' && p.sourceWindowId === win.id) this.closeWindow(p, true);
    } else this.projections.delete(win.sourceWindowId);
    win.closed = true;
    win.dispose?.();
    win.el.remove();
    const sys = this.systems.get(win.systemId);
    if (sys) { sys.windows = sys.windows.filter(id => id !== win.id); sys.processes = sys.processes.filter(p => p.windowId !== win.id); }
    this.windows.delete(win.id);
    this.desktops.get(win.systemId)?.refreshTaskbar();
  }

  stopSubtree(systemId) {
    const sys = this.systems.get(systemId); if (!sys) return;
    for (const child of [...sys.children]) this.stopSubtree(child);
    for (const id of [...sys.windows]) this.closeWindow(this.windows.get(id), true);
    this.desktops.delete(systemId); this.systems.delete(systemId);
    const parent = this.systems.get(sys.parentId);
    if (parent) {
      parent.children = parent.children.filter(id => id !== systemId);
      parent.processes = parent.processes.filter(p => p.childId !== systemId);
      this.desktops.get(parent.id)?.refreshChrome();
    }
  }

  ancestors(systemId) {
    const result = [];
    let sys = this.systems.get(systemId);
    while (sys?.parentId) { sys = this.systems.get(sys.parentId); if (sys) result.push(sys); }
    return result;
  }

  isEffectivelyPaused(systemId) {
    let sys = this.systems.get(systemId);
    while (sys) { if (sys.ownPaused || sys.state !== 'running') return true; sys = this.systems.get(sys.parentId); }
    return false;
  }

  setPaused(id, paused) {
    const sys = this.systems.get(id); if (!sys) return;
    sys.ownPaused = paused; sys.state = paused?'paused':'running';
    const refreshTree=systemId=>{this.desktops.get(systemId)?.refreshChrome();for(const child of this.systems.get(systemId)?.children||[])refreshTree(child);};refreshTree(id);this.desktops.get(sys.parentId)?.refreshChrome();
    this.notify(paused?'子树已暂停':'子树已继续', `${id} ${paused?'的时钟、进程与应用内容已冻结':'从原状态继续推进'}`, sys.parentId || id);
  }

  singleStep(id) {
    const sys = this.systems.get(id); if (!sys || !sys.ownPaused || (sys.parentId && this.isEffectivelyPaused(sys.parentId))) return;
    this.advanceSystem(sys, 1/30, true);
    this.notify('完成单步', `${id} 推进固定逻辑步 33.33 ms`, sys.parentId || id, false);
  }

  restartSystem(id, internal = false) {
    const sys = this.systems.get(id); if (!sys?.parentId) return;
    const parent = this.systems.get(sys.parentId);
    const source = parent.files[`/Systems/${id}/kernel.nos`]?.content || '';
    if (!source.includes('KERNEL NEST/1') || !source.includes('SCHEDULER')) {
      sys.kernelError = '内核校验失败：缺少 KERNEL NEST/1 或 SCHEDULER 指令'; sys.state='error';
      this.desktops.get(id)?.showKernelError(sys.kernelError); this.notify('内核启动失败', sys.kernelError, parent.id); return;
    }
    const scheduler = source.match(/SCHEDULER\s+([\w-]+)/i)?.[1] || 'round-robin';
    const messageRule = source.match(/MESSAGE\s+([\w-]+)/i)?.[1] || 'fifo';
    const fileRule = source.match(/FILES\s+([\w-]+)/i)?.[1] || 'copy';
    const customSyscalls = [...source.matchAll(/SYSCALL\s+([\w-]+)(?:\s+RETURN\s+([^\r\n]+))?/gi)].map(m=>({name:m[1],value:m[2]??m[1]}));
    const wmSource=sys.files['/System/window-manager.nos']?.content||'';
    const desktopSource=sys.files['/System/desktop-shell.nos']?.content||'';
    const fileSource=sys.files['/System/file-manager.nos']?.content||'';
    const chartSource=sys.files['/System/chart-workbench.nos']?.content||'';
    const playerSource=sys.files['/System/scene-player.nos']?.content||'';
    const projectionSource=sys.files['/System/projection-service.nos']?.content||'';
    sys.scheduler=scheduler; sys.messageRule=messageRule; sys.fileRule=fileRule; sys.customSyscalls=customSyscalls;
    sys.windowRule=/STACK\s+fixed/i.test(wmSource)?'fixed':'focused-last';
    const allowedApps=new Set(Object.keys(appCatalog));const declaredApps=(desktopSource.match(/^APPS\s+(.+)$/mi)?.[1]||'player charts files editor tasks help').trim().split(/\s+/).filter(app=>allowedApps.has(app)&&app!=='system'&&app!=='projection');
    sys.desktopApps=declaredApps.length?declaredApps:['player','charts','files','editor','tasks','help'];
    sys.fileSort=/name-desc/i.test(fileSource)?'name-desc':'name-asc';
    sys.chartScale=Number(chartSource.match(/scale\s*=\s*([\d.]+)/i)?.[1])||1;
    sys.projectionRule=/DISPLAY\s+copy/i.test(projectionSource)?'copy':'blocked';
    sys.projectionInput=/INPUT\s+message-queue/i.test(projectionSource)?'message-queue':'blocked';
    sys.playerRules={
      speed:Number(playerSource.match(/SPEED\s+scale\s*=\s*([\d.]+)/i)?.[1])||1,
      timelineCost:Number(playerSource.match(/TIMELINE\s+cost\s*=\s*([\d.]+)/i)?.[1])||12,
      sceneCost:Number(playerSource.match(/SCENE\s+cost\s*=\s*([\d.]+)/i)?.[1])||30,
      applicationCost:Number(playerSource.match(/APPLICATION\s+cost\s*=\s*([\d.]+)/i)?.[1])||6,
      rehearsalCost:Number(playerSource.match(/REHEARSAL\s+cost\s*=\s*([\d.]+)/i)?.[1])||150,
      frameStep:Number(playerSource.match(/FRAMESTEP\s+([\d.]+)/i)?.[1])||1/30
    };
    sys.kernelError=null; sys.state='running'; sys.ownPaused=false;
    sys.virtualTime=0; sys.processes=baseProcesses(false);
    for (const child of sys.children) sys.processes.push({ id:`carrier-${child}`, name:`${child} carrier`, role:'子系统承载', state:'ready', used:0, remaining:0, memory:24, quota:sys.level===0?480:Math.max(140,Math.floor(sys.grant*.58)), pc:0, childId:child, output:[] });
    this.desktops.get(id)?.hideKernelError();this.desktops.get(id)?.renderIcons();this.desktops.get(id)?.renderStart();
    for(const wid of sys.windows){const w=this.windows.get(wid);if(w?.playerState){w.playerState.playing=false;w.playerState.position=0;w.playerState.frameTime=0;w.playerView?.update(0);w.refresh?.();}if(w?.chartState){Object.assign(w.chartState,{connectionState:'disconnected',queue:[],version:0,data:null});w.refresh?.();}}
    for(const child of sys.children)this.restartSystem(child,true);
    if(!internal)this.notify('内核已重新载入', `${id} 子树已重启；根节点使用 ${scheduler} 调度、${messageRule} 消息规则，${customSyscalls.length} 个系统调用`, parent.id);
  }

  openKernel(parentId, childId) {
    return this.openWindow(parentId, 'editor', { title:`内核 · ${childId}`, allowMultiple:true, filePath:`/Systems/${childId}/kernel.nos` });
  }

  makeSnapshot(id) {
    const sys = this.systems.get(id); if (!sys?.parentId) return null;
    const parent = this.systems.get(sys.parentId);
    const snapshot = { version:1, createdAt:Date.now(), rootId:id, tree:this.serializeSubtree(id) };
    const path = `/Snapshots/${id}-${Math.round(sys.virtualTime*1000)}.snapshot`;
    const content=JSON.stringify(snapshot),used=Object.values(parent.files).reduce((sum,file)=>sum+(file.content?.length||0),0);if(used+content.length>parent.storageLimit*1024){this.notify('快照保存失败',`${parent.id} 存储配额不足`,parent.id);return null;}
    parent.files[path] = { type:'snapshot', content };
    const fsProcess=parent.processes.find(p=>p.id==='p-fs');if(fsProcess){const cost=Math.max(12,Math.ceil(content.length/128));fsProcess.used+=cost;fsProcess.remaining=0;fsProcess.state='ready';}
    sys.snapshots.push(path); parent.fileVersion++;
    this.notify('完整快照已保存', `${path} · ${Math.round(snapshot.tree.length)} 个系统节点`, parent.id);
    return path;
  }

  serializeSubtree(rootId) {
    const ids=[]; const walk=id=>{ const s=this.systems.get(id); if(!s)return; ids.push(id); s.children.forEach(walk); }; walk(rootId);
    return ids.map(id=>{ const s=this.systems.get(id); const apps=s.windows.map(wid=>this.windows.get(wid)).filter(Boolean).map(w=>({windowId:w.id,appId:w.appId,title:w.title,filePath:w.filePath,sourceWindowId:w.sourceWindowId,x:w.el.offsetLeft,y:w.el.offsetTop,width:w.el.offsetWidth,height:w.el.offsetHeight,zIndex:w.el.style.zIndex,minimized:w.minimized,maximized:w.maximized,focused:w.focused,restoreRect:this.copyState(w.restoreRect),playerState:w.playerState?this.copyState(w.playerState):null,chartState:w.chartState?this.copyState(w.chartState):null,messages:this.copyState(w.appMessages||[])})); return { originalId:id, parentId:s.parentId, state:{
      name:s.name, ownPaused:s.ownPaused, virtualTime:s.virtualTime, rate:s.rate, budget:s.budget, grant:s.grant,
      memoryLimit:s.memoryLimit, storageLimit:s.storageLimit, scheduler:s.scheduler, messageRule:s.messageRule, fileRule:s.fileRule,
      files:deepClone(s.files), processes:deepClone(s.processes.filter(p=>!p.childId)), settings:deepClone(s.settings), note:s.note,
      timer:deepClone(s.timer), stopwatch:deepClone(s.stopwatch), messages:deepClone(s.messages), schedulerCursor:s.schedulerCursor,
      fileVersion:s.fileVersion, windowRule:s.windowRule, fileSort:s.fileSort, chartScale:s.chartScale,
      playerRules:deepClone(s.playerRules), desktopApps:deepClone(s.desktopApps), projectionRule:s.projectionRule,
      projectionInput:s.projectionInput, customSyscalls:deepClone(s.customSyscalls||[])
    }, apps}; });
  }

  copyState(value) {
    return JSON.parse(JSON.stringify(value, (key, entry) => typeof entry === 'function' ? undefined : entry));
  }

  restoreSnapshot(parentId, path) {
    const parent=this.systems.get(parentId); if(!parent)return false;
    let snapshot; try{snapshot=JSON.parse(parent.files[path]?.content||'');}catch{return false;}
    if(snapshot.version!==1||!Array.isArray(snapshot.tree))return false;
    for(const node of snapshot.tree){
      const sys=this.systems.get(node.originalId);if(!sys)continue;
      const preserved={id:sys.id,parentId:sys.parentId,level:sys.level,children:sys.children,windows:sys.windows,snapshots:sys.snapshots};
      Object.assign(sys,deepClone(node.state),preserved,{state:node.state.ownPaused?'paused':'running'});
      for(const child of sys.children)if(!sys.processes.some(p=>p.childId===child))sys.processes.push({id:`carrier-${child}`,name:`${child} carrier`,role:'子系统承载',state:'ready',used:0,remaining:0,memory:24,quota:sys.level===0?480:Math.max(140,Math.floor(sys.grant*.58)),pc:0,childId:child,output:[]});
      for(const app of node.apps||[]){
        let w=this.windows.get(app.windowId);
        if(!w&&app.appId!=='system'&&app.appId!=='projection'){
          sys.processes=sys.processes.filter(p=>p.windowId!==app.windowId);
          w=this.openWindow(sys.id,app.appId,{id:app.windowId,title:app.title,filePath:app.filePath,allowMultiple:true,x:app.x,y:app.y,width:app.width,height:app.height});
        }
        if(!w)continue;
        Object.assign(w,{x:app.x,y:app.y,width:app.width,height:app.height,restoreRect:app.restoreRect||null,minimized:!!app.minimized,maximized:!!app.maximized,focused:!!app.focused});
        w.el.classList.toggle('minimized',w.minimized);w.el.classList.toggle('maximized',w.maximized);w.el.classList.toggle('focused',w.focused);
        w.el.style.left=w.maximized?'0':`${w.x}px`;w.el.style.top=w.maximized?'0':`${w.y}px`;w.el.style.width=w.maximized?'100%':`${w.width}px`;w.el.style.height=w.maximized?'100%':`${w.height}px`;w.el.style.zIndex=app.zIndex||w.el.style.zIndex;
        w.appMessages=deepClone(app.messages||[]);
        if(w.playerState&&app.playerState){Object.assign(w.playerState,deepClone(app.playerState));w.playerState.onChange=()=>w.refresh?.();w.playerView?.update(w.playerState.frameTime||0);}
        if(w.chartState&&app.chartState)Object.assign(w.chartState,deepClone(app.chartState),{connectionState:'restored-waiting'});
        w.onResize?.();w.refresh?.();
      }
      this.desktops.get(sys.id)?.refreshChrome();this.desktops.get(sys.id)?.refreshTaskbar();
    }
    this.notify('子树快照已恢复',`${snapshot.rootId} 从 ${path} 的同一逻辑时点续行`,parentId);return true;
  }

  forkSystem(id) {
    const original = this.systems.get(id); if (!original?.parentId) return;
    const serialized = this.serializeSubtree(id);
    const map = new Map();
    for (const node of serialized) {
      const newParent = node.originalId === id ? original.parentId : map.get(node.parentId);
      const created = this.createSystem(newParent, { name:`${node.state.name} · 分叉`, snapshotData:node.state });
      map.set(node.originalId, created.system.id);
      setTimeout(()=>{for(const app of node.apps||[]){const w=created.system.windows.map(wid=>this.windows.get(wid)).find(candidate=>candidate?.appId===app.appId);if(!w)continue;w.appMessages=app.messages||[];if(w.playerState&&app.playerState){Object.assign(w.playerState,app.playerState);w.playerState.onChange=()=>w.refresh?.();w.playerView?.update(w.playerState.frameTime||0);}}},180);
    }
    this.notify('子树分叉完成', `新实例 ${map.get(id)} 已获得独立身份与状态副本`, original.parentId);
  }

  notify(title, text, systemId='outer', toast=true) {
    const note = { id:`note-${Date.now()}-${Math.random()}`, title, text, systemId, time:new Date() };
    this.notifications.unshift(note); this.notifications.length=40;
    for (const desktop of this.desktops.values()) desktop.refreshNotifications();
    if (toast && !this.systems.get(systemId)?.settings.dnd) {
      const el=document.createElement('div'); el.className='toast'; el.innerHTML=`<b>${title}</b><small>${text}</small>`;
      $('#toast-stack').append(el); setTimeout(()=>el.remove(),3800);
    }
  }

  sendAppMessage(targetWindow, type, payload=null, from='local-input') {
    if(!targetWindow||targetWindow.closed)return false;
    const sys=this.systems.get(targetWindow.systemId);if(!sys)return false;
    const message={id:`msg-${Date.now()}-${Math.random()}`,from,to:targetWindow.id,type,payload:this.copyState(payload),sentAt:sys.virtualTime};
    targetWindow.appMessages||=[];targetWindow.appMessages.push(message);sys.messages.push(message);
    return true;
  }

  submitDisplay(sourceWindow) {
    const projectionId=this.projections.get(sourceWindow?.id),projection=this.windows.get(projectionId);if(!projection)return 0;
    const sys=this.systems.get(sourceWindow.systemId);if(!sys||sys.projectionRule!=='copy')return 0;
    const state=sourceWindow.appId==='player'?sourceWindow.playerState:sourceWindow.appId==='charts'?sourceWindow.chartState:null;if(!state)return 0;
    projection.acceptDisplay?.({kind:sourceWindow.appId,state:this.copyState(state),sourceTime:sys.virtualTime});
    const process=sys.processes.find(p=>p.id==='p-window');if(process){process.used+=2;process.state='running';}
    return 2;
  }

  compileAndRun(systemId, path, source) {
    const sys=this.systems.get(systemId); if(!sys)return null;
    const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
    if(!lines[0]?.startsWith('PROGRAM')) throw new Error('第 1 行必须是 PROGRAM 名称');
    if(path==='/System/compiler.nos'){
      const allowed=lines.find(line=>/^ALLOW\s+/i.test(line))?.split(/\s+/).slice(1).map(x=>x.toUpperCase());
      if(!allowed?.includes('PROGRAM')||!allowed.includes('HALT'))throw new Error('编译器必须允许 PROGRAM 与 HALT');
      sys.compilerOps=allowed;sys.files[path]={type:'program',content:source};sys.fileVersion++;
      const compiler={id:`user-${this.nextProcess++}`,name:'NEST编译器（已自举）',role:'编译器',state:'ended',used:lines.length,remaining:0,memory:5,quota:80,pc:lines.length,output:[`允许 ${allowed.length} 个操作码`],variables:{},instructions:lines,loopStack:[],mailbox:[]};sys.processes.push(compiler);this.notify('编译器已自举',`后续程序使用 ${allowed.length} 个允许操作码`,systemId);return compiler;
    }
    if(!sys.compilerOps){const compiler=sys.files['/System/compiler.nos']?.content||'';sys.compilerOps=compiler.match(/^ALLOW\s+(.+)$/mi)?.[1].trim().split(/\s+/).map(x=>x.toUpperCase())||['PROGRAM','SET','ADD','LOOP','FOREVER','END','PRINT','SEND','RECV','WAIT','WRITE','DISPLAY','CALL','HALT'];}
    const directives=['KERNEL','SCHEDULER','MESSAGE','FILES','SYSCALL','BOOT','SERVICE','STACK','HITTEST','FOCUS','SORT','OVERWRITE','DELETE','VALUES','TRANSITION','SUBSCRIBE'];
    const bad=lines.find(line=>{const op=line.split(/\s+/)[0].toUpperCase();return !sys.compilerOps.includes(op)&&!directives.includes(op);}); if(bad) throw new Error(`当前编译器拒绝指令：${bad}`);
    const required=4+source.length/512,used=sys.processes.reduce((sum,p)=>sum+(Number(p.memory)||0),0);if(used+required>sys.memoryLimit)throw new Error(`内存配额不足：需要 ${required.toFixed(1)} MB`);
    const p={ id:`user-${this.nextProcess++}`, name:lines[0].slice(7).trim()||path.split('/').pop(), role:'用户程序', state:'ready', used:0, remaining:Math.max(1,lines.length*8), memory:required, quota:80, pc:1, output:[], variables:{}, instructions:lines, loopStack:[], waitUntil:0, mailbox:[] };
    sys.processes.push(p); this.notify('程序已启动', `${p.name} · PID ${p.id}`,systemId); return p;
  }

  executeInstruction(sys,p) {
    if(p.state==='waiting') {
      if(p.waitUntil&&sys.virtualTime>=p.waitUntil){p.state='ready';p.waitUntil=0;} else if(p.waitMessage&&p.mailbox.length){const message=sys.messageRule==='lifo'?p.mailbox.pop():p.mailbox.shift();p.variables[p.waitMessage]=message.value;p.waitMessage=null;p.state='ready';} else return 0;
    }
    if(!['ready','running'].includes(p.state)||!p.instructions)return 0;
    p.state='running'; let line=p.instructions[p.pc]||'HALT'; const [op,...args]=line.split(/\s+/); const upper=op.toUpperCase();
    const value=(token)=>Number.isFinite(Number(token))?Number(token):(p.variables[token]??token);
    if(upper==='SET'){p.variables[args[0]]=value(args.slice(1).join(' '));p.pc++;}
    else if(upper==='ADD'){p.variables[args[0]]=(Number(p.variables[args[0]])||0)+(Number(value(args[1]))||0);p.pc++;}
    else if(upper==='PRINT'){p.output.unshift(String(value(args.join(' '))));if(p.output.length>20)p.output.length=20;p.pc++;}
    else if(upper==='WAIT'){p.waitUntil=sys.virtualTime+(Number(args[0])||0);p.state='waiting';p.pc++;}
    else if(upper==='RECV'){p.waitMessage=args[0]||'message';p.state='waiting';p.pc++;}
    else if(upper==='SEND'){const target=sys.processes.find(x=>x.name===args[0]||x.id===args[0]);if(target){target.mailbox||=[];target.mailbox.push({from:p.id,value:value(args.slice(1).join(' '))});p.output.unshift('发送成功');}else p.output.unshift('目标不存在');p.pc++;}
    else if(upper==='WRITE'){const path=args[0];if(sys.fileRule==='readonly')p.output.unshift('ERR_READONLY');else{sys.files[path]={type:'text',content:String(value(args.slice(1).join(' ')))};sys.fileVersion++;}p.pc++;}
    else if(upper==='DISPLAY'){p.output.unshift(`显示提交：${args.join(' ')}`);p.pc++;}
    else if(upper==='CALL'){const call=sys.customSyscalls?.find(x=>x.name===args[0]);if(call){p.variables[args[1]||'result']=call.value;p.output.unshift(`${args[0]} → ${call.value}`);}else p.output.unshift(`ERR_NOSYSCALL:${args[0]}`);p.pc++;}
    else if(upper==='LOOP'){p.loopStack.push({start:p.pc+1,left:Number(args[0])||0});p.pc++;}
    else if(upper==='FOREVER'){p.loopStack.push({start:p.pc+1,left:Infinity});p.pc++;}
    else if(upper==='END'){const loop=p.loopStack.at(-1);if(loop&&(loop.left===Infinity||--loop.left>0))p.pc=loop.start;else{p.loopStack.pop();p.pc++;}}
    else {p.state='ended';p.remaining=0;}
    if(p.pc>=p.instructions.length){p.state='ended';p.remaining=0;}
    else p.remaining=Math.max(0,p.instructions.length-p.pc);
    p.used++; return 1;
  }

  startLoop() {
    setInterval(() => this.tick(), 33);
    setInterval(() => this.persist(), 2000);
    setInterval(() => {
      for (const desktop of this.desktops.values()) desktop.refreshTime();
      for (const w of this.windows.values()) w.refresh?.();
    }, 500);
  }

  tick() {
    const now=performance.now(); const dt=Math.min(.1,(now-this.lastWallTick)/1000); this.lastWallTick=now; this.tickNumber++;
    const root=this.systems.get('outer'); if(root) this.advanceSystem(root,dt,false,root.budget);
    for(const view of this.playerViews) view.sync?.();
  }

  advanceSystem(sys,dt,forced=false,incoming=Infinity) {
    if((sys.ownPaused&&!forced)||sys.state!=='running')return 0;
    const budget=Math.max(0,Math.floor(Math.min(sys.budget,incoming,sys.parentId?sys.grant:sys.budget)));
    sys.actualGrant=budget; sys.virtualTime+=dt*sys.rate; sys.workUsed=0;
    if(sys.timer.running){sys.timer.remaining=Math.max(0,sys.timer.remaining-dt*sys.rate);if(sys.timer.remaining===0&&!sys.timer.completed){sys.timer.completed=true;sys.timer.running=false;this.notify('倒计时结束',`${sys.name} 的倒计时已完成`,sys.id);}}
    if(sys.stopwatch.running)sys.stopwatch.elapsed+=dt*sys.rate;
    let remaining=budget;
    const kernelCost=Math.min(remaining,10+sys.processes.length);remaining-=kernelCost;sys.workUsed+=kernelCost;const kp=sys.processes.find(p=>p.id==='p-kernel');if(kp){kp.used+=kernelCost;kp.state='running';}
    const runnable=sys.processes.filter(p=>p.instructions&&!p.childId&&!p.external&&!['suspended','ended','error'].includes(p.state));
    if(sys.scheduler==='priority')runnable.sort((a,b)=>(b.quota||0)-(a.quota||0));
    const quantum=sys.scheduler==='priority'?8:4;
    let guard=0, ordinaryPool=Math.max(8,Math.floor(remaining*.75));
    while(ordinaryPool>0&&remaining>0&&runnable.length&&guard++<budget*2){const p=runnable[sys.schedulerCursor%runnable.length];sys.schedulerCursor=(sys.schedulerCursor+1)%Math.max(1,runnable.length);const allowance=Math.min(quantum,p.quota||quantum,remaining,ordinaryPool);let used=0;if(p.instructions){for(let i=0;i<allowance;i++){const n=this.executeInstruction(sys,p);if(!n)break;used+=n;}}else{used=Math.min(allowance,p.state==='waiting'?1:allowance);p.used+=used;p.state=p.state==='waiting'?'waiting':'ready';}remaining-=used;ordinaryPool-=used;sys.workUsed+=used;if(used===0&&runnable.every(x=>x.state==='waiting'))break;}
    const children=sys.children.map(id=>this.systems.get(id)).filter(Boolean);
    for(const child of children){if(remaining<=0)break;const carrier=sys.processes.find(p=>p.childId===child.id);const cap=Math.min(remaining,carrier?.quota||child.grant);const used=this.advanceSystem(child,dt,false,cap);remaining-=used;sys.workUsed+=used;if(carrier){carrier.used+=used;carrier.remaining=Math.max(0,child.processes.reduce((n,p)=>n+(p.remaining||0),0));carrier.state=this.isEffectivelyPaused(child.id)?'waiting':'ready';}}
    for(const wid of sys.windows){const w=this.windows.get(wid);while(w?.appMessages?.length&&remaining>=4){const message=w.appMessages.shift();sys.messages=sys.messages.filter(m=>m.id!==message.id);w.handleAppMessage?.(message);this.submitDisplay(w);remaining-=4;sys.workUsed+=4;const wm=sys.processes.find(p=>p.id==='p-window'),appProc=sys.processes.find(p=>p.windowId===w.id&&!p.external);if(wm){wm.used+=2;wm.state='ready';}if(appProc){appProc.used+=2;appProc.state='ready';}}}
    for(const connection of this.chartConnections)if(connection.systemId===sys.id&&remaining>0){const used=connection.tick?.(remaining)||0;remaining=Math.max(0,remaining-used);sys.workUsed+=used;}
    for(const wId of sys.windows){const w=this.windows.get(wId);if(w?.appId==='player'&&w.playerState&&remaining>0){const used=w.advancePlayer?.(dt,remaining)||0;remaining=Math.max(0,remaining-used);sys.workUsed+=used;}}
    return budget-remaining;
  }

  inspect() {
    return {
      systems:[...this.systems.values()].map(s=>({id:s.id,parentId:s.parentId,name:s.name,state:this.isEffectivelyPaused(s.id)?'paused':s.state,virtualTime:s.virtualTime,budget:s.budget,actualGrant:s.actualGrant})),
      windows:[...this.windows.values()].filter(w=>!w.closed).map(w=>({id:w.id,systemId:w.systemId,appId:w.appId,title:w.title,state:w.minimized?'minimized':w.maximized?'maximized':'normal'})),
      browsers:[...this.windows.values()].filter(w=>w.appId==='browser').flatMap(w=>(w.browserTabs||[]).map(t=>({windowId:w.id,tabId:t.id,url:t.url,loadState:t.loadState}))),
      players:[...this.windows.values()].filter(w=>w.appId==='player'&&w.playerState).map(w=>({windowId:w.id,systemId:w.systemId,state:w.playerState.playing?'playing':'paused',position:w.playerState.position,duration:w.playerState.duration,rate:w.playerState.rate,scene:w.playerState.scene,frameTime:w.playerState.frameTime})),
      charts:[...this.windows.values()].filter(w=>w.appId==='charts'&&w.chartState).map(w=>({windowId:w.id,systemId:w.systemId,sourceTitle:w.chartState.sourceTitle,range:w.chartState.range,chartType:w.chartState.type,connectionState:w.chartState.connectionState})),
      projections:[...this.windows.values()].filter(w=>w.appId==='projection').map(w=>({windowId:w.id,systemId:w.systemId,sourceSystemId:this.windows.get(w.sourceWindowId)?.systemId,sourceWindowId:w.sourceWindowId,sourceAppId:this.windows.get(w.sourceWindowId)?.appId,state:w.minimized?'minimized':w.maximized?'maximized':'normal'}))
    };
  }
}

class Desktop {
  constructor(runtime, system, container, nested) {
    this.runtime=runtime;this.system=system;this.nested=nested;this.z=20;
    this.root=document.createElement('section');this.root.className=`os-desktop wall-${system.settings.wallpaper}`;this.root.dataset.testid='os-desktop';this.root.dataset.systemId=system.id;this.root.style.setProperty('--accent',system.settings.accent);this.root.style.setProperty('--ui-scale',system.settings.scale);
    this.root.innerHTML=`<div class="desktop-tint"></div><div class="desktop-icons"></div><div class="windows-layer"></div><div class="desktop-topbar"></div><div class="start-menu" data-testid="start-menu"></div><div class="popover notification-panel" data-testid="widget-notifications"></div><div class="taskbar"><button class="start-toggle" data-testid="start-toggle" aria-label="开始">N</button><button class="taskbar-pin" aria-label="文件管理器">F</button><button class="taskbar-pin" aria-label="${nested?'播放器':'浏览器'}">${nested?'24':'◎'}</button><div class="taskbar-sep"></div><div class="taskbar-apps"></div><div class="tray"><button class="tray-button" data-testid="widgets-toggle" aria-label="小组件">◷</button><button class="tray-button" data-testid="notifications-toggle" aria-label="通知">◉</button><div class="tray-clock"></div></div></div>`;
    container.append(this.root);
    this.icons=$('.desktop-icons',this.root);this.layer=$('.windows-layer',this.root);this.topbar=$('.desktop-topbar',this.root);this.start=$('.start-menu',this.root);this.taskapps=$('.taskbar-apps',this.root);this.notifs=$('.notification-panel',this.root);
    this.renderIcons();this.renderStart();this.bindChrome();this.refreshChrome();this.refreshTime();this.refreshNotifications();
    this.root.querySelectorAll('[data-testid]').forEach(node=>node.dataset.systemId=system.id);
    this.root.addEventListener('contextmenu',e=>{if(e.target===this.root||e.target.classList.contains('desktop-tint')){e.preventDefault();this.showContext(e.clientX,e.clientY);}});
  }

  apps(){return this.system.desktopApps|| (this.system.parentId?['player','charts','files','editor','tasks','help']:['files','spreadsheet','browser','widgets','editor','tasks','settings','help']);}
  renderIcons(){this.icons.replaceChildren();for(const appId of this.apps()){const meta=appCatalog[appId];const b=document.createElement('button');b.className='desktop-icon';b.dataset.testid='desktop-icon';b.dataset.appId=appId;b.dataset.systemId=this.system.id;b.innerHTML=`<span class="app-glyph">${GLYPHS[appId]||'·'}</span><span>${meta.title}</span>`;b.addEventListener('click',()=>{this.icons.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');});b.addEventListener('dblclick',()=>this.runtime.openWindow(this.system.id,appId));this.icons.append(b);}}
  renderStart(){const buttons=this.apps().map(appId=>`<button class="start-app" data-testid="launch-${appId}" data-app-id="${appId}"><span class="mini-glyph">${GLYPHS[appId]}</span><span>${appCatalog[appId].title}</span></button>`).join('');this.start.innerHTML=`<div class="start-head"><div class="avatar">${this.system.level}</div><div><b>${this.system.name}</b><small>${this.system.id} · 第 ${this.system.level+1} 层</small></div></div><input class="start-search" placeholder="查找应用、程序和文件" aria-label="搜索"><div class="start-grid">${buttons}</div><div class="start-footer"><span>NEST kernel / ${this.system.scheduler}</span><button class="tool-button start-new-system">新建子系统</button></div>`;this.start.querySelectorAll('[data-testid]').forEach(node=>node.dataset.systemId=this.system.id);this.start.querySelectorAll('[data-app-id]').forEach(b=>b.addEventListener('click',()=>{this.runtime.openWindow(this.system.id,b.dataset.appId);this.toggleStart(false);}));$('.start-new-system',this.start).addEventListener('click',()=>{this.runtime.createSystem(this.system.id);this.toggleStart(false);});}
  bindChrome(){const toggle=$('[data-testid="start-toggle"]',this.root);toggle.addEventListener('click',e=>{e.stopPropagation();this.toggleStart();});this.root.addEventListener('pointerdown',e=>{if(!this.start.contains(e.target)&&e.target!==toggle)this.toggleStart(false);if(!this.notifs.contains(e.target)&&!e.target.closest('[data-testid="notifications-toggle"]'))this.notifs.classList.remove('open');});$('.taskbar-pin:nth-of-type(2)',this.root)?.addEventListener('click',()=>this.runtime.openWindow(this.system.id,'files'));const pins=this.root.querySelectorAll('.taskbar-pin');pins[1]?.addEventListener('click',()=>this.runtime.openWindow(this.system.id,this.system.parentId?'player':'browser'));$('[data-testid="notifications-toggle"]',this.root).addEventListener('click',e=>{e.stopPropagation();this.notifs.classList.toggle('open');});$('[data-testid="widgets-toggle"]',this.root).addEventListener('click',()=>this.runtime.openWindow(this.system.id,'widgets'));}
  toggleStart(force){this.start.classList.toggle('open',force??!this.start.classList.contains('open'));}
  refreshChrome(){const paused=this.runtime.isEffectivelyPaused(this.system.id);this.root.className=`os-desktop wall-${this.system.settings.wallpaper}${paused?' is-paused':''}`;this.root.style.setProperty('--accent',this.system.settings.accent);this.root.style.fontSize=`${14*this.system.settings.scale}px`;const children=this.system.children.map(id=>this.runtime.systems.get(id)).filter(Boolean);this.topbar.innerHTML=`<span class="system-mark ${paused?'paused':''}">${this.system.id} · ${paused?'已暂停':'运行中'} · T+${this.system.virtualTime.toFixed(1)}</span><button class="sys-chip" data-testid="system-new" aria-label="新建子系统">＋ 子系统</button><div class="sys-children">${children.map(c=>`<div class="child-pill"><span>${c.id}</span><button data-action="pause" data-testid="system-pause" data-target-system-id="${c.id}" title="暂停">Ⅱ</button><button data-action="resume" data-testid="system-resume" data-target-system-id="${c.id}" title="继续">▶</button><button data-action="step" data-target-system-id="${c.id}" title="单步">›</button><button data-action="rate" data-target-system-id="${c.id}" title="切换时间倍率">${c.rate}×</button><button data-action="snapshot" data-target-system-id="${c.id}" title="快照">◉</button><button data-action="fork" data-target-system-id="${c.id}" title="分叉">⑂</button><button data-action="kernel" data-testid="kernel-open" data-target-system-id="${c.id}" title="编辑内核">K</button><button data-action="restart" data-testid="system-restart" data-target-system-id="${c.id}" title="重启">↻</button><button data-action="close" data-target-system-id="${c.id}" title="关闭子树">×</button></div>`).join('')}</div>`;
    this.topbar.querySelectorAll('[data-testid],[data-action]').forEach(node=>node.dataset.systemId=this.system.id);$('[data-testid="system-new"]',this.topbar).addEventListener('click',()=>this.runtime.createSystem(this.system.id));this.topbar.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.targetSystemId;const actions={pause:()=>this.runtime.setPaused(id,true),resume:()=>this.runtime.setPaused(id,false),step:()=>this.runtime.singleStep(id),snapshot:()=>this.runtime.makeSnapshot(id),fork:()=>this.runtime.forkSystem(id),kernel:()=>this.runtime.openKernel(this.system.id,id),restart:()=>this.runtime.restartSystem(id),rate:()=>{const s=this.runtime.systems.get(id),rates=[.5,1,2,4];s.rate=rates[(rates.indexOf(s.rate)+1)%rates.length];b.textContent=`${s.rate}×`;this.runtime.notify('时间倍率已更改',`${id} = ${s.rate}×，逻辑预算不变`,this.system.id,false);},close:()=>{const w=[...this.runtime.windows.values()].find(w=>w.childId===id);if(w)this.runtime.closeWindow(w);}};actions[b.dataset.action]?.();}));}
  refreshTime(){const now=new Date();$('.tray-clock',this.root).innerHTML=`${now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}<br>${now.toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}`;const mark=$('.system-mark',this.topbar);if(mark)mark.textContent=`${this.system.id} · ${this.runtime.isEffectivelyPaused(this.system.id)?'已暂停':'运行中'} · T+${this.system.virtualTime.toFixed(1)}`;}
  refreshNotifications(){if(!this.notifs)return;const list=this.runtime.notifications.filter(n=>n.systemId===this.system.id||this.system.id==='outer').slice(0,8);this.notifs.innerHTML=`<div class="start-head"><div><b>通知中心</b><small>${list.length} 条近期事件</small></div><button class="tool-button dnd-toggle">${this.system.settings.dnd?'关闭免打扰':'免打扰'}</button></div>${list.length?list.map(n=>`<div class="notification-card"><b>${n.title}</b><small>${n.text} · ${n.time.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join(''):'<div class="empty-state"><strong>安静得很好</strong><span>暂无通知</span></div>'}`;$('.dnd-toggle',this.notifs)?.addEventListener('click',()=>{this.system.settings.dnd=!this.system.settings.dnd;this.refreshNotifications();});}
  showContext(x,y){document.querySelectorAll('.context-menu').forEach(m=>m.remove());const m=document.createElement('div');m.className='context-menu';m.style.left=`${x}px`;m.style.top=`${y}px`;m.innerHTML='<button data-a="new">新建子系统</button><button data-a="files">打开文件管理器</button><button data-a="refresh">刷新桌面</button><button data-a="settings">个性化</button>';m.addEventListener('click',e=>{const a=e.target.dataset.a;if(a==='new')this.runtime.createSystem(this.system.id);if(a==='files')this.runtime.openWindow(this.system.id,'files');if(a==='refresh')this.refreshChrome();if(a==='settings')this.runtime.openWindow(this.system.id,'settings');m.remove();});document.body.append(m);const dismiss=e=>{if(!m.contains(e.target))m.remove();document.removeEventListener('pointerdown',dismiss,true);};setTimeout(()=>document.addEventListener('pointerdown',dismiss,true));}
  addWindow(win){this.layer.append(win.el);}
  refreshTaskbar(){this.taskapps.replaceChildren();for(const id of this.system.windows){const w=this.runtime.windows.get(id);if(!w||w.closed)continue;const b=document.createElement('button');b.className=`taskbar-item ${w.minimized?'minimized':''} ${w.focused?'focused':''}`;b.dataset.testid='taskbar-item';b.dataset.windowId=w.id;b.dataset.systemId=this.system.id;b.innerHTML=`<span>${GLYPHS[w.appId]||'·'}</span><span>${w.title}</span>`;b.addEventListener('click',()=>{if(w.minimized)w.restore();else if(w.focused)w.minimize();else w.focus();});this.taskapps.append(b);}}
  showKernelError(message){let banner=$('[data-testid="kernel-error"]',this.root);if(!banner){banner=document.createElement('div');banner.dataset.testid='kernel-error';banner.className='kernel-error-banner';this.root.append(banner);}banner.textContent=message;}
  hideKernelError(){$('[data-testid="kernel-error"]',this.root)?.remove();}
}

class ManagedWindow {
  constructor(runtime,desktop,state){Object.assign(this,state);this.runtime=runtime;this.desktop=desktop;this.minimized=false;this.maximized=false;this.focused=false;this.closed=false;this.restoreRect=null;this.el=document.createElement('article');this.el.className='app-window';this.el.dataset.testid='app-window';this.el.dataset.systemId=this.systemId;this.el.dataset.windowId=this.id;this.el.dataset.appId=this.appId;if(this.sourceWindowId){const source=runtime.windows.get(this.sourceWindowId);this.el.dataset.sourceWindowId=this.sourceWindowId;this.el.dataset.sourceSystemId=source?.systemId||'';this.el.dataset.sourceAppId=source?.appId||'';}this.el.style.cssText=`left:${this.x}px;top:${this.y}px;width:${this.width}px;height:${this.height}px`;this.el.innerHTML=`<header class="window-titlebar" data-testid="window-titlebar"><span class="window-app-icon">${GLYPHS[this.appId]||'·'}</span><span class="window-title">${this.title}</span><span class="window-origin">${this.systemId}</span><div class="window-actions"><button class="window-action" data-testid="window-minimize" aria-label="最小化">—</button><button class="window-action" data-testid="window-maximize" aria-label="最大化">□</button><button class="window-action close" data-testid="window-close" aria-label="关闭">×</button></div></header><div class="window-content"></div><div class="window-resize" data-testid="window-resize"></div>`;this.el.querySelectorAll('[data-testid]').forEach(node=>{node.dataset.systemId=this.systemId;node.dataset.windowId=this.id;});this.content=$('.window-content',this.el);this.bindWindow();}
  bindWindow(){const title=$('[data-testid="window-titlebar"]',this.el);title.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;this.focus();if(this.maximized)return;const start={x:e.clientX,y:e.clientY,left:this.el.offsetLeft,top:this.el.offsetTop};title.setPointerCapture(e.pointerId);const move=ev=>{const bounds=this.desktop.layer.getBoundingClientRect();this.x=clamp(start.left+ev.clientX-start.x,-this.width+120,bounds.width-120);this.y=clamp(start.top+ev.clientY-start.y,0,bounds.height-40);this.el.style.left=`${this.x}px`;this.el.style.top=`${this.y}px`;};const up=ev=>{title.releasePointerCapture(ev.pointerId);title.removeEventListener('pointermove',move);title.removeEventListener('pointerup',up);const bounds=this.desktop.layer.getBoundingClientRect();if(ev.clientX-bounds.left<12)this.snap('left');else if(bounds.right-ev.clientX<12)this.snap('right');};title.addEventListener('pointermove',move);title.addEventListener('pointerup',up);});title.addEventListener('dblclick',e=>{if(!e.target.closest('button'))this.toggleMax();});$('[data-testid="window-minimize"]',this.el).addEventListener('click',()=>this.minimize());$('[data-testid="window-maximize"]',this.el).addEventListener('click',()=>this.toggleMax());$('[data-testid="window-close"]',this.el).addEventListener('click',()=>this.runtime.closeWindow(this));const resize=$('[data-testid="window-resize"]',this.el);resize.addEventListener('pointerdown',e=>{if(this.maximized)return;this.focus();const start={x:e.clientX,y:e.clientY,w:this.el.offsetWidth,h:this.el.offsetHeight};resize.setPointerCapture(e.pointerId);const move=ev=>{const b=this.desktop.layer.getBoundingClientRect();this.width=clamp(start.w+ev.clientX-start.x,this.minWidth,b.width-this.el.offsetLeft);this.height=clamp(start.h+ev.clientY-start.y,this.minHeight,b.height-this.el.offsetTop);this.el.style.width=`${this.width}px`;this.el.style.height=`${this.height}px`;this.onResize?.();};const up=ev=>{resize.releasePointerCapture(ev.pointerId);resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',up);};resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',up);});this.el.addEventListener('pointerdown',()=>this.focus());}
  setContent(){buildApp(this.runtime,this,this.content);if(this.appId!=='system')this.content.querySelectorAll('[data-testid]').forEach(el=>{el.dataset.systemId ||= this.systemId;el.dataset.windowId ||= this.id;});}
  focus(){for(const id of this.runtime.systems.get(this.systemId)?.windows||[]){const w=this.runtime.windows.get(id);if(w){w.focused=false;w.el.classList.remove('focused');}}this.focused=true;this.minimized=false;this.el.classList.remove('minimized');this.el.classList.add('focused');if(this.runtime.systems.get(this.systemId)?.windowRule!=='fixed')this.el.style.zIndex=String(++this.desktop.z);this.desktop.refreshTaskbar();this.onVisibility?.(true);}
  minimize(){this.minimized=true;this.focused=false;this.el.classList.add('minimized');this.el.classList.remove('focused');this.desktop.refreshTaskbar();this.onVisibility?.(false);}
  restore(){this.minimized=false;this.el.classList.remove('minimized');this.focus();this.onResize?.();}
  toggleMax(){if(this.maximized){this.maximized=false;this.el.classList.remove('maximized');Object.assign(this,this.restoreRect);this.el.style.cssText+=`;left:${this.x}px;top:${this.y}px;width:${this.width}px;height:${this.height}px`; }else{this.restoreRect={x:this.el.offsetLeft,y:this.el.offsetTop,width:this.el.offsetWidth,height:this.el.offsetHeight};this.maximized=true;this.el.classList.add('maximized');this.el.style.cssText+=';left:0;top:0;width:100%;height:100%';}this.onResize?.();}
  snap(side){if(!this.restoreRect)this.restoreRect={x:this.el.offsetLeft,y:this.el.offsetTop,width:this.el.offsetWidth,height:this.el.offsetHeight};this.maximized=false;this.el.classList.remove('maximized');this.el.style.top='0';this.el.style.height='100%';this.el.style.width='50%';this.el.style.left=side==='left'?'0':'50%';this.onResize?.();}
}

const runtime=new Runtime();
runtime.reset();
runtime.startLoop();

window.bench={
  version:1,
  ready:()=>runtime.readyPromise,
  reset:async()=>{runtime.reset(true);await new Promise(r=>setTimeout(r,120));return true;},
  inspect:async()=>runtime.inspect()
};
window.nestedRuntime=runtime;

setTimeout(()=>{runtime.resolveReady(true);$('#boot').classList.add('done');},700);

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.querySelectorAll('.context-menu').forEach(x=>x.remove());document.querySelectorAll('.start-menu.open,.popover.open').forEach(x=>x.classList.remove('open'));}
});

export { runtime, clamp, deepClone };
