/*
 * 虚拟文件系统：每个系统实例一份，彼此独立。
 * 目录：/  /Documents  /Downloads  /RecycleBin  /Demo  /System
 */
(function (g) {
  const NOS = (g.NOS = g.NOS || {});

  function norm(path) {
    if (!path) return '/';
    let p = String(path).replace(/\\/g, '/');
    if (!p.startsWith('/')) p = '/' + p;
    const parts = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') { parts.pop(); continue; }
      parts.push(seg);
    }
    return '/' + parts.join('/');
  }
  function parentOf(path) {
    const p = norm(path);
    const i = p.lastIndexOf('/');
    if (i <= 0) return '/';
    return p.slice(0, i);
  }
  function baseName(path) {
    const p = norm(path);
    const i = p.lastIndexOf('/');
    return p.slice(i + 1);
  }

  class VFS {
    constructor() {
      this.nodes = new Map();
      this.nodes.set('/', { type: 'dir', children: new Set(), created: Date.now(), modified: Date.now() });
      this.deleted = []; // 回收站条目
    }
    _mkdirs(path) {
      const p = norm(path);
      if (p === '/') return true;
      const segs = p.split('/').filter(Boolean);
      let cur = '';
      for (const s of segs) {
        cur += '/' + s;
        let n = this.nodes.get(cur);
        if (!n) {
          n = { type: 'dir', children: new Set(), created: Date.now(), modified: Date.now() };
          this.nodes.set(cur, n);
          this.nodes.get(parentOf(cur)).children.add(cur);
        } else if (n.type !== 'dir') return false;
      }
      return true;
    }
    exists(path) { return this.nodes.has(norm(path)); }
    isDir(path) { const n = this.nodes.get(norm(path)); return !!n && n.type === 'dir'; }
    stat(path) {
      const n = this.nodes.get(norm(path));
      if (!n) return null;
      return {
        path: norm(path), name: baseName(path), type: n.type,
        size: n.type === 'file' ? (n.content || '').length : 0,
        created: n.created, modified: n.modified,
        children: n.type === 'dir' ? Array.from(n.children) : [],
      };
    }
    mkdir(path) {
      const p = norm(path);
      if (this.nodes.has(p)) return { ok: false, error: '目录已存在: ' + p };
      if (!this._mkdirs(parentOf(p))) return { ok: false, error: '父路径不存在' };
      this._mkdirs(p);
      return { ok: true };
    }
    write(path, content) {
      const p = norm(path);
      if (p === '/') return { ok: false, error: '非法路径' };
      const existing = this.nodes.get(p);
      if (existing && existing.type === 'dir') return { ok: false, error: '目标是目录' };
      if (!this._mkdirs(parentOf(p))) return { ok: false, error: '父路径不存在' };
      const n = { type: 'file', content: String(content || ''), created: existing ? existing.created : Date.now(), modified: Date.now() };
      this.nodes.set(p, n);
      if (!existing) this.nodes.get(parentOf(p)).children.add(p);
      return { ok: true };
    }
    read(path) {
      const n = this.nodes.get(norm(path));
      if (!n) return { ok: false, error: '文件不存在: ' + path };
      if (n.type === 'dir') return { ok: false, error: '目标是目录' };
      return { ok: true, content: n.content };
    }
    list(path) {
      const p = norm(path);
      const n = this.nodes.get(p);
      if (!n) return { ok: false, error: '目录不存在: ' + path };
      if (n.type !== 'dir') return { ok: false, error: '不是目录' };
      const out = [];
      for (const child of n.children) {
        const st = this.stat(child);
        if (st) out.push(st);
      }
      return { ok: true, entries: out };
    }
    remove(path, toBin) {
      const p = norm(path);
      if (p === '/') return { ok: false, error: '不能删除根目录' };
      const n = this.nodes.get(p);
      if (!n) return { ok: false, error: '不存在: ' + path };
      const parent = this.nodes.get(parentOf(p));
      if (parent) parent.children.delete(p);
      if (toBin) {
        this.deleted.push({ path: p, node: n, at: Date.now() });
        this.nodes.delete(p);
        return { ok: true, binned: true };
      }
      // 递归删除
      if (n.type === 'dir') {
        for (const c of Array.from(n.children)) this.remove(c, false);
      }
      this.nodes.delete(p);
      return { ok: true, binned: false };
    }
    restore(index) {
      const e = this.deleted[index];
      if (!e) return { ok: false, error: '回收站条目不存在' };
      this.nodes.set(e.path, e.node);
      const parent = this.nodes.get(parentOf(e.path));
      if (parent) parent.children.add(e.path);
      this.deleted.splice(index, 1);
      return { ok: true, path: e.path };
    }
    binList() {
      return this.deleted.map((e, i) => ({
        index: i, path: e.path, name: baseName(e.path),
        type: e.node.type, size: e.node.type === 'file' ? (e.node.content || '').length : 0, at: e.at,
      }));
    }
    copy(src, dst) {
      const s = norm(src), d = norm(dst);
      const n = this.nodes.get(s);
      if (!n) return { ok: false, error: '源不存在: ' + src };
      const target = this.nodes.get(d);
      if (target && target.type === 'dir') {
        return this.copy(s, d + '/' + baseName(s));
      }
      const clone = (node) => {
        const c = { type: node.type, created: Date.now(), modified: Date.now() };
        if (node.type === 'file') c.content = node.content;
        else { c.children = new Set(); for (const ch of node.children) { const cc = clone(this.nodes.get(ch)); this.nodes.set(ch.replace(/[^/]*$/, baseName(ch)), cc); } }
        return c;
      };
      const copyNode = (node, destPath) => {
        const c = { type: node.type, content: node.content, created: Date.now(), modified: Date.now() };
        if (node.type === 'dir') {
          c.children = new Set();
          for (const ch of node.children) {
            const cc = copyNode(this.nodes.get(ch), destPath + '/' + baseName(ch));
            this.nodes.set(destPath + '/' + baseName(ch), cc);
            c.children.add(destPath + '/' + baseName(ch));
          }
        }
        return c;
      };
      if (!this._mkdirs(parentOf(d))) return { ok: false, error: '目标父路径不存在' };
      const newNode = copyNode(n, d);
      this.nodes.set(d, newNode);
      const parent = this.nodes.get(parentOf(d));
      if (parent) parent.children.add(d);
      return { ok: true, path: d };
    }
    move(src, dst) {
      const r = this.copy(src, dst);
      if (!r.ok) return r;
      this.remove(src, false);
      return r;
    }
    rename(path, newName) {
      const p = norm(path);
      const n = this.nodes.get(p);
      if (!n) return { ok: false, error: '不存在: ' + path };
      return this.move(p, parentOf(p) + '/' + newName);
    }
    usage() {
      let bytes = 0, files = 0, dirs = 0;
      for (const [p, n] of this.nodes) {
        if (n.type === 'file') { bytes += (n.content || '').length; files++; }
        else if (p !== '/') dirs++;
      }
      return { bytes, files, dirs, bins: this.deleted.length };
    }
    dump() {
      const out = {};
      for (const [p, n] of this.nodes) {
        out[p] = n.type === 'file'
          ? { t: 'f', c: n.content }
          : { t: 'd', ch: Array.from(n.children) };
      }
      out['@bin'] = this.deleted.map((e) => ({ p: e.path, t: e.node.type, c: e.node.content || '' }));
      return out;
    }
    restoreDump(dump) {
      this.nodes = new Map();
      this.deleted = [];
      this.nodes.set('/', { type: 'dir', children: new Set(), created: Date.now(), modified: Date.now() });
      for (const p of Object.keys(dump)) {
        if (p === '@bin') continue;
        const e = dump[p];
        if (e.t === 'd') {
          this._mkdirs(p);
          const n = this.nodes.get(p);
          n.children = new Set(e.ch);
        }
      }
      for (const p of Object.keys(dump)) {
        if (p === '@bin') continue;
        const e = dump[p];
        if (e.t === 'f') {
          this._mkdirs(parentOf(p));
          this.nodes.set(p, { type: 'file', content: e.c, created: Date.now(), modified: Date.now() });
          const parent = this.nodes.get(parentOf(p));
          if (parent) parent.children.add(p);
        }
      }
      (dump['@bin'] || []).forEach((e) => {
        this.deleted.push({ path: e.p, node: e.t === 'f' ? { type: 'file', content: e.c } : { type: 'dir', children: new Set() }, at: Date.now() });
      });
    }
  }

  NOS.VFS = VFS;
  NOS.path = { norm, parentOf, baseName };
})(typeof globalThis !== 'undefined' ? globalThis : this);
