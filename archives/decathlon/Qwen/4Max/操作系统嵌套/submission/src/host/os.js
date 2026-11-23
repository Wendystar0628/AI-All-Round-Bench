'use strict';
// OS 宿主编排：系统树、逐级拨付、快照/恢复/分叉、投送、数据连接路由、主循环
const fs = require('fs');
const path = require('path');
const { compile } = require('../lang/lang.js');
const { Instance, LOGICAL_DT } = require('./instance.js');
const { RootKernel } = require('./rootkernel.js');

const PROJ_ROOT = path.join(__dirname, '..', '..');

class OS {
  constructor(opts) {
    this.dataDir = opts.dataDir;
    this.device = opts.device;
    this.desktop = null;
    this.instances = new Map();
    this.instanceCounter = 0;
    this.projections = new Map();
    this.projCounter = 0;
    this.subscriptions = new Map();
    this.subCounter = 0;
    this.activeInstance = null;
    this.notifications = [];
    this.dnd = false;
    this.settings = Object.assign({
      systemName: 'Outer', wallpaper: 'landscape', accent: '#8b5cf6', scale: 1,
      accent2: '#f5b942'
    }, opts.settings || {});
    this.listeners = { notify: [], change: [], toast: [] };
    this.rootFS = {};
    this.compilerProgram = null;
    this.programSources = {};
    this.sceneAssets = {};
    this.tickTimer = null;
    this.dirty = true;
    this.sheetService = null;
    this.hostBridge = opts.hostBridge; // ipc 异步桥
    this.reqCounter = 1;
    this.bootAssets();
    this.initRootFS(opts.freshFS);
    this.root = new RootKernel(this);
    this.rootPaused = false;
  }

  // ---------- 资源 ----------
  bootAssets() {
    const pdir = path.join(PROJ_ROOT, 'src', 'programs');
    const read = p => fs.readFileSync(p, 'utf8');
    this.programSources = {
      '/System/kernel.os': read(path.join(pdir, 'kernel.os')),
      '/System/compiler.os': read(path.join(pdir, 'compiler.os')),
      '/System/wm.os': read(path.join(pdir, 'wm.os')),
      '/Apps/files.os': read(path.join(pdir, 'apps', 'files.os')),
      '/Apps/editor.os': read(path.join(pdir, 'apps', 'editor.os')),
      '/Apps/tasks.os': read(path.join(pdir, 'apps', 'tasks.os')),
      '/Apps/player.os': read(path.join(pdir, 'apps', 'player.os')),
      '/Apps/charts.os': read(path.join(pdir, 'apps', 'charts.os')),
      '/Programs/accumulate.os': read(path.join(pdir, 'samples', 'accumulate.os')),
      '/Programs/sender.os': read(path.join(pdir, 'samples', 'sender.os')),
      '/Programs/receiver.os': read(path.join(pdir, 'samples', 'receiver.os')),
      '/Programs/spin.os': read(path.join(pdir, 'samples', 'spin.os')),
      '/Controllers/flight-controller.os': read(path.join(pdir, 'flight', 'controller.os')),
      '/System/flight.os': read(path.join(pdir, 'flight', 'flight.os')),
      '/System/effects.os': read(path.join(pdir, 'flight', 'effects.os')),
      '/System/timeline.os': read(path.join(pdir, 'flight', 'timeline.os'))
    };
    const adir = path.join(PROJ_ROOT, 'assets');
    this.sceneAssets['/Demo/helicopter-24.scene'] = read(path.join(adir, 'helicopter-24.scene.json'));
    this.sceneAssets['/Demo/minimal.scene'] = read(path.join(adir, 'minimal.scene.json'));
    this.compilerProgram = compile(this.programSources['/System/compiler.os']);
    this.kernelProgram = compile(this.programSources['/System/kernel.os']);
  }

  defaultFiles() {
    const files = {};
    const put = (p, content) => { files[p] = { dir: false, content }; };
    const dir = p => { files[p] = { dir: true, content: '' }; };
    dir('/'); dir('/System'); dir('/Apps'); dir('/Programs'); dir('/Demo'); dir('/Documents'); dir('/Controllers'); dir('/Snapshots'); dir('/Records');
    for (const k of Object.keys(this.programSources)) put(k, this.programSources[k]);
    for (const k of Object.keys(this.sceneAssets)) put(k, this.sceneAssets[k]);
    put('/Documents/欢迎.txt', '欢迎使用 NestedOS 子系统。\n\n本系统的内核、窗口管理与应用都是 /System 与 /Apps 下的程序文件。\n修改程序并保存后，重启对应进程或系统即可按新规则运行。\n操作说明见根系统桌面“操作说明”。');
    return files;
  }

  initRootFS(fresh) {
    const saved = path.join(this.dataDir, 'rootfs.json');
    if (!fresh && fs.existsSync(saved)) {
      try { this.rootFS = JSON.parse(fs.readFileSync(saved, 'utf8')); return; } catch (e) { }
    }
    this.rootFS = this.defaultFiles();
    this.rootFS['/Demo/sample.sheet'] = { dir: false, content: JSON.stringify(this.sampleWorkbook()) };
    this.rootFS['/Documents/示例文档.txt'] = { dir: false, content: '这是根系统的示例文档。\n可以拖入子系统文件管理器，或保存到本机。' };
    this.rootFS['/Downloads'] = { dir: true, content: '' };
    this.rootFS['/回收站'] = { dir: true, content: '' };
    this.persistRootFS();
  }
  sampleWorkbook() {
    return {
      format: 'nestedos-sheet', version: 1, title: '示例工作簿',
      cells: {
        A1: { v: '项目' }, B1: { v: '数量' }, C1: { v: '单价' }, D1: { v: '小计' },
        A2: { v: '项目 A' }, B2: { v: 24 }, C2: { v: 6 }, D2: { f: '=B2*C2' },
        A3: { v: '项目 B' }, B3: { v: 12 }, C3: { v: 8 }, D3: { f: '=B3*C3' },
        A4: { v: '项目 C' }, B4: { v: 18 }, C4: { v: 4 }, D4: { f: '=B4*C4' }
      }
    };
  }
  persistRootFS() {
    try { fs.writeFileSync(path.join(this.dataDir, 'rootfs.json'), JSON.stringify(this.rootFS)); } catch (e) { }
  }
  persistSettings() {
    try { fs.writeFileSync(path.join(this.dataDir, 'settings.json'), JSON.stringify(this.settings)); } catch (e) { }
  }
  onRootFSChanged() { this.persistRootFS(); this.emit('change', { kind: 'fs' }); }
  rootStorageUsed() {
    let t = 0;
    for (const k of Object.keys(this.rootFS)) if (!this.rootFS[k].dir) t += this.rootFS[k].content.length;
    return t;
  }
  rootEnsureDir(p) {
    if (p === '/' || p === '') return;
    if (this.rootFS[p]) return;
    this.rootEnsureDir(this.parentPath(p));
    this.rootFS[p] = { dir: true, content: '' };
  }
  normPath(p) {
    const parts = String(p).split('/');
    const out = [];
    for (const x of parts) {
      if (x === '' || x === '.') continue;
      if (x === '..') out.pop(); else out.push(x);
    }
    return '/' + out.join('/');
  }
  parentPath(p) {
    const parts = String(p).split('/').filter(x => x !== '');
    parts.pop();
    return '/' + parts.join('/');
  }
  baseName(p) { const parts = String(p).split('/'); return parts[parts.length - 1]; }

  rootSystem() { return { id: 'outer', isRoot: true, os: this }; }

  // ---------- 系统树 ----------
  nextInstanceId() { this.instanceCounter++; return 'inner-' + this.instanceCounter; }
  parentOf(inst) {
    if (!inst.parentId || inst.parentId === 'outer') return this.root;
    return this.instances.get(inst.parentId) || null;
  }
  ancestorPaused(parentId) {
    if (!parentId || parentId === 'outer') return this.root.paused;
    const p = this.instances.get(parentId);
    if (!p) return false;
    if (p.paused || p.state !== 'running') return true;
    return this.ancestorPaused(p.parentId);
  }
  chainRunning(inst) {
    if (inst.state !== 'running') return false;
    return !this.ancestorPaused(inst.parentId);
  }

  createChild(parent, name, kernelProgram, overrides, hostPid) {
    const id = this.nextInstanceId();
    const isRootParent = parent === this.root || parent.isRoot;
    const parentId = isRootParent ? 'outer' : parent.id;
    const depth = isRootParent ? 2 : parent.depth + 1;
    let files, children = [];
    if (overrides && overrides.files) {
      files = overrides.files;
      children = overrides.children || [];
    } else {
      files = this.defaultFiles();
      // 子系统的内核源来自父系统文件系统中的当前版本
      const parentFS = isRootParent ? this.rootFS : parent.kernelVM.envs[0].vars.files;
      if (parentFS['/System/kernel.os']) files['/System/kernel.os'] = { dir: false, content: parentFS['/System/kernel.os'].content };
    }
    const inst = new Instance(this, {
      id, name: name || id, parentId, depth,
      kernelProgram: kernelProgram || this.kernelProgram,
      files, children,
      viewport: { w: 960, h: 620 }
    });
    this.instances.set(id, inst);
    this.emit('change', { kind: 'tree' });
    return inst;
  }

  createChildFromNode(parent, node, hostPid, nameOverride) {
    const isRootParent = parent === this.root || parent.isRoot;
    const parentId = isRootParent ? 'outer' : parent.id;
    const depth = isRootParent ? 2 : parent.depth + 1;
    const id = node.id && this.instances.has(node.id) ? this.nextInstanceId() : (node.id || this.nextInstanceId());
    const inst = new Instance(this, {
      id, name: nameOverride || node.name || id, parentId, depth,
      kernelProgram: node.kernelProgram,
      files: {}, children: [],
      restored: node,
      viewport: { w: 960, h: 620 }
    });
    this.instances.set(id, inst);
    this.emit('change', { kind: 'tree' });
    return inst;
  }

  async createSubsystem(parent, name) {
    // 经父系统内核编译当前内核源并创建承载进程
    if (parent === this.root || parent.isRoot) {
      return new Promise(resolve => {
        this.root.requestCompile(this.rootFS['/System/kernel.os'].content, { caller: 1, name: name || this.peekNextName(), tag: 'child', resolve });
      });
    }
    const r = await parent.mgmt('child_create', { name: name || this.peekNextName() });
    return r;
  }
  peekNextName() { return 'inner-' + (this.instanceCounter + 1); }
  onRootSpawnResult(info, result) {
    if (info.resolve) info.resolve(result);
    if (info.tag === 'kernel_compiled' && info.cb) info.cb(result);
  }

  compileKernelOf(parent, cb) {
    if (parent === this.root || parent.isRoot) {
      this.root.requestCompile(this.rootFS['/System/kernel.os'].content, { caller: 1, tag: 'kernel_compiled', cb });
    } else {
      parent.mgmt('compile_kernel', {}).then(r => cb(r));
    }
  }

  childCommand(parent, child, cmd, args) {
    const parentRunning = parent === this.root || parent.isRoot ? !this.root.paused : this.chainRunning(parent);
    switch (cmd) {
      case 'info':
        return { ok: true, state: child.state, clock: child.clock, speed: child.speed, work: child.totalWork, paused: child.paused, kernelWork: child.kernelWorkTotal, userWork: child.userWorkTotal, error: child.error, name: child.name, depth: child.depth };
      case 'pause': child.paused = true; this.emit('change', { kind: 'tree' }); return { ok: true };
      case 'resume': child.paused = false; this.emit('change', { kind: 'tree' }); return { ok: true };
      case 'speed': child.speed = Math.max(0.1, Math.min(8, args.value || 1)); this.emit('change', { kind: 'tree' }); return { ok: true };
      case 'step': {
        if (!parentRunning) return { ok: false, error: '父系统暂停时不能单步' };
        if (child.state !== 'running') return { ok: false, error: '系统未运行' };
        const cfg = child.cfgFromKernel();
        const w = child.step(cfg.budget, LOGICAL_DT);
        this.dirty = true;
        return { ok: true, work: w, clock: child.clock };
      }
      case 'shutdown': this.stopInstance(child); return { ok: true };
      case 'restart': this.restartInstance(child); return { ok: true };
      case 'snapshot': {
        const data = this.snapshotData(child);
        const json = JSON.stringify(data);
        this.chargeParent(parent, Math.ceil(json.length / 4));
        return { ok: true, data: json, size: json.length };
      }
      case 'restore': {
        try {
          const data = typeof args.data === 'string' ? JSON.parse(args.data) : args.data;
          this.restoreInstance(child, data);
          return { ok: true };
        } catch (e) { return { ok: false, error: '快照损坏: ' + (e.message || e) }; }
      }
      case 'fork': {
        const r = this.forkInstance(child, args.name);
        return r;
      }
      default: return { ok: false, error: '未知命令 ' + cmd };
    }
  }
  chargeParent(parent, n) {
    if (parent === this.root || parent.isRoot) this.root.charge(n);
    else parent.work += n;
  }

  stopInstance(inst) {
    this.endProjectionsOfSource(inst.id, null, '子系统已停止');
    this.dropSubscriptionsOf(inst.id);
    const parent = this.parentOf(inst);
    inst.stop();
    this.instances.delete(inst.id);
    if (parent && parent !== this.root && !parent.isRoot) {
      parent.kernelInbox.push({ type: 'child_event', event: { kind: 'stopped', id: inst.id } });
    }
    this.emit('change', { kind: 'tree' });
  }

  collectPreserved(inst) {
    const files = inst.kernelVM.envs[0].vars.files;
    const children = [];
    for (const [, child] of inst.childInstances) {
      if (child.state === 'stopped') continue;
      children.push(Object.assign({ name: child.name }, this.collectPreserved(child)));
    }
    return { files, children };
  }

  restartInstance(inst) {
    const preserved = this.collectPreserved(inst);
    const parent = this.parentOf(inst);
    this.endProjectionsOfSource(inst.id, null, '子系统重启中');
    this.dropSubscriptionsOf(inst.id);
    // 结束子树内原有进程
    for (const [, child] of inst.childInstances) child.stop();
    inst.childInstances.clear();
    inst.vms.clear();
    this.device.dropInstance(inst);
    this.compileKernelOf(parent, r => {
      if (!r.ok) {
        inst.state = 'kernelError'; inst.error = '内核编译失败: ' + r.error;
        this.onKernelError(inst, inst.error);
        return;
      }
      inst.kernelProgram = r.program;
      inst.bootFiles = preserved.files;
      inst.bootChildren = preserved.children;
      inst.clock = 0; inst.totalWork = 0; inst.kernelWorkTotal = 0; inst.userWorkTotal = 0;
      inst.state = 'running'; inst.error = null;
      inst.windows = []; inst.focusWindow = 0;
      inst.appStatus.clear();
      inst.boot(null);
      if (inst.surface) inst.surface.layout([]);
      this.emit('change', { kind: 'tree' });
    });
  }

  // ---------- 快照 ----------
  snapshotData(inst) {
    const node = inst.snapshotNode();
    const projs = [];
    for (const p of this.projections.values()) {
      if (this.inSubtree(p.sourceSystemId, inst.id)) projs.push(Object.assign({}, p));
    }
    return { version: 1, kind: 'nestedos-snapshot', node, projections: projs, savedAt: Date.now() };
  }
  inSubtree(id, rootId) {
    if (id === rootId) return true;
    const inst = this.instances.get(id);
    if (!inst) return false;
    return this.inSubtree(inst.parentId, rootId);
  }
  subtreeIds(rootId) {
    const out = [rootId];
    for (const inst of this.instances.values()) if (this.inSubtree(inst.parentId, rootId) && inst.id !== rootId) out.push(inst.id);
    return out;
  }

  restoreInstance(inst, data) {
    if (!data || data.kind !== 'nestedos-snapshot') throw new Error('不是有效的快照');
    const node = data.node;
    this.endProjectionsOfSource(inst.id, null, '快照恢复中');
    this.dropSubscriptionsOf(inst.id);
    for (const [, child] of inst.childInstances) child.stop();
    inst.childInstances.clear();
    inst.vms.clear();
    this.device.dropInstance(inst);
    inst.kernelProgram = node.kernelProgram;
    inst.name = node.name;
    inst.speed = node.speed; inst.paused = node.paused;
    inst.state = 'running'; inst.error = null;
    inst.totalWork = 0; inst.kernelWorkTotal = 0; inst.userWorkTotal = 0;
    inst.appStatus = new Map(node.appStatus || []);
    inst.boot(node);
    if (inst.surface) inst.surface.layout(inst.windows);
    // 范围内投送随快照恢复；范围外投送外框保持并继续对应同一源窗口
    for (const p of data.projections || []) {
      const bothInside = this.inSubtree(p.targetSystemId, inst.id);
      if (bothInside) this.recreateProjection(p);
      else {
        const srcWin = inst.windows.find(w => w.id === p.sourceWindowId);
        if (!srcWin) this.removeProjection(p.id, '源窗口已不存在');
      }
    }
    this.emit('change', { kind: 'tree' });
  }

  forkInstance(inst, newName) {
    const data = this.snapshotData(inst);
    const idMap = new Map();
    const remap = node => {
      const nid = this.nextInstanceId();
      idMap.set(node.id, nid);
      node.id = nid;
      for (const c of node.children || []) remap(c.node);
    };
    remap(data.node);
    if (newName) data.node.name = newName;
    for (const p of data.projections) {
      p.sourceSystemId = idMap.get(p.sourceSystemId) || p.sourceSystemId;
      if (idMap.has(p.targetSystemId)) p.targetSystemId = idMap.get(p.targetSystemId);
      p.id = null; // 重新创建
    }
    // 范围外的投送与数据连接仍属于原子树：这里只保留两端都在分叉内的投送
    data.projections = data.projections.filter(p => idMap.has(p.sourceSystemId) && idMap.has(p.targetSystemId));
    const parent = this.parentOf(inst);
    const adopt = () => {
      if (parent === this.root || parent.isRoot) {
        const hostPid = this.root.nextPid++;
        const child = this.createChildFromNode(this.root, data.node, hostPid, newName);
        const p = this.root.addProc(hostPid, child.name + ' 承载', '/System/kernel.os', 'child');
        p.childInst = child;
        for (const pr of data.projections) this.recreateProjection(pr);
        this.emit('change', { kind: 'tree' });
        return { ok: true, id: child.id };
      }
      parent.mgmt('adopt_child', { name: newName || data.node.name, node: data.node }).then(r => {
        if (r.ok) for (const pr of data.projections) this.recreateProjection(pr);
      });
      return { ok: true, pending: true };
    };
    return adopt();
  }

  importSnapshot(parent, data, name) {
    // 从本机导入的快照作为新子树启动
    if (!data || data.kind !== 'nestedos-snapshot') return { ok: false, error: '不是有效的快照文件' };
    const idMap = new Map();
    const remap = node => {
      const nid = this.nextInstanceId();
      idMap.set(node.id, nid);
      node.id = nid;
      for (const c of node.children || []) remap(c.node);
    };
    remap(data.node);
    if (name) data.node.name = name;
    for (const p of data.projections || []) {
      if (idMap.has(p.sourceSystemId)) p.sourceSystemId = idMap.get(p.sourceSystemId);
      if (idMap.has(p.targetSystemId)) p.targetSystemId = idMap.get(p.targetSystemId);
      p.id = null;
    }
    data.projections = (data.projections || []).filter(p => idMap.has(p.sourceSystemId) && idMap.has(p.targetSystemId));
    if (parent === this.root || parent.isRoot) {
      const hostPid = this.root.nextPid++;
      const child = this.createChildFromNode(this.root, data.node, hostPid, name);
      const p = this.root.addProc(hostPid, child.name + ' 承载', '/System/kernel.os', 'child');
      p.childInst = child;
      for (const pr of data.projections) this.recreateProjection(pr);
      return { ok: true, id: child.id };
    }
    parent.mgmt('adopt_child', { name: name || data.node.name, node: data.node }).then(r => {
      if (r.ok) for (const pr of data.projections) this.recreateProjection(pr);
    });
    return { ok: true, pending: true };
  }

  // ---------- 投送 ----------
  createProjection(sourceInst, sourcePid, sourceWindowId, targetSystemId, kind) {
    for (const p of this.projections.values()) {
      if (p.sourceSystemId === sourceInst.id && p.sourceWindowId === sourceWindowId) {
        this.focusProjection(p);
        return { ok: true, projectionId: p.id, existing: true };
      }
    }
    const target = targetSystemId === 'outer' ? null : this.instances.get(targetSystemId);
    if (targetSystemId !== 'outer' && (!target || target.state !== 'running')) return { ok: false, error: '目标系统不可用' };
    const id = 'proj-' + (++this.projCounter);
    const win = sourceInst.windows.find(w => w.id === sourceWindowId);
    const proj = {
      id, targetSystemId, sourceSystemId: sourceInst.id, sourcePid, sourceWindowId,
      sourceAppId: win ? win.appId : kind, kind, targetWindowId: null, title: win ? win.title : kind
    };
    this.projections.set(id, proj);
    if (!target) {
      const w = this.desktop.openProjectionWindow(proj);
      proj.targetWindowId = w.id;
    } else {
      target.kernelInbox.push({ type: 'mgmt', action: 'projection_open', args: { projId: id, sourceInfo: { systemId: sourceInst.id, systemName: sourceInst.name, appId: proj.sourceAppId, title: proj.title, kind } }, reqId: 0 });
      // WM 创建窗口后通过 sys_request 回报 targetWindowId
    }
    this.emit('change', { kind: 'projection' });
    return { ok: true, projectionId: id };
  }
  recreateProjection(p) {
    const id = 'proj-' + (++this.projCounter);
    const np = Object.assign({}, p, { id });
    this.projections.set(id, np);
    const target = np.targetSystemId === 'outer' ? null : this.instances.get(np.targetSystemId);
    if (!target) {
      const w = this.desktop.openProjectionWindow(np);
      np.targetWindowId = w.id;
    } else {
      target.kernelInbox.push({ type: 'mgmt', action: 'projection_open', args: { projId: id, sourceInfo: { systemId: np.sourceSystemId, systemName: (this.instances.get(np.sourceSystemId) || {}).name, appId: np.sourceAppId, title: np.title, kind: np.kind } }, reqId: 0 });
    }
  }
  focusProjection(p) {
    if (p.targetSystemId === 'outer') this.desktop.focusWindow(p.targetWindowId);
    else {
      const t = this.instances.get(p.targetSystemId);
      if (t) t.kernelInbox.push({ type: 'mgmt', action: 'projection_focus', args: { projId: p.id }, reqId: 0 });
    }
  }
  removeProjection(projId, reason) {
    const p = this.projections.get(projId);
    if (!p) return;
    this.projections.delete(projId);
    if (p.targetSystemId === 'outer') this.desktop.closeProjectionWindow(p, reason);
    else {
      const t = this.instances.get(p.targetSystemId);
      if (t && t.state === 'running') t.kernelInbox.push({ type: 'mgmt', action: 'projection_close', args: { projId, reason }, reqId: 0 });
    }
    this.emit('change', { kind: 'projection' });
  }
  endProjectionsOfSource(systemId, windowIdOrNull, reason) {
    for (const p of Array.from(this.projections.values())) {
      if (p.sourceSystemId === systemId && (windowIdOrNull == null || p.sourceWindowId === windowIdOrNull)) {
        this.removeProjection(p.id, reason);
      }
    }
  }
  projectionInput(projId, event) {
    const p = this.projections.get(projId);
    if (!p) return;
    const src = this.instances.get(p.sourceSystemId);
    if (!src || src.state !== 'running') return;
    src.kernelInbox.push({ type: 'proj_input', pid: p.sourcePid, event });
    this.dirty = true;
  }
  projectionPaused(projId) {
    const p = this.projections.get(projId);
    if (!p) return true;
    const src = this.instances.get(p.sourceSystemId);
    if (!src) return true;
    return src.effectivePaused() || src.state !== 'running';
  }

  // ---------- 数据连接 ----------
  dropSubscriptionsOf(instId) {
    for (const [id, s] of Array.from(this.subscriptions.entries())) {
      if (s.targetInstId === instId || this.inSubtree(s.targetInstId, instId)) {
        this.subscriptions.delete(id);
      }
    }
  }
  publishSheet(workbookId, extract) {
    for (const [id, s] of this.subscriptions.entries()) {
      if (s.workbookId !== workbookId) continue;
      const data = extract(s);
      if (!data) continue;
      s.version++;
      const payload = { subId: id, version: s.version, data };
      if (s.targetInstId === 'outer') {
        this.root.deliver(s.targetPid, { from: 0, type: 'data', payload });
      } else {
        const inst = this.instances.get(s.targetInstId);
        if (inst && inst.state === 'running') inst.kernelInbox.push(Object.assign({ type: 'data' }, payload));
      }
    }
    this.dirty = true;
  }
  closeWorkbookSubscriptions(workbookId) {
    for (const [id, s] of Array.from(this.subscriptions.entries())) {
      if (s.workbookId !== workbookId) continue;
      const payload = { subId: id, version: s.version, data: null, closed: true };
      if (s.targetInstId === 'outer') this.root.deliver(s.targetPid, { from: 0, type: 'data', payload });
      else {
        const inst = this.instances.get(s.targetInstId);
        if (inst && inst.state === 'running') inst.kernelInbox.push(Object.assign({ type: 'data' }, payload));
      }
      this.subscriptions.delete(id);
    }
  }

  // ---------- 请求路由 ----------
  routeRequest(inst, pid, service, args) {
    const isRoot = inst.isRoot;
    const instId = isRoot ? 'outer' : inst.id;
    switch (service) {
      case 'system.info':
        return isRoot ? { ok: true, id: 'outer', name: this.settings.systemName, depth: 1, parentId: null }
          : { ok: true, id: inst.id, name: inst.name, depth: inst.depth, parentId: inst.parentId };
      case 'ancestors': {
        const out = [];
        let cur = isRoot ? null : inst.parentId;
        while (cur) {
          if (cur === 'outer') { out.push({ id: 'outer', name: this.settings.systemName || 'Outer', depth: 1 }); break; }
          const p = this.instances.get(cur);
          if (!p) break;
          out.push({ id: p.id, name: p.name, depth: p.depth });
          cur = p.parentId;
        }
        return { ok: true, ancestors: out };
      }
      case 'sheet.list':
        return this.sheetService ? this.sheetService.list() : { ok: true, workbooks: [] };
      case 'sheet.subscribe': {
        if (!this.sheetService) return { ok: false, error: '表格服务不可用' };
        const r = this.sheetService.subscribe(args, { instId, pid });
        if (r.ok) {
          this.subCounter++;
          const subId = this.subCounter;
          this.subscriptions.set(subId, { workbookId: args.workbookId, range: args.range, labelCol: args.labelCol, seriesCols: args.seriesCols, targetInstId: instId, targetPid: pid, version: 1 });
          return { ok: true, subId, version: 1, data: r.data };
        }
        return r;
      }
      case 'sheet.unsubscribe': {
        this.subscriptions.delete(args.subId);
        return { ok: true };
      }
      case 'project': {
        if (isRoot) return { ok: false, error: '根系统应用不支持投送' };
        return this.createProjection(inst, pid, args.windowId, args.targetSystemId, args.kind);
      }
      case 'unproject': {
        for (const p of this.projections.values()) {
          if (p.sourceSystemId === instId && p.sourceWindowId === args.windowId) { this.removeProjection(p.id, '取消投送'); return { ok: true }; }
        }
        return { ok: true };
      }
      case 'projection_close': { this.removeProjection(args.projId, args.reason || '关闭投送'); return { ok: true }; }
      case 'projection_focus': { const p = this.projections.get(args.projId); if (p) this.focusProjection(p); return { ok: true }; }
      case 'projection_input': { this.projectionInput(args.projId, args.event); return { ok: true }; }
      case 'projection_ready': {
        const p = this.projections.get(args.projId);
        if (p) p.targetWindowId = args.windowId;
        return { ok: true };
      }
      case 'app.status': {
        if (!isRoot) inst.appStatus.set(args.windowId, args.status);
        return { ok: true };
      }
      case 'host.save': {
        const reqId = this.reqCounter++;
        this.hostBridge.saveFile(args).then(r => {
          if (isRoot) this.root.deliver(pid, { from: 0, type: 'host_reply', payload: { reqId, result: r } });
          else inst.kernelInbox.push({ type: 'req_reply', pid, reqId, result: r });
        });
        return { ok: true, pending: true, reqId };
      }
      case 'host.open': {
        const reqId = this.reqCounter++;
        this.hostBridge.openFile(args).then(r => {
          if (isRoot) this.root.deliver(pid, { from: 0, type: 'host_reply', payload: { reqId, result: r } });
          else inst.kernelInbox.push({ type: 'req_reply', pid, reqId, result: r });
        });
        return { ok: true, pending: true, reqId };
      }
      case 'notify': {
        this.notifyFrom(inst, args.title, args.body);
        return { ok: true };
      }
      default: return { ok: false, error: '未知服务: ' + service };
    }
  }

  // ---------- 通知 ----------
  on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); }
  emit(event, data) { for (const fn of this.listeners[event] || []) fn(data); }
  notifyFrom(inst, title, body) {
    const isRoot = inst.isRoot;
    const n = { id: Date.now() + Math.random(), title, body, systemId: isRoot ? 'outer' : inst.id, systemName: isRoot ? this.settings.systemName : inst.name, time: Date.now() };
    this.notifications.unshift(n);
    if (this.notifications.length > 200) this.notifications.pop();
    if (!this.dnd) this.emit('toast', n);
    this.emit('notify', n);
  }
  notifyRoot(title, body) { this.notifyFrom(this.rootSystem(), title, body); }
  onKernelError(inst, msg) {
    this.notifyFrom(inst, '内核错误', inst.name + ': ' + msg);
    if (inst.surface) inst.surface.showError(msg);
    this.emit('change', { kind: 'tree' });
  }

  // ---------- 焦点 ----------
  updateFocusChain(inst) {
    if (inst.focusWindow) {
      this.activeInstance = inst;
      if (this.desktop) this.desktop.onSubsystemFocus(inst);
    }
  }

  // ---------- 主循环 ----------
  start() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), Math.round(LOGICAL_DT * 1000));
  }
  tick() {
    try {
      if (!this.root.paused) this.root.step(LOGICAL_DT);
      this.device.renderAll();
      this.emit('tick', {});
    } catch (e) {
      console.error('tick error', e);
    }
  }
  requestStep(inst) { this.dirty = true; }

  // ---------- bench ----------
  inspect() {
    const systems = [{ id: 'outer', parentId: null, name: this.settings.systemName || 'Outer', state: this.root.paused ? 'paused' : 'running' }];
    for (const inst of this.instances.values()) {
      systems.push({ id: inst.id, parentId: inst.parentId, name: inst.name, state: inst.state === 'kernelError' ? 'kernel-error' : (inst.effectivePaused() ? 'paused' : inst.state) });
    }
    const windows = [];
    if (this.desktop) {
      for (const w of this.desktop.windowList()) windows.push(w);
    }
    for (const inst of this.instances.values()) {
      for (const w of inst.windows) {
        windows.push({ id: inst.id + ':' + w.id, systemId: inst.id, appId: w.appId, title: w.title, state: w.minimized ? 'minimized' : (inst.effectivePaused() ? 'paused' : 'normal') });
      }
    }
    for (const p of this.projections.values()) {
      windows.push({ id: p.targetSystemId + ':' + (p.targetWindowId || p.id), systemId: p.targetSystemId, appId: 'projection', title: '投送 · ' + p.title, state: 'normal', sourceSystemId: p.sourceSystemId, sourceWindowId: p.sourceWindowId });
    }
    const browsers = this.desktop ? this.desktop.browserTabs() : [];
    const players = [];
    const charts = [];
    for (const inst of this.instances.values()) {
      for (const [winId, st] of inst.appStatus.entries()) {
        if (st.kind === 'player') players.push(Object.assign({ windowId: inst.id + ':' + winId, systemId: inst.id }, st));
        if (st.kind === 'charts') charts.push(Object.assign({ windowId: inst.id + ':' + winId, systemId: inst.id }, st));
      }
    }
    const projections = [];
    for (const p of this.projections.values()) {
      projections.push({ windowId: p.targetSystemId + ':' + (p.targetWindowId || p.id), systemId: p.targetSystemId, sourceSystemId: p.sourceSystemId, sourceWindowId: p.sourceSystemId, sourceAppId: p.sourceAppId, state: this.projectionPaused(p.id) ? 'paused' : 'normal' });
    }
    return { systems, windows, browsers, players, charts, projections };
  }
}

module.exports = { OS, LOGICAL_DT };
