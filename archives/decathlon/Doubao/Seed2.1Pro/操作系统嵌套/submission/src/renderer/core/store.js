/* Blob 存储：大文件（壁纸、贴图等）独立存放在 data-dir/blobs */
'use strict';
window.NOS = window.NOS || {};

class BlobStore {
  constructor(dir, fs, path) {
    this.dir = dir;
    this.fs = fs;
    this.path = path;
    try { fs.mkdirSync(this.path.join(dir, 'blobs'), { recursive: true }); } catch (e) {}
    this.mem = new Map();
  }
  _f(name) { return this.path.join(this.dir, 'blobs', name.slice(0, 32).replace(/[^a-z0-9]/gi, '_') + '.b64'); }
  writeBlob(name, b64) {
    this.mem.set(name, b64);
    try { this.fs.writeFileSync(this._f(name), b64); } catch (e) {}
  }
  readBlob(name) {
    if (this.mem.has(name)) return this.mem.get(name);
    try {
      const s = this.fs.readFileSync(this._f(name), 'utf8');
      this.mem.set(name, s);
      return s;
    } catch (e) { return null; }
  }
  deleteBlob(name) {
    this.mem.delete(name);
    try { this.fs.unlinkSync(this._f(name)); } catch (e) {}
  }
}
NOS.BlobStore = BlobStore;
