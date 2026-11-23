/* 根系统：子系统管理（新建/暂停/继续/单步/调速/重启/关闭/快照/恢复/分叉）
 * + 远程桌面窗口 + 跨层文件传递。 */
'use strict';
window.NOS = window.NOS || {};

class RootSysMgr {
  constructor() { this.remoteWins = new Map(); }
  open() {
    this.win = NOS.desktop.openWindow('sysmgr', '子系统管理', { w: 720, h: 520, model: this });
    this.render();
    this.timer = setInterval(() => { if (this.win && !this.win.min && document.body.contains(this.win.el)) this.render(true); }, 1000);
  }
  unmount() { clearInterval(this.timer); for (const [, h] of this.remoteWins) h.unmount && h.unmount(); }

  closeRemoteWindow(w) {
    const inst = NOS.rootVM.findInstance(w.model && w.model.childId);
    const rd = this.remoteWins.get(w.model.childId);
    if (rd) { rd.unmount(); this.remoteWins.delete(w.model.childId); }
    if (inst) inst.stopTree();
    NOS.desktop.closeWindow(w.id);
  }

  render(soft) {
    const c = this.win.contentEl;
    if (soft && !document.hidden) {
      const list = c.querySelector('.child-cards');
      if (list) { this.renderCards(list); return; }
    }
    c.innerHTML = '';
    c.classList.add('sysmgr-app');
    const bar = NOS.h('div', { class: 'tb' });
    const nameI = NOS.h('input', { class: 'input', placeholder: '名称（自动 inner-N）' });
    const newBtn = NOS.h('button', { class: 'btn primary', dataTestid: 'system-new' }, '新建直属子系统');
    newBtn.addEventListener('click', () => {
      const inst = NOS.rootVM.createRootChild({ name: nameI.value || undefined });
      NOS.rootVM.notify({ title: '子系统', body: `已创建 ${inst.id}（内核：/System/kernel.osl）` });
      if (inst.state === 'kernel-error') alert('内核错误: ' + inst.kernelError);
      this.openRemote(inst);
      this.render();
    });
    bar.append(nameI, newBtn);
    c.appendChild(bar);
    const cards = NOS.h('div', { class: 'child-cards' });
    c.appendChild(cards);
    this._cardsEl = cards;
    this.renderCards(cards);
  }

  renderCards(cards) {
    cards.innerHTML = '';
    const root = NOS.rootVM;
    const all = [];
    const walk = (ch, depth) => { all.push([ch, depth]); ch.children.forEach(g => walk(g, depth + 1)); };
    root.children.forEach(ch => walk(ch, 0));
    if (!all.length) cards.innerHTML = '<div class="empty">还没有子系统。创建后将在系统窗口中显示完整子桌面。</div>';
    all.forEach(([ch, depth]) => {
      const card = NOS.h('div', { class: 'child-card', dataTargetSystemId: ch.id });
      const head = NOS.h('div', { class: 'ch-head' });
      head.innerHTML = `<b>${'　'.repeat(depth)}${ch.id}</b> <span class="st st-${ch.state}">${ch.state}</span>
        <span class="muted">L${ch.depth} · ${ch.rate}x · t=${Math.round(ch.time)}ms</span>
        ${ch.kernelError ? '<span class="err" data-testid="kernel-error">' + ch.kernelError + '</span>' : ''}`;
      card.appendChild(head);
      const row = NOS.h('div', { class: 'ch-row' });
      const mkBtn = (label, fn, testid) => { const b = NOS.h('button', { class: 'btn small', dataTestid: testid || '', dataTargetSystemId: ch.id }, label); b.addEventListener('click', fn); return b; };
      row.append(
        mkBtn(ch.state === 'paused' ? '继续' : '暂停', () => ch.state === 'paused' ? ch.resumeTree() : ch.pauseTree(), ch.state === 'paused' ? 'system-resume' : 'system-pause'),
        mkBtn('单步(33.3ms)', () => ch.singleStep()),
        mkBtn('重启', () => this.restart(ch), 'system-restart'),
        mkBtn('打开桌面', () => this.openRemote(ch)),
        mkBtn('关闭', () => { if (confirm(`关闭 ${ch.id} 及其整棵子树？`)) { ch.closeTree(); this.render(); NOS.rootVM.unregisterInstance(ch.id); } }),
      );
      card.appendChild(row);
      const row2 = NOS.h('div', { class: 'ch-row' });
      const rate = NOS.h('input', { type: 'number', step: '0.25', value: ch.rate, class: 'input mini' });
      rate.addEventListener('change', () => ch.rate = Math.max(0, Math.min(8, Number(rate.value))));
      const grant = NOS.h('input', { type: 'number', value: ch._rootGrant || 42000, class: 'input mini', dataTestid: 'tasks-grant-input' });
      grant.addEventListener('change', () => ch._rootGrant = Number(grant.value));
      row2.append(NOS.h('label', {}, '速率 '), rate, NOS.h('label', {}, '拨付 '), grant,
        mkBtn('快照', () => this.snapshot(ch)),
        mkBtn('恢复', () => this.restore(ch)),
        mkBtn('分叉', () => this.fork(ch)),
        mkBtn('编辑内核', () => this.openKernel(ch), 'kernel-open'));
      card.appendChild(row2);
      cards.appendChild(card);
    });
  }

  openRemote(inst) {
    if (this.remoteWins.has(inst.id)) {
      const w = this.remoteWins.get(inst.id).win;
      NOS.desktop.restore(w.id);
      return;
    }
    const win = NOS.desktop.openWindow('remote', `${inst.name}（${inst.id}）系统窗口`, {
      w: 960, h: 620, forceNew: true, model: { childId: inst.id, beforeClose: () => false }
    });
    const handle = NOS.desktop.attachRemote(win.id, inst);
    handle.win = win;
    this.remoteWins.set(inst.id, handle);
  }

  restart(inst) {
    // 结束子树内原进程，重新从父系统 VFS 读取内核源文件启动；文件保留
    const wasPaused = inst.state === 'paused';
    // 关闭远程窗口句柄后重开
    const files = inst.vfs.serialize();
    inst.children = [];
    inst.procs = [];
    inst.kernelError = null;
    inst.vfs = NOS.VFS.deserialize(files, inst.store);
    inst.time = 0;
    inst.state = 'created';
    inst.start();
    NOS.rootVM.notify({ title: '子系统', body: `${inst.id} 已按当前内核源文件重启` });
  }

  snapshot(ch) {
    const path = `/Snapshots/${ch.id}-${Date.now()}.snap`;
    const r = NOS.hostsvcs['child-snapshot'](ch.parent || { vfs: NOS.rootVM.vfs, findChild: () => ch, saveSnapshot: ch.saveSnapshot.bind(ch) }, [ch.id, path]);
    // 根直属：直接保存到根 VFS
    if (!ch.parent) {
      try {
        NOS.rootVM.vfs.write(path, ch.saveSnapshot());
        NOS.rootVM.notify({ title: '快照', body: `已保存 ${path}（${NOS.formatSize((JSON.stringify(ch.serialize())).length)}）` });
      } catch (e) { alert(e.message); }
    }
    this.render();
  }
  restore(ch) {
    const path = prompt('快照路径', `/Snapshots/${ch.id}.snap`);
    if (!path) return;
    const text = NOS.rootVM.vfs.read(path);
    if (!text) return alert('快照不存在');
    const data = JSON.parse(text);
    const restored = NOS.Instance.restore(data, null, NOS.rootVM.vfs, NOS.blobStore, 1);
    restored.state = 'running';
    const idx = NOS.rootVM.children.findIndex(c => c.id === ch.id);
    if (idx >= 0) NOS.rootVM.children[idx] = restored;
    NOS.rootVM.registerInstance(restored);
    NOS.rootVM.notify({ title: '恢复', body: `${restored.id} 已从快照恢复` });
    this.openRemote(restored);
    this.render();
  }
  fork(ch) {
    const path = prompt('快照路径（从该快照分叉）', `/Snapshots/${ch.id}.snap`);
    if (!path) return;
    const text = NOS.rootVM.vfs.read(path);
    if (!text) return alert('快照不存在');
    const data = JSON.parse(text);
    const restored = NOS.Instance.restore(data, null, NOS.rootVM.vfs, NOS.blobStore, 1);
    restored.id = NOS.rootVM.allocChildId();
    restored.name = restored.id;
    restored.state = 'running';
    NOS.rootVM.children.push(restored);
    NOS.rootVM.registerInstance(restored);
    NOS.rootVM.notify({ title: '分叉', body: `已分叉出新子树 ${restored.id}` });
    this.openRemote(restored);
    this.render();
  }
  restoreFromFile(path) {
    this.open();
    this.restore({ id: 'imported' });
  }
  openKernel(ch) {
    // 内核源文件在父系统；根直属即 /System/kernel.osl
    NOS.rootApps.editor.openFile('/System/kernel.osl');
  }

  /* 跨层文件投放：data {kind:'file', sourceSystem, path, name} */
  transferFile(targetInst, data, domEvent) {
    const targetDir = targetInst.lastDropDir || '/Documents';
    if (!confirm(`把文件 ${data.name} 复制到 ${targetInst.id} 的 ${targetDir}？`)) return;
    try {
      // 找到源 VFS
      const srcVfs = data.sourceSystem === 'outer' ? NOS.rootVM.vfs : NOS.rootVM.findInstance(data.sourceSystem).vfs;
      const content = srcVfs.read(data.path);
      let dst = targetDir + '/' + data.name;
      if (targetInst.vfs.exists(dst)) {
        if (!confirm('目标已存在同名文件，覆盖？')) return;
      }
      targetInst.vfs.write(dst, content);
      NOS.rootVM.notify({ title: '跨层传文件', body: `${data.name} → ${targetInst.id}:${dst}` });
    } catch (e) {
      alert('传递失败: ' + e.message);
    }
  }
  receiveDrop(dir, e) {
    const data = NOS.dragPayload;
    // 根文件管理器接收：来自其他系统
    if (!data) return;
    if (data.sourceSystem === 'outer') return;
    const srcInst = NOS.rootVM.findInstance(data.sourceSystem);
    if (!srcInst) return;
    try {
      const content = srcInst.vfs.read(data.path);
      let dst = dir + '/' + data.name;
      if (NOS.rootVM.vfs.exists(dst)) { if (!confirm('覆盖同名文件？')) return; }
      NOS.rootVM.vfs.write(dst, content);
      NOS.rootVM.notify({ title: '跨层传文件', body: `${data.name} → 根:${dst}` });
      NOS.rootApps.files.render();
    } catch (er) { alert(er.message); }
  }
}
NOS.RootSysMgr = RootSysMgr;
