import fs from 'fs';
let s = fs.readFileSync('js/apps/files.js', 'utf8');
const a = `  handleFileDrop(e, targetDir) {
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
        let dst = kjoin(dir, kbasename(it.path));
        if (this.sys.fs.exists(dst)) {
          const old = dst;
          dst = kjoin(dir, \`\${kbasename(it.path)} (\${Date.now() % 10000})\`);
        }
        const r = this.os.copyFile(src, it.path, this.sys, dst);
        if (!r.ok) this.os.toast(this.sys, '复制失败', r.error, 'err');
      }
      this.refresh();
      return;
    }`;
const b = `  async handleFileDrop(e, targetDir) {
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
            text: \`\${dst} 已存在，是否覆盖？\`,
            actions: [{ id: 'overwrite', text: '覆盖', primary: true }, { id: 'cancel', text: '取消' }]
          });
          if (res !== 'overwrite') continue;
        }
        const r = this.os.copyFile(src, it.path, this.sys, dst);
        if (!r.ok) this.os.toast(this.sys, '复制失败', r.error, 'err');
      }
      this.refresh();
      return;
    }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('files replaced'); } else console.log('files miss');
fs.writeFileSync('js/apps/files.js', s);

let d = fs.readFileSync('js/shell.js', 'utf8');
const c = `          if (f) {
            const dst = normalizePath(joinPath('/Documents', basename(payload.path)));
            const finalDst = this.system.fs.exists(dst) ? joinPath('/Documents', \`\${basename(payload.path)} (\${Date.now() % 10000})\`) : dst;
            this.os.copyFile(srcSys, payload.path, this.system, finalDst);
          }`;
const e = `          if (f) {
            const dst = normalizePath(joinPath('/Documents', basename(payload.path)));
            this.os.dialog(this.system, {
              title: '目标已存在',
              text: dst + ' 已存在，是否覆盖？',
              actions: [{ id: 'overwrite', text: '覆盖', primary: true }, { id: 'cancel', text: '取消' }]
            }).then(res => {
              if (res === 'overwrite') this.os.copyFile(srcSys, payload.path, this.system, dst);
            });
          }`;
if (d.includes(c) && !d.includes("const finalDst")) {
  // replace only if no overwrite prompt already
  d = d.replace(c, e);
}
fs.writeFileSync('js/shell.js', d);
console.log('done');