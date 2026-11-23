// 虚拟文件系统：每个系统实例一份独立的目录树
export class VFS {
  constructor() { this.root = { t: 'd', c: {}, m: 0 }; }
  static norm(path) {
    if (typeof path !== 'string' || path === '') return '/';
    const parts = [];
    for (const seg of path.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { parts.pop(); continue; }
      parts.push(seg);
    }
    return '/' + parts.join('/');
  }
  node(path) {
    const p = VFS.norm(path);
    if (p === '/') return this.root;
    let cur = this.root;
    for (const seg of p.slice(1).split('/')) {
      if (!cur || cur.t !== 'd' || !cur.c[seg]) return null;
      cur = cur.c[seg];
    }
    return cur;
  }
  parentOf(path) {
    const p = VFS.norm(path);
    if (p === '/') return null;
    const idx = p.lastIndexOf('/');
    const dir = idx === 0 ? '/' : p.slice(0, idx);
    return { dir, name: p.slice(idx + 1), node: this.node(dir) };
  }
  exists(path) { return !!this.node(path); }
  isDir(path) { const n = this.node(path); return !!n && n.t === 'd'; }
  read(path) { const n = this.node(path); if (!n) return null; if (n.t !== 'f') return null; return n.c; }
  write(path, content) {
    const { dir, name, node: pnode } = this.parentOf(path);
    if (!pnode || pnode.t !== 'd') return '目录不存在: ' + VFS.norm(path);
    if (name === '') return '路径无效';
    const ex = pnode.c[name];
    if (ex && ex.t === 'd') return '目标是目录: ' + name;
    const s = String(content);
    pnode.c[name] = { t: 'f', c: s, m: Date.now() };
    return null;
  }
  mkdir(path) {
    const p = VFS.norm(path);
    if (p === '/') return null;
    let cur = this.root;
    for (const seg of p.slice(1).split('/')) {
      if (!cur.c[seg]) cur.c[seg] = { t: 'd', c: {}, m: Date.now() };
      cur = cur.c[seg];
      if (cur.t !== 'd') return '路径被文件占用: ' + seg;
    }
    return null;
  }
  remove(path) {
    const { dir, name, node: pnode } = this.parentOf(path);
    if (!pnode || pnode.t !== 'd') return '目录不存在';
    if (!pnode.c[name]) return '不存在: ' + VFS.norm(path);
    delete pnode.c[name];
    return null;
  }
  list(path) {
    const n = this.node(path);
    if (!n) return null;
    if (n.t !== 'd') return null;
    return Object.keys(n.c).map(k => ({ name: k, type: n.c[k].t === 'd' ? 'dir' : 'file', size: n.c[k].t === 'f' ? n.c[k].c.length : 0, mtime: n.c[k].m || 0 })).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, 'zh') : a.type === 'dir' ? -1 : 1);
  }
  move(src, dst) {
    const s = this.node(src); if (!s) return '不存在: ' + VFS.norm(src);
    const p1 = this.parentOf(src), p2 = this.parentOf(dst);
    if (!p2.node || p2.node.t !== 'd') return '目标目录不存在';
    if (p2.node.c[p2.name]) return '目标已存在: ' + VFS.norm(dst);
    p2.node.c[p2.name] = s; delete p1.node.c[p1.name];
    return null;
  }
  copy(src, dst) {
    const s = this.node(src); if (!s) return '不存在: ' + VFS.norm(src);
    const p2 = this.parentOf(dst);
    if (!p2.node || p2.node.t !== 'd') return '目标目录不存在';
    if (p2.node.c[p2.name]) return '目标已存在: ' + VFS.norm(dst);
    p2.node.c[p2.name] = JSON.parse(JSON.stringify(s));
    return null;
  }
  size() { let total = 0; const walk = n => { if (n.t === 'f') { total += n.c.length; return; } for (const k in n.c) walk(n.c[k]); }; walk(this.root); return total; }
  countFiles() { let c = 0; const walk = n => { if (n.t === 'f') { c++; return; } for (const k in n.c) walk(n.c[k]); }; walk(this.root); return c; }
  serialize() { return JSON.stringify({ root: this.root }); }
  load(json) { try { const o = typeof json === 'string' ? JSON.parse(json) : json; this.root = o.root || { t: 'd', c: {}, m: 0 }; } catch (e) { } }
  clone() { const v = new VFS(); v.root = JSON.parse(JSON.stringify(this.root)); return v; }
}

export function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}
