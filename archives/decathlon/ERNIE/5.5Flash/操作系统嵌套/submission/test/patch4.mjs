import fs from 'fs';
const path = 'js/shell.js';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('  instantiateSnapshot(parent, snap, opts = {}) {');
const endMarker = '\n  allSystems(sys) {';
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) { console.log('markers missing', start, end); process.exit(1); }
const neu = `  instantiateSnapshot(parent, snap, opts = {}) {
    const idMap = new Map();
    const winIdMap = new Map();
    if (opts.fork) {
      for (const e of snap.systems) idMap.set(e.system.id, \`inner-\${this.nextSystemSeq++}\`);
    }
    const remapSys = id => idMap.get(id) || id;
    const rootEntry = snap.systems[0];
    const sysMap = new Map();
    const winMap = new Map();

    // 第一遍：重建系统与桌面
    const createSys = (entry, parentSys) => {
      const sd = JSON.parse(JSON.stringify(entry.system));
      const oldId = sd.id;
      const nid = remapSys(oldId);
      sd.id = nid;
      if (opts.fork) sd.name = nid;
      sd.parentId = parentSys ? parentSys.id : parent.id;
      const sys = System.fromJSON(this, sd, parentSys);
      if (!parentSys) {
        sys.parent = parent;
        sys.parentId = parent.id;
        sys.depth = parent.depth + 1;
        parent.children.push(sys);
      } else {
        sys.depth = parentSys.depth + 1;
        parentSys.children.push(sys);
      }
      this.systems.set(sys.id, sys);
      const d = new Desktop(this, sys, null);
      sys.desktop = d;
      this.desktops.set(sys.id, d);
      d.mounted = true;
      d.buildChrome();
      d.el.style.width = '100%';
      d.el.style.height = '100%';
      d.el.style.position = 'absolute';
      d.el.style.inset = '0';
      return sys;
    };
    const createTree = (entry, parentSys) => {
      const sys = createSys(entry, parentSys);
      const oldId = entry.system.id;
      for (const ch of snap.systems) {
        if (ch !== entry && ch.system.parentId === oldId) createTree(ch, sys);
      }
      return sys;
    };
    const rootSys = createTree(rootEntry, null);

    // 第二遍：重建窗口
    for (const e of snap.systems) {
      const sys = sysMap.get(e.system.id) || this.systems.get(remapSys(e.system.id));
      if (!sys) continue;
      for (const wd of e.windows || []) {
        let wid = wd.id;
        if (opts.fork || this.windows.has(wid)) wid = \`w\${this.nextWindowSeq++}\`;
        winIdMap.set(wd.id, wid);
      }
    }
    for (const e of snap.systems) {
      const nid = remapSys(e.system.id);
      const sys = this.systems.get(nid);
      if (!sys) continue;
      for (const wd of e.windows || []) {
        const wid = winIdMap.get(wd.id) || wd.id;
        const st = JSON.parse(JSON.stringify(wd.state || {}));
        if (st.systemId) st.systemId = remapSys(st.systemId);
        if (st.sourceSystemId) st.sourceSystemId = remapSys(st.sourceSystemId);
        if (st.sourceWindowId) st.sourceWindowId = winIdMap.get(st.sourceWindowId) || st.sourceWindowId;
        const win = this.createWindow(sys, {
          id: wid, appId: wd.appId, title: wd.title, x: wd.x, y: wd.y, width: wd.w, height: wd.h,
          state: st
        });
        if (win) {
          win.minimized = !!wd.minimized;
          win.maximized = !!wd.maximized;
          win.z = wd.z || win.z;
          if (win.minimized) win.el.classList.add('minimized');
          if (win.maximized) win.applyMaximized();
          if (win.app?.restore) { try { win.app.restore(st); } catch (err) {} }
          if (win.appId === 'system') {
            const childSys = this.systems.get(st.systemId);
            if (childSys?.desktop) {
              win.bodyEl.classList.add('system-window-body');
              win.bodyEl.appendChild(childSys.desktop.el);
              childSys.desktop.attachWindow(win);
            }
          }
        }
      }
    }

    // 挂载根桌面
    const pd = this.desktops.get(rootSys.id);
    if (pd) {
      pd.el.style.position = 'absolute';
      pd.el.style.inset = '0';
      if (parent.desktop) parent.desktop.el.appendChild(pd.el);
      pd.updateZoom();
    }
    for (const w of this.windows.values()) {
      if (w.appId === 'projection' && w.app?.rebind) w.app.rebind();
    }
    return rootSys;
  }
`;
s = s.slice(0, start) + neu + s.slice(end + 1);
fs.writeFileSync(path, s);
console.log('rewrote instantiateSnapshot');