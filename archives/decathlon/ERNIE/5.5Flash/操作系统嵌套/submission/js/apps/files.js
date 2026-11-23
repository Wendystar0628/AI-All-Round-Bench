// 文件管理器
import { h, clear, icon, iconSvg, fileIcon, fmtBytes } from '../util.js';
import { dirname as kdirname, basename as kbasename, joinPath as kjoin, normalizePath, extOf } from '../kernel.js';

const TYPE_NAMES = { sheet: '工作簿', scene: '三维场景', prog: '程序', kernel: '内核源文件', txt: '文本文档', md: 'Markdown', record: '飞行记录', snap: '系统快照', json: 'JSON', folder: '文件夹' };

export class FilesApp {
  constructor(win, os, state = {}) {
    this.win = win; this.os = os; this.sys = win.sys;
    this.path = state.path || (this.sys.isRoot ? '/Documents' : '/Documents');
    if (!this.sys.fs.isDir(this.path)) this.path = '/';
    this.selected = new Set();
    this.history = [this.path];
    this.hIndex = 0;
    this.clip = null;
    this.pendingDrop = null;
  }
  mount(body) {
    const root = h('div', { class: 'files-layout' });
    const side = h('div', { class: 'files-side' });
    const main = h('div', { class: 'files-main' });
    const tb = h('div', { class: 'toolbar' });
    const mk = (testid, ic, title, fn, cls = '') => {
      const b = h('button', { class: 'btn ' + cls, title, 'data-testid': testid });
      b.innerHTML = iconSvg(ic);
      b.addEventListener('click', fn);
      tb.append(b); return b;
    };
    mk('files-back', 'chevronLeft', '后退', () => this.go(-1));
    mk('files-forward', 'chevronRight', '前进', () => this.go(1));
    mk('files-up', 'chevronUp', '上一级', () => this.goUp());
    this.pathInput = h('input', { class: 'files-path', 'data-testid': 'files-path', value: this.path, spellcheck: 'false' });
    this.pathInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') this.navigate(this.pathInput.value);
      if (e.key === 'Escape') this.pathInput.value = this.path;
    });
    tb.append(this.pathInput);
    mk('files-new-folder', 'folder', '新建文件夹', () => this.newFolder());
    mk('files-new-file', 'fileText', '新建文本文件', () => this.newFile());
    mk('files-copy', 'copy', '复制', () => this.copySel());
    mk('files-paste', 'paste', '粘贴', () => this.paste());
    mk('files-delete', 'trash', '删除', () => this.deleteSel(), 'danger');
    mk('files-open', 'open', '打开', () => this.openSel(), 'primary');
    const exp = h('button', { class: 'btn ghost', title: '导出到本机' }, iconSvg('download'));
    exp.addEventListener('click', () => this.exportSel());
    tb.append(exp);
    const imp = h('button', { class: 'btn ghost', title: '从本机导入' }, iconSvg('upload'));
    const fi = h('input', { type: 'file', style: { display: 'none' } });
    imp.addEventListener('click', () => fi.click());
    fi.addEventListener('change', () => this.importFile(fi.files?.[0]));
    tb.append(imp, fi);
    main.append(tb);

    const listWrap = h('div', { style: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } });
    const head = h('div', { class: 'files-head' }, h('span', {}, '名称'), h('span', {}, '类型'), h('span', {}, '大小'));
    const list = h('div', { class: 'files-list', 'data-testid': 'files-list' });
    this.listEl = list;
    listWrap.append(head, list);
    const drop = h('div', { class: 'drop-banner hidden' }, '释放以复制到当前目录');
    this.dropEl = drop;
    listWrap.append(drop);
    main.append(listWrap);
    const status = h('div', { class: 'files-status', 'data-testid': 'files-status' });
    this.statusEl = status;
    main.append(status);

    this.sideEl = side;
    this.renderSide();
    root.append(side, main);
    body.append(root);
    list.addEventListener('pointerdown', e => {
      if (e.target === list) { this.selected.clear(); this.renderList(); }
    });
    list.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('application/x-nos-file') || e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        drop.classList.remove('hidden');
      }
    });
    list.addEventListener('dragleave', e => { if (e.target === list) drop.classList.add('hidden'); });
    list.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.add('hidden');
      this.handleDrop(e);
    });
    this.win.app = this;
    this.refresh();
  }

  renderSide() {
    if (!this.sideEl) return;
    clear(this.sideEl);
    this.sideEl.append(h('div', { class: 'side-title' }, '位置'));
    const navs = [
      ['此电脑', '/', 'monitor'], ['文档', '/Documents', 'fileText'], ['下载', '/Downloads', 'download'],
      ['回收站', '/Recycle Bin', 'trash'], ['系统', '/System', 'settings'], ['演示资源', '/Demo', 'film']
    ];
    for (const [name, path, ic] of navs) {
      const b = h('button', { class: 'fs-nav' + (this.path === path ? ' active' : ''), 'data-testid': 'files-nav', 'data-file-path': path });
      const i = h('span', { style: { display: 'flex' } }); i.innerHTML = iconSvg(ic);
      b.append(i, h('span', {}, name));
      const n = (this.sys.fs.list(path) || []).length;
      if (n) b.append(h('span', { class: 'cnt' }, String(n)));
      b.addEventListener('click', () => this.navigate(path));
      this.sideEl.append(b);
    }
    const bin = this.sys.fs.list('/Recycle Bin') || [];
    if (bin.length) {
      const b = h('button', { class: 'fs-nav', 'data-testid': 'files-nav', 'data-file-path': '/Recycle Bin' }, icon('trash', 15), h('span', {}, '回收站'), h('span', { class: 'cnt' }, String(bin.length)));
      b.addEventListener('click', () => this.navigate('/Recycle Bin'));
      this.sideEl.append(b);
    }
  }

  navigate(path) {
    path = normalizePath(path || '/');
    if (!this.sys.fs.isDir(path)) { this.os.toast(this.sys, '无法打开', `目录不存在：${path}`, 'err'); return; }
    this.path = path;
    this.selected.clear();
    this.history = this.history.slice(0, this.hIndex + 1);
    this.history.push(path);
    this.hIndex = this.history.length - 1;
    if (this.pathInput) this.pathInput.value = path;
    this.refresh();
  }
  go(d) {
    const i = this.hIndex + d;
    if (i < 0 || i >= this.history.length) return;
    this.hIndex = i; this.path = this.history[i]; this.selected.clear();
    if (this.pathInput) this.pathInput.value = this.path;
    this.refresh();
  }
  goUp() { if (this.path !== '/') this.navigate(kdirname(this.path) || '/'); }

  files() {
    const list = this.sys.fs.list(this.path) || [];
    const sort = this.sys.filesSort || 0;
    return list.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      if (sort === 1) return (extOf(a.path) || '').localeCompare(extOf(b.path) || '') || kbasename(a.path).localeCompare(kbasename(b.path), 'zh');
      if (sort === 2) return (b.modified || 0) - (a.modified || 0);
      return kbasename(a.path).localeCompare(kbasename(b.path), 'zh');
    });
  }

  refresh() {
    if (!this.listEl) return;
    this.renderSide();
    clear(this.listEl);
    const files = this.files();
    for (const f of files) {
      const row = h('div', {
        class: 'file-row' + (this.selected.has(f.path) ? ' selected' : ''),
        'data-testid': 'files-item', 'data-file-path': f.path, 'data-dir': f.dir ? '1' : '0',
        draggable: 'true'
      });
      const fi = fileIcon(f.path, f.dir);
      const ic = h('span', { class: 'fico' });
      if (f.path.startsWith('/Recycle Bin/')) {
        ic.innerHTML = iconSvg('trash');
        ic.firstChild.style.color = '#fca5a5';
      } else {
        ic.innerHTML = `<span style="display:flex;color:${fi.color}">${fi.svg.replace('<svg ', '<svg style="width:20px;height:20px" ')}</span>`;
      }
      row.append(
        h('div', { class: 'fr-name' }, ic, h('span', {}, kbasename(f.path))),
        h('div', { class: 'fr-type' }, f.dir ? '文件夹' : (TYPE_NAMES[extOf(f.path)] || extOf(f.path).toUpperCase() || '文件')),
        h('div', { class: 'fr-size' }, f.dir ? '' : fmtBytes(f.size))
      );
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
          if (this.selected.has(f.path)) this.selected.delete(f.path); else this.selected.add(f.path);
        } else if (e.shiftKey) {
          const arr = this.files().map(x => x.path);
          const last = [...this.selected].pop();
          if (last && arr.includes(last)) {
            const a = arr.indexOf(last), b = arr.indexOf(f.path);
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.selected.add(arr[i]);
          } else this.selected.add(f.path);
        } else {
          this.selected.clear(); this.selected.add(f.path);
        }
        this.renderList();
      });
      row.addEventListener('dblclick', () => this.open(f));
      row.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        this.selected.clear(); this.selected.add(f.path); this.renderList();
        this.contextMenu(e.clientX, e.clientY, f);
      });
      row.addEventListener('dragstart', e => {
        if (!this.selected.has(f.path)) { this.selected.clear(); this.selected.add(f.path); this.renderList(); }
        const files = [...this.selected].map(p => ({ systemId: this.sys.id, path: p }));
        e.dataTransfer.setData('application/x-nos-file', JSON.stringify(files.length === 1 ? files[0] : files));
        e.dataTransfer.effectAllowed = 'copy';
      });
      if (f.dir) {
        row.addEventListener('dragover', e => {
          if (e.dataTransfer.types.includes('application/x-nos-file')) { e.preventDefault(); row.style.outline = '2px dashed var(--accent)'; }
        });
        row.addEventListener('dragleave', () => row.style.outline = '');
        row.addEventListener('drop', e => {
          e.preventDefault(); e.stopPropagation(); row.style.outline = '';
          this.handleDrop(e, f.path);
        });
      }
      this.listEl.append(row);
    }
    if (!files.length) this.listEl.append(h('div', { class: 'empty' }, this.path === '/Recycle Bin' ? '回收站为空' : '此文件夹为空'));
    const sel = this.selected.size;
    this.statusEl.textContent = `${files.length} 个项目${sel ? ` · 已选择 ${sel} 个` : ''} · 存储 ${fmtBytes(this.sys.storageUsed)} / ${fmtBytes(this.sys.storageLimit)}`;
  }
  renderList() { this.refresh(); }

  open(f) {
    if (f.dir) this.navigate(f.path);
    else this.os.openFile(this.sys, f.path);
  }
  openSel() {
    if (!this.selected.size) { const f = this.files()[0]; if (f) this.open(f); return; }
    for (const p of this.selected) { const f = this.sys.fs.get(p); if (f) this.open(f); }
  }

  prompt(title, text, def) { return this.os.prompt(this.sys, title, text, def); }

  newFolder() {
    this.prompt('新建文件夹', '输入名称', '新建文件夹').then(name => {
      if (!name) return;
      const p = kjoin(this.path, name.trim());
      if (this.sys.fs.exists(p)) { this.os.toast(this.sys, '创建失败', '同名项目已存在', 'err'); return; }
      if (this.sys.fs.storageUsed() + 64 > this.sys.storageLimit) { this.os.toast(this.sys, '创建失败', '存储配额不足', 'err'); return; }
      this.sys.fs.mkdir(p);
      this.os.notify(this.sys, '文件夹已创建', p, 'ok', true);
      this.refresh();
    });
  }
  newFile() {
    this.prompt('新建文本文件', '输入文件名（.txt）', '新建文件.txt').then(name => {
      if (!name) return;
      const p = kjoin(this.path, name.trim());
      if (this.sys.fs.exists(p)) { this.os.toast(this.sys, '创建失败', '同名项目已存在', 'err'); return; }
      this.sys.fs.write(p, '', Date.now());
      this.os.notify(this.sys, '文件已创建', p, 'ok', true);
      this.refresh();
    });
  }
  copySel() {
    if (!this.selected.size) { this.os.toast(this.sys, '复制', '请先选择文件', 'warn'); return; }
    this.clip = { systemId: this.sys.id, paths: [...this.selected], cut: false };
    this.os.toast(this.sys, '已复制', `${this.selected.size} 个项目`, 'ok');
  }
  paste() {
    if (!this.clip) { this.os.toast(this.sys, '粘贴', '剪贴板为空', 'warn'); return; }
    const src = this.os.systems.get(this.clip.systemId);
    for (const p of this.clip.paths) {
      const name = kbasename(p);
      let dst = kjoin(this.path, name);
      let i = 1;
      const base = name;
      if (this.clip.cut && src === this.sys && kdirname(p) === this.path) continue;
      while (this.sys.fs.exists(dst) && dst !== p) { dst = kjoin(this.path, `${base} (${i++})`); }
      if (this.clip.cut && src === this.sys) {
        if (this.sys.fs.rename(p, dst)) this.os.notify(this.sys, '已移动', dst, 'ok', true);
      } else {
        const r = this.os.copyFile(src, p, this.sys, dst);
        if (!r.ok) this.os.toast(this.sys, '粘贴失败', r.error, 'err');
      }
    }
    if (this.clip.cut) this.clip = null;
    this.refresh();
  }
  deleteSel() {
    if (!this.selected.size) { this.os.toast(this.sys, '删除', '请先选择文件', 'warn'); return; }
    const bin = '/Recycle Bin';
    const n = this.selected.size;
    for (const p of this.selected) {
      if (p.startsWith(bin + '/')) {
        this.os.dialog(this.sys, { title: '永久删除', text: `确定永久删除 ${kbasename(p)}？`, actions: [{ id: 'ok', text: '删除', primary: true, danger: true }, { id: 'cancel', text: '取消' }] }).then(r => { if (r === 'ok') { this.sys.fs.remove(p); this.refresh(); } });
      } else this.os.deleteToRecycle(this.sys, p);
    }
    this.selected.clear();
    this.os.notify(this.sys, '文件操作', `已处理 ${n} 个项目`, 'info', true);
    this.refresh();
  }
  rename(f) {
    this.prompt('重命名', '新名称', kbasename(f.path)).then(name => {
      if (!name) return;
      const np = kjoin(kdirname(f.path), name.trim());
      if (this.sys.fs.exists(np)) { this.os.toast(this.sys, '重命名失败', '同名项目已存在', 'err'); return; }
      if (this.sys.fs.rename(f.path, np)) { this.os.notify(this.sys, '已重命名', np, 'ok', true); this.refresh(); }
    });
  }
  contextMenu(x, y, f) {
    const items = [];
    if (f.path.startsWith('/Recycle Bin/')) {
      items.push({ icon: 'restart', label: '恢复', act: () => { this.os.restoreFromRecycle(this.sys, f.path); this.refresh(); } });
      items.push({ sep: true });
      items.push({ icon: 'trash', label: '永久删除', danger: true, act: () => { this.sys.fs.remove(f.path); this.refresh(); } });
    } else {
      items.push({ icon: 'open', label: '打开', act: () => this.open(f) });
      if (!f.dir) {
        items.push({ icon: 'copy', label: '复制', act: () => { this.selected = new Set([f.path]); this.copySel(); } });
        items.push({ icon: 'cut', label: '剪切', act: () => { this.selected = new Set([f.path]); this.clip = { systemId: this.sys.id, paths: [f.path], cut: true }; } });
        items.push({ icon: 'text', label: '重命名', act: () => this.rename(f) });
      } else {
        items.push({ icon: 'copy', label: '复制', act: () => { this.selected = new Set([f.path]); this.copySel(); } });
      }
      items.push({ sep: true });
      items.push({ icon: 'trash', label: '删除', danger: true, act: () => { this.selected = new Set([f.path]); this.deleteSel(); } });
      if (extOf(f.path) === 'scene') items.push({ sep: true }, { icon: 'projection', label: '打开播放器', act: () => this.os.openApp(this.sys, 'player', { state: { path: f.path } }) });
    }
    const fake = { clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} };
    this.win.desktop.showContextMenu(x, y, items);
  }
  async handleDrop(e, targetDir) {
    const raw = e.dataTransfer.getData('application/x-nos-file');
    if (raw) {
      let payload;
      try { payload = JSON.parse(raw); } catch (err) { return; }
      const list = Array.isArray(payload) ? payload : [payload];
      for (const it of list) {
        const src = this.os.systems.get(it.systemId);
        if (!src) continue;
        const f = src.fs.get(it.path);
        if (!f) continue;
        const dir = targetDir || this.path;
        const dst = kjoin(dir, kbasename(it.path));
        if (this.sys.fs.exists(dst)) {
          const res = await this.os.dialog(this.sys, {
            title: '目标已存在',
            text: `${dst} 已存在，是否覆盖？`,
            actions: [{ id: 'overwrite', text: '覆盖', primary: true }, { id: 'cancel', text: '取消' }]
          });
          if (res !== 'overwrite') continue;
        }
        const r = this.os.copyFile(src, it.path, this.sys, dst);
        if (!r.ok) this.os.toast(this.sys, '复制失败', r.error, 'err');
      }
      this.refresh();
      return;
    }
    if (e.dataTransfer.files?.length) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        let dst = kjoin(this.path, file.name);
        let i = 1; while (this.sys.fs.exists(dst)) dst = kjoin(this.path, `${file.name} (${i++})`);
        this.sys.fs.write(dst, String(reader.result), Date.now());
        this.refresh();
      };
      reader.readAsText(file);
    }
  }
  exportSel() {
    if (this.selected.size !== 1) { this.os.toast(this.sys, '导出', '请选择一个文件', 'warn'); return; }
    const p = [...this.selected][0];
    const f = this.sys.fs.get(p);
    if (!f || f.dir) return;
    const blob = new Blob([f.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = kbasename(p); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    this.os.notify(this.sys, '已导出', kbasename(p), 'ok', true);
  }
  importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let dst = kjoin(this.path, file.name);
      let i = 1; while (this.sys.fs.exists(dst)) dst = kjoin(this.path, `${file.name} (${i++})`);
      if (this.sys.fs.storageUsed() + file.size > this.sys.storageLimit) { this.os.toast(this.sys, '导入失败', '存储配额不足', 'err'); return; }
      this.sys.fs.write(dst, String(reader.result), Date.now());
      this.sys.syncStorage();
      this.os.notify(this.sys, '已导入', dst, 'ok', true);
      this.refresh();
    };
    reader.readAsText(file);
  }
  serialize() { return { path: this.path, selected: [...this.selected] }; }
  restore(st) { if (st.path && this.sys.fs.isDir(st.path)) { this.path = st.path; this.refresh(); } }
  dispose() {}
}