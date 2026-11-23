/* VFS: 每个系统实例独立的虚拟文件系统，JSON 树持久化到 data-dir */
'use strict';
window.NOS = window.NOS || {};

class VFS {
  constructor(store, storageQuota) {
    this.store = store; // { readBlob(name)->string(base64)|null, writeBlob(name,b64), deleteBlob(name) }
    this.quota = storageQuota || 64 * 1024 * 1024;
    this.root = { dir: true, children: {} };
    this.trash = [];
    this.dirty = false;
  }

  serialize() {
    return { root: this.root, trash: this.trash, quota: this.quota };
  }

  static deserialize(data, store) {
    const v = new VFS(store, data.quota);
    v.root = data.root;
    v.trash = data.trash || [];
    return v;
  }

  static fresh(store, quota) { return new VFS(store, quota); }

  _node(path) {
    const parts = VFS.parts(path);
    let node = this.root;
    for (const p of parts) {
      if (!node.dir || !node.children[p]) return null;
      node = node.children[p];
    }
    return node;
  }

  static parts(path) {
    return path.split('/').filter(Boolean).map(p => decodeURIComponent(p));
  }

  static join(a, b) {
    return (a.endsWith('/') ? a.slice(0, -1) : a) + '/' + b;
  }

  static baseName(p) { const ps = p.split('/').filter(Boolean); return ps[ps.length - 1] || ''; }
  static parent(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
  static ext(p) { const b = VFS.baseName(p); const i = b.lastIndexOf('.'); return i >= 0 ? b.slice(i + 1).toLowerCase() : ''; }

  exists(p) { return !!this._node(p); }
  isDir(p) { const n = this._node(p); return !!(n && n.dir); }
  stat(p) {
    const n = this._node(p);
    if (!n) return null;
    if (n.dir) return { dir: true, size: 0, mtime: n.mtime || 0, path: p };
    return { dir: false, size: n.blob ? (n.blobSize || 0) : (n.content || '').length, mtime: n.mtime || 0, path: p };
  }

  list(p) {
    const n = this._node(p);
    if (!n || !n.dir) return null;
    const cp = p === '/' ? '' : p;
    return Object.keys(n.children).map(name => {
      const ch = n.children[name];
      return {
        name,
        path: cp + '/' + name,
        dir: !!ch.dir,
        size: ch.dir ? 0 : (ch.blob ? (ch.blobSize || 0) : (ch.content || '').length),
        mtime: ch.mtime || 0
      };
    }).sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'zh') : a.dir ? -1 : 1));
  }

  mkdir(path) {
    const parts = VFS.parts(path);
    let node = this.root;
    for (const p of parts) {
      if (!node.dir) throw new Error('ENOTDIR');
      if (!node.children[p]) { node.children[p] = { dir: true, children: {}, mtime: Date.now() }; this.dirty = true; }
      node = node.children[p];
    }
    return true;
  }

  ensureDir(path) { return this.mkdir(path); }

  _parent(path) {
    const parts = VFS.parts(path);
    if (!parts.length) throw new Error('EROOT');
    const name = parts.pop();
    let node = this.root;
    for (const p of parts) {
      if (!node.children[p] || !node.children[p].dir) throw new Error('ENOENT:' + p);
      node = node.children[p];
    }
    return { node, name };
  }

  used() {
    let total = 0;
    const walk = n => {
      if (n.dir) { for (const k in n.children) walk(n.children[k]); }
      else total += n.blob ? (n.blobSize || 0) : (n.content || '').length;
    };
    walk(this.root);
    return total;
  }

  write(path, content, opts) {
    const { node, name } = this._parent(path);
    const size = content == null ? 0 : content.length;
    const old = node.children[name];
    const oldSize = old && !old.dir ? (old.blob ? (old.blobSize || 0) : (old.content || '').length) : 0;
    if (this.used() - oldSize + size > this.quota) throw new Error('ENOSPC');
    node.children[name] = { content: content == null ? '' : String(content), mtime: Date.now(), ...(opts || {}) };
    this.dirty = true;
  }

  writeBlob(path, b64) {
    const { node, name } = this._parent(path);
    const size = Math.floor(b64.length * 3 / 4);
    const old = node.children[name];
    const oldSize = old && !old.dir ? (old.blobSize || 0) : 0;
    if (this.used() - oldSize + size > this.quota) throw new Error('ENOSPC');
    let blobName;
    if (old && old.blob) blobName = old.blob;
    else blobName = 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.store.writeBlob(blobName, b64);
    node.children[name] = { blob: blobName, blobSize: size, mtime: Date.now() };
    this.dirty = true;
  }

  read(path) {
    const n = this._node(path);
    if (!n || n.dir) return null;
    if (n.blob) return this.store.readBlob(n.blob);
    return n.content == null ? '' : n.content;
  }

  readText(path) { return this.read(path); }

  rename(path, newName) {
    const { node, name } = this._parent(path);
    if (!node.children[name]) throw new Error('ENOENT');
    if (node.children[newName]) throw new Error('EEXIST');
    node.children[newName] = node.children[name];
    delete node.children[name];
    this.dirty = true;
  }

  move(src, dstDir) {
    const dn = this._node(dstDir);
    if (!dn || !dn.dir) throw new Error('ENOTDIR');
    const name = VFS.baseName(src);
    const { node } = this._parent(src);
    if (dn.children[name]) throw new Error('EEXIST');
    dn.children[name] = node.children[name];
    delete node.children[name];
    this.dirty = true;
  }

  copy(src, dstDir, newName) {
    const dn = this._node(dstDir);
    const sn = this._node(src);
    if (!dn || !dn.dir || !sn) throw new Error('ENOENT');
    const name = newName || VFS.baseName(src);
    const clone = JSON.parse(JSON.stringify(sn));
    if (sn.blob) {
      const b64 = this.store.readBlob(sn.blob);
      const bn = 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      this.store.writeBlob(bn, b64);
      clone.blob = bn;
    }
    clone.mtime = Date.now();
    dn.children[name] = clone;
    this.dirty = true;
  }

  remove(path) {
    const { node, name } = this._parent(path);
    if (!node.children[name]) throw new Error('ENOENT');
    const item = node.children[name];
    this.trash.push({ path, item, time: Date.now(), origParent: VFS.parent(path) });
    delete node.children[name];
    this.dirty = true;
  }

  listTrash() { return this.trash.map((t, i) => ({ index: i, path: t.path, time: t.time, dir: !!t.item.dir, size: NOS.VFS.nodeSize(t.item) })); }

  static nodeSize(n) {
    if (n.dir) {
      let s = 0;
      for (const k in n.children) s += VFS.nodeSize(n.children[k]);
      return s;
    }
    return n.blob ? (n.blobSize || 0) : (n.content || '').length;
  }

  restore(index) {
    const t = this.trash[index];
    if (!t) return false;
    this.ensureDir(t.origParent);
    const pn = this._node(t.origParent);
    const name = VFS.baseName(t.path);
    if (pn.children[name]) throw new Error('EEXIST');
    pn.children[name] = t.item;
    this.trash.splice(index, 1);
    this.dirty = true;
    return true;
  }

  purge(index) {
    const t = this.trash[index];
    if (!t) return;
    const walk = n => {
      if (n.blob) { try { this.store.deleteBlob(n.blob); } catch (e) {} }
      if (n.dir) for (const k in n.children) walk(n.children[k]);
    };
    walk(t.item);
    this.trash.splice(index, 1);
    this.dirty = true;
  }

  importObject(obj) {
    /* 从纯对象导入目录树（用于预置 fixture） */
    for (const path in obj) {
      const content = obj[path];
      this.ensureDir(VFS.parent(path));
      if (typeof content === 'string' && content.startsWith('data:blob:')) {
        this.writeBlob(path, content.slice(10));
      } else {
        this.write(path, typeof content === 'string' ? content : JSON.stringify(content));
      }
    }
  }

  exportTree(path) {
    const n = this._node(path);
    if (!n) return null;
    if (!n.dir) {
      return { type: 'file', name: VFS.baseName(path), content: this.read(path), blob: !!n.blob };
    }
    const out = { type: 'dir', name: VFS.baseName(path) || 'root', children: [] };
    for (const e of this.list(path)) out.children.push(this.exportTree(e.path));
    return out;
  }

  importTree(node, dstDir, name) {
    const target = dstDir + '/' + name;
    if (node.type === 'dir') {
      this.ensureDir(target);
      (node.children || []).forEach(c => this.importTree(c, target, c.name));
    } else {
      this.ensureDir(dstDir);
      if (node.blob) this.writeBlob(target, node.content || '');
      else this.write(target, node.content || '');
    }
  }
}

NOS.VFS = VFS;
