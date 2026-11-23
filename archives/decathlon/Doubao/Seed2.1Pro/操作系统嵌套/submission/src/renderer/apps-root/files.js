/* 根系统文件管理器（宿主直接实现，状态属于根系统 VFS） */
'use strict';
window.NOS = window.NOS || {};

class RootFiles {
  constructor() {
    this.path = '/';
    this.selected = [];
    this.clipboard = null;
    this.multi = new Set();
  }
  open() {
    const d = NOS.desktop;
    this.win = d.openWindow('files', '文件管理器', { w: 860, h: 540, model: this });
    this.render();
  }
  openSelect(dir, file) {
    this.open();
    this.path = dir;
    this.pending = file;
    this.render();
  }
  newFolderFromDesktop() {
    this.open();
    this.path = '/Documents';
    this.render();
    this.vfs().mkdir('/Documents/新建文件夹');
    this.render();
  }
  vfs() { return NOS.rootVM.vfs; }
  unmount() {}

  render() {
    const c = this.win.contentEl;
    c.innerHTML = '';
    c.classList.add('files-app');
    const toolbar = NOS.h('div', { class: 'tb' });
    const mk = (label, part, testid) => {
      const b = NOS.h('button', { class: 'btn', dataTestid: testid || '' }, label);
      b.addEventListener('click', () => this.action(part));
      return b;
    };
    toolbar.append(
      mk('新建文件', 'new-file', 'files-new-file'),
      mk('新建文件夹', 'new-folder', 'files-new-folder'),
      mk('复制', 'copy', 'files-copy'),
      mk('粘贴', 'paste', 'files-paste'),
      mk('重命名', 'rename'),
      mk('删除', 'delete'),
      mk('导出到本机', 'export'),
      mk('从本机导入', 'import'),
    );
    const up = NOS.h('button', { class: 'btn', dataTestid: 'files-nav' }, '↑ 上级');
    up.addEventListener('click', () => { this.path = NOS.VFS.parent(this.path); this.render(); });
    toolbar.appendChild(up);

    const pathBar = NOS.h('div', { class: 'pathbar', dataTestid: 'files-path' });
    const parts = this.path.split('/').filter(Boolean);
    let acc = '';
    const root = NOS.h('button', { class: 'crumb', dataFilePath: '/', dataTestid: 'files-nav' }, '此电脑');
    root.addEventListener('click', () => { this.path = '/'; this.render(); });
    pathBar.appendChild(root);
    parts.forEach(p => {
      acc += '/' + p;
      const b = NOS.h('button', { class: 'crumb', dataFilePath: acc, dataTestid: 'files-nav' }, p);
      b.addEventListener('click', () => { this.path = acc; this.render(); });
      pathBar.append(' / ', b);
    });

    const main = NOS.h('div', { class: 'files-main' });
    const nav = NOS.h('div', { class: 'files-nav', dataTestid: 'files-list' });
    [['/Documents', '📄 文档'], ['/Downloads', '⬇ 下载'], ['/Demo', '✈ 示例'], ['/Programs', '{} 程序'], ['/Snapshots', '📦 快照'], ['/.trash', '🗑 回收站']].forEach(([p, l]) => {
      const b = NOS.h('button', { class: 'nav-item', dataFilePath: p, dataTestid: 'files-nav' }, l);
      b.addEventListener('click', () => { this.path = p; this.render(); });
      nav.appendChild(b);
    });
    const list = NOS.h('div', { class: 'files-list', dataTestid: 'files-list' });
    main.append(nav, list);

    if (this.path === '/.trash') this.renderTrash(list);
    else this.renderList(list);

    const status = NOS.h('div', { class: 'files-status' },
      `${this.selected.length} 项已选 · 存储 ${formatSize(this.vfs().used())} / ${formatSize(this.vfs().quota)}`);

    c.append(toolbar, pathBar, main, status);
    c._files = this;
  }

  renderList(list) {
    const items = this.vfs().list(this.path) || [];
    if (!items.length) list.innerHTML = '<div class="empty">空文件夹</div>';
    items.forEach(it => {
      const row = NOS.h('div', {
        class: 'file-row' + (this.multi.has(it.path) ? ' sel' : ''),
        dataFilePath: it.path, dataTestid: 'files-item', draggable: 'true'
      });
      row.innerHTML = `<span class="fr-icon">${it.dir ? '📂' : iconFor(it.name)}</span>
        <span class="fr-name">${it.name}</span><span class="fr-size">${it.dir ? '' : formatSize(it.size)}</span>`;
      row.addEventListener('click', (e) => {
        if (e.ctrlKey) this.multi.has(it.path) ? this.multi.delete(it.path) : this.multi.add(it.path);
        else { this.multi.clear(); this.multi.add(it.path); }
        this.selected = [...this.multi];
        this.render();
      });
      row.addEventListener('dblclick', () => this.openItem(it));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        new NOS.ContextMenu(document.getElementById('nos-pop-layer'), [
          { label: '打开', action: () => this.openItem(it) },
          { label: '复制', action: () => { this.clipboard = [it.path]; } },
          { label: '删除', action: () => { this.vfs().remove(it.path); NOS.rootVM.notify({ title: '文件操作', body: '已删除 ' + it.name }); this.render(); } }
        ]).show(e.clientX, e.clientY);
      });
      row.addEventListener('dragstart', () => {
        NOS.dragPayload = { kind: 'file', sourceSystem: 'outer', path: it.path, name: it.name, dir: it.dir };
      });
      list.appendChild(row);
    });
    // 放置（跨层传入）
    list.ondragover = (e) => { e.preventDefault(); list.classList.add('drop'); };
    list.ondragleave = () => list.classList.remove('drop');
    list.ondrop = (e) => { e.preventDefault(); list.classList.remove('drop'); NOS.rootApps.sysmgr.receiveDrop(this.path, e); };
  }

  renderTrash(list) {
    const trash = this.vfs().listTrash();
    if (!trash.length) list.innerHTML = '<div class="empty">回收站为空</div>';
    trash.forEach(t => {
      const row = NOS.h('div', { class: 'file-row' }, `🗑 ${t.path}`);
      const b = NOS.h('button', { class: 'btn small' }, '恢复');
      b.addEventListener('click', () => { try { this.vfs().restore(t.index); this.render(); } catch (e) { alert(e.message); } });
      const p = NOS.h('button', { class: 'btn small danger' }, '彻底删除');
      p.addEventListener('click', () => { this.vfs().purge(t.index); this.render(); });
      row.append(b, p);
      list.appendChild(row);
    });
  }

  openItem(it) {
    if (it.dir) { this.path = it.path; this.multi.clear(); this.render(); return; }
    const ext = NOS.VFS.ext(it.name);
    if (ext === 'sheet') NOS.rootApps.sheet.openFile(it.path);
    else if (ext === 'osl' || ext === 'txt') NOS.rootApps.editor.openFile(it.path);
    else if (ext === 'scene' || it.name.includes('场景')) {
      // 场景源文件主要用于跨层传递；提示
      NOS.rootVM.notify({ title: '场景资源', body: '场景在子系统播放器中打开；可拖入子系统文件管理器。' });
    } else if (ext === 'snap') NOS.rootApps.sysmgr.restoreFromFile(it.path);
    else NOS.rootApps.editor.openFile(it.path);
  }

  action(part) {
    const v = this.vfs();
    try {
      if (part === 'new-file') { const n = prompt('文件名', '新建文件.txt'); if (n) { v.write(this.path + '/' + n, ''); this.render(); } }
      if (part === 'new-folder') { const n = prompt('文件夹名', '新建文件夹'); if (n) { v.mkdir(this.path + '/' + n); this.render(); } }
      if (part === 'copy') this.clipboard = this.selected.slice();
      if (part === 'paste') {
        for (const src of this.clipboard || []) v.copy(src, this.path);
        this.render();
      }
      if (part === 'delete') {
        for (const p of this.selected) v.remove(p);
        NOS.rootVM.notify({ title: '文件操作', body: `已删除 ${this.selected.length} 项（可在回收站恢复）` });
        this.selected = []; this.multi.clear(); this.render();
      }
      if (part === 'rename') {
        if (this.selected[0]) { const n = prompt('新名称', NOS.VFS.baseName(this.selected[0])); if (n) { v.rename(this.selected[0], n); this.render(); } }
      }
      if (part === 'export') this.exportHost();
      if (part === 'import') this.importHost();
    } catch (e) { alert(e.message); }
  }

  async exportHost() {
    const p = this.selected[0];
    if (!p) return alert('请选择文件');
    const content = v_read(this.vfs(), p);
    const r = await window.NOS_HOST.exportFile(NOS.VFS.baseName(p), content, false);
    if (r.ok) NOS.rootVM.notify({ title: '导出', body: '已保存到本机' });
  }
  async importHost() {
    const r = await window.NOS_HOST.importFile();
    if (!r.ok) return;
    const buf = Buffer_from_b64(r.content);
    this.vfs().writeBlob(this.path + '/' + r.name, r.content);
    NOS.rootVM.notify({ title: '导入', body: '已导入 ' + r.name });
    this.render();
  }
}
function v_read(vfs, p) { const n = vfs.stat(p); return vfs.read(p); }
function Buffer_from_b64(b64) { return b64; }
function iconFor(n) {
  if (n.endsWith('.osl')) return '{}';
  if (n.endsWith('.scene')) return '✈';
  if (n.endsWith('.sheet')) return '▦';
  if (n.endsWith('.snap')) return '📦';
  return '📄';
}
function formatSize(n) {
  if (n > 1048576) return (n / 1048576).toFixed(1) + 'MB';
  if (n > 1024) return (n / 1024).toFixed(1) + 'KB';
  return n + 'B';
}
NOS.formatSize = formatSize;

NOS.RootFiles = RootFiles;
