// 根系统文件系统、设置与持久化
(function () {
  const fs = window.require('fs');
  const path = window.require('path');

  const KINDS = {
    '.sheet': 'sheet', '.scene': 'scene', '.nsl': 'nsl', '.bin': 'bin', '.txt': 'text',
    '.md': 'text', '.json': 'text', '.snap': 'snap', '.rec': 'rec', '.csv': 'text', '.png': 'image'
  };
  function kindOf(name) {
    const i = name.lastIndexOf('.');
    if (i < 0) return 'text';
    return KINDS[name.slice(i).toLowerCase()] || 'text';
  }
  function dir(name) { return { t: 'dir', n: name, c: {} }; }
  function file(name, data, k) { return { t: 'file', n: name, d: data == null ? '' : String(data), k: k || kindOf(name), m: Date.now() }; }

  class FS {
    constructor(root) { this.root = root || dir(''); }
    // 路径解析
    parts(p) { return String(p || '').split('/').filter((x) => x.length > 0); }
    node(p) {
      const ps = this.parts(p);
      let cur = this.root;
      for (const s of ps) {
        if (!cur || cur.t !== 'dir') return null;
        cur = cur.c[s];
      }
      return cur || null;
    }
    parentOf(p) {
      const ps = this.parts(p);
      const name = ps.pop();
      let cur = this.root;
      for (const s of ps) {
        if (!cur || cur.t !== 'dir') return null;
        cur = cur.c[s];
      }
      return cur ? { dir: cur, name } : null;
    }
    exists(p) { return !!this.node(p); }
    isDir(p) { const n = this.node(p); return !!n && n.t === 'dir'; }
    list(p) {
      const n = this.node(p);
      if (!n || n.t !== 'dir') return [];
      return Object.values(n.c).sort((a, b) => {
        if (a.t !== b.t) return a.t === 'dir' ? -1 : 1;
        return a.n.localeCompare(b.n, 'zh-CN');
      });
    }
    read(p) {
      const n = this.node(p);
      if (!n) return null;
      return n.t === 'file' ? n.d : null;
    }
    stat(p) { return this.node(p); }
    write(p, data, k) {
      const pr = this.parentOf(p);
      if (!pr || pr.dir.t !== 'dir') return { ok: false, error: '目录不存在' };
      const ex = pr.dir.c[pr.name];
      if (ex && ex.t === 'dir') return { ok: false, error: '同名目录已存在' };
      if (ex) { ex.d = String(data == null ? '' : data); ex.m = Date.now(); if (k) ex.k = k; }
      else pr.dir.c[pr.name] = file(pr.name, data, k || kindOf(pr.name));
      return { ok: true };
    }
    mkdir(p) {
      const ps = this.parts(p);
      let cur = this.root;
      for (const s of ps) {
        if (cur.c[s]) { if (cur.c[s].t !== 'dir') return { ok: false, error: '同名文件已存在' }; cur = cur.c[s]; }
        else { const d = dir(s); cur.c[s] = d; cur = d; }
      }
      return { ok: true };
    }
    remove(p) {
      const pr = this.parentOf(p);
      if (!pr || !pr.dir.c[pr.name]) return { ok: false, error: '文件不存在' };
      const n = pr.dir.c[pr.name];
      delete pr.dir.c[pr.name];
      return { ok: true, node: n };
    }
    rename(p, name) {
      const pr = this.parentOf(p);
      if (!pr || !pr.dir.c[pr.name]) return { ok: false, error: '文件不存在' };
      if (pr.dir.c[name]) return { ok: false, error: '同名项已存在' };
      const n = pr.dir.c[pr.name];
      delete pr.dir.c[pr.name];
      n.n = name;
      pr.dir.c[name] = n;
      return { ok: true };
    }
    move(src, dstDir, newName) {
      const pr = this.parentOf(src);
      if (!pr || !pr.dir.c[pr.name]) return { ok: false, error: '源不存在' };
      const dd = this.node(dstDir);
      if (!dd || dd.t !== 'dir') return { ok: false, error: '目标目录不存在' };
      const nm = newName || pr.name;
      if (dd.c[nm]) return { ok: false, error: '目标已存在同名项', code: 'exists' };
      if (this.isAncestor(src, dstDir)) return { ok: false, error: '不能移动到自身内部' };
      const n = pr.dir.c[pr.name];
      delete pr.dir.c[pr.name];
      n.n = nm;
      dd.c[nm] = n;
      return { ok: true };
    }
    isAncestor(a, b) {
      const ap = this.parts(a), bp = this.parts(b);
      if (ap.length >= bp.length) return false;
      for (let i = 0; i < ap.length; i++) if (ap[i] !== bp[i]) return false;
      return true;
    }
    copy(src, dstDir, newName) {
      const n = this.node(src);
      if (!n) return { ok: false, error: '源不存在' };
      const dd = this.node(dstDir);
      if (!dd || dd.t !== 'dir') return { ok: false, error: '目标目录不存在' };
      let nm = newName || n.n;
      if (dd.c[nm]) return { ok: false, error: '目标已存在同名项', code: 'exists' };
      dd.c[nm] = JSON.parse(JSON.stringify(n));
      dd.c[nm].n = nm;
      return { ok: true, name: nm };
    }
    size(n) {
      n = n || this.root;
      if (n.t === 'file') return (n.d || '').length + 24;
      let s = 16;
      for (const k in n.c) s += this.size(n.c[k]);
      return s;
    }
    count() {
      let c = 0;
      const walk = (n) => { if (n.t === 'file') c++; else for (const k in n.c) walk(n.c[k]); };
      walk(this.root);
      return c;
    }
    serialize() { return JSON.parse(JSON.stringify(this.root)); }
  }

  // ---- 初始目录 -----------------------------------------------------------
  function makeRootFS() {
    const root = dir('');
    const add = (p, data, k) => {
      const ps = p.split('/').filter(Boolean);
      let cur = root;
      for (let i = 0; i < ps.length - 1; i++) {
        const s = ps[i];
        if (!cur.c[s]) cur.c[s] = dir(s);
        cur = cur.c[s];
      }
      const nm = ps[ps.length - 1];
      if (data === null) { if (!cur.c[nm]) cur.c[nm] = dir(nm); }
      else cur.c[nm] = file(nm, data, k);
    };
    add('/Documents', null);
    add('/Downloads', null);
    add('/Pictures', null);
    add('/Demo', null);
    add('/Systems', null);
    add('/Snapshots', null);
    add('/Recycle Bin', null);
    add('/Documents/欢迎使用.txt',
      '欢迎使用 Nested OS\n\n这是一台可以不断向内启动系统的桌面。\n\n· 双击桌面图标打开应用，右键查看菜单\n· 开始菜单可以启动全部应用\n· 打开「系统」应用可以创建第一层子系统\n· 子系统由它自己文件里的内核程序运行，可以在编辑器里改写\n\n更多内容见「帮助」应用。\n');
    add('/Documents/快捷键.txt',
      '常用快捷键\n\nCtrl+C / Ctrl+V     复制 / 粘贴\nCtrl+Z / Ctrl+Y     撤销 / 重做\nCtrl+S              保存\nF5                  刷新（浏览器）\nAlt+Left/Right      浏览器前进后退\nEsc                 关闭菜单\n');
    return new FS(root);
  }

  // ---- 设置 ---------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    systemName: 'outer',
    wallpaper: 'wallpaper-root.png',
    accent: '#f5b942',
    scale: 1.0,
    dnd: false,
    volume: 68,
    brightness: 100,
    wifi: true,
    bluetooth: false,
    nightLight: false,
    saveLocation: true
  };
  const ACCENTS = ['#f5b942', '#8b7cf6', '#4fd1c5', '#f2708a', '#5b9dff', '#7bd88f'];

  class Store {
    constructor() {
      this.dataDir = null;
      this.fs = null;
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
      this._saveT = null;
      this.onchange = [];
    }
    init(dataDir) {
      this.dataDir = dataDir;
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ }
      const load = (f, def) => {
        try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); }
        catch (e) { return def; }
      };
      const rf = load('rootfs.json', null);
      this.fs = rf ? new FS(rf) : makeRootFS();
      this.settings = Object.assign({}, DEFAULT_SETTINGS, load('settings.json', {}));
      this.installFixtures();
      this.save();
      return this;
    }
    installFixtures() {
      // 预置素材：示例工作簿、直升机场景、最小场景
      const root = (window.U && window.U.projectRoot) ? window.U.projectRoot() : process.cwd();
      const assets = path.join(root, 'assets', 'fixtures');
      const read = (f) => { try { return fs.readFileSync(path.join(assets, f), 'utf8'); } catch (e) { return null; } };
      const put = (p, data) => {
        if (data == null) return;
        if (!this.fs.exists(p)) this.fs.write(p, data);
      };
      put('/Demo/sample.sheet', read('sample.sheet'));
      put('/Demo/helicopter-24.scene', read('helicopter-24.scene'));
      put('/Demo/minimal.scene', read('minimal.scene'));
      if (!this.fs.exists('/Demo/示例工作簿.sheet') && this.fs.exists('/Demo/sample.sheet')) {
        this.fs.copy('/Demo/sample.sheet', '/Demo', '示例工作簿.sheet');
      }
    }
    set(k, v) { this.settings[k] = v; this.save(); this.emit(); }
    emit() { this.onchange.forEach((f) => { try { f(this.settings); } catch (e) { /* ignore */ } }); }
    save() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => this.flush(), 220);
    }
    flush() {
      if (!this.dataDir) return;
      try {
        fs.writeFileSync(path.join(this.dataDir, 'rootfs.json'), JSON.stringify(this.fs.serialize()));
        fs.writeFileSync(path.join(this.dataDir, 'settings.json'), JSON.stringify(this.settings, null, 2));
      } catch (e) { console.error('persist failed', e); }
    }
    resetAll() {
      try {
        for (const f of ['rootfs.json', 'settings.json']) { try { fs.unlinkSync(path.join(this.dataDir, f)); } catch (e) { /* ignore */ } }
        fs.rmSync(path.join(this.dataDir, 'systems'), { recursive: true, force: true });
        fs.rmSync(path.join(this.dataDir, 'snapshots'), { recursive: true, force: true });
      } catch (e) { /* ignore */ }
      this.fs = makeRootFS();
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
      this.installFixtures();
      this.save();
    }
  }

  window.Store = new Store();
  window.FS = FS;
  window.FSUtil = { dir, file, kindOf, ACCENTS, DEFAULT_SETTINGS, makeRootFS };
})();
