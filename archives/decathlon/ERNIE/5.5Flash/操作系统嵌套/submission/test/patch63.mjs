import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`      const r = targetSys.deliver(pid, ['data', payload], 'root');`, `      const r = targetSys.deliver(pid, ['data', payload, win.id], 'root');`);
s = s.replace(`    if (msg[0] === 'data') {
      for (const w of this.windows.values()) {
        if (w.systemId === sys.id && w.appId === 'charts' && w.app?.handleData) {
          w.app.handleData(msg[1]);
          return { cost: 20 };
        }
      }
    }`, `    if (msg[0] === 'data') {
      const targetId = msg[2];
      const w = this.windows.get(targetId) || [...this.windows.values()].find(x => x.systemId === sys.id && x.appId === 'charts');
      if (w && w.systemId === sys.id && w.appId === 'charts' && w.app?.handleData) {
        w.app.handleData(msg[1]);
        return { cost: 20 };
      }
    }`);
fs.writeFileSync('js/shell.js', s);
console.log('done');