import fs from 'fs';
let s = fs.readFileSync('js/apps/tasks.js', 'utf8');
const a = `    for (const w of this.os.windows.values()) {
      if (w.systemId !== sys.id) continue;
      if (w.appId === 'system' || w.appId === 'projection') continue;
      out.push({
        id: 'app-' + w.id, name: w.title, type: '应用', state: w.minimized ? '最小化' : '运行',
        used: 0, step: 0, quota: 0, mem: w.app?.memory || 0, msgs: 0, appId: w.appId, win: w
      });
    }`;
const b = `    for (const w of this.os.windows.values()) {
      if (w.systemId !== sys.id) continue;
      if (w.appId === 'system' || w.appId === 'projection') continue;
      out.push({
        id: 'app-' + w.id, name: w.title, type: '应用', state: w.minimized ? '最小化' : '运行',
        used: 0, step: 0, quota: 0, mem: w.app?.memory || 0, msgs: 0, appId: w.appId, win: w
      });
      if (w.appId === 'browser' && w.app?.inspect) {
        for (const t of w.app.inspect(w)) {
          out.push({
            id: 'web-' + w.id + '-' + t.tabId, name: '网页 · ' + (t.url || t.tabId), type: '网页视图',
            state: t.loadState, used: null, step: null, quota: null, mem: null, msgs: 0, web: t, win: w
          });
        }
      }
    }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('rows ok'); } else console.log('rows miss');
s = s.replace(`        h('span', {}, fmtInt(r.used)),
        h('span', {}, r.quota ? \`\${fmtInt(r.step)} / \${fmtInt(r.quota)}\` : '—'),
        h('span', {}, fmtBytes(r.mem || 0)),`, `        h('span', {}, r.used == null ? '—' : fmtInt(r.used)),
        h('span', {}, r.quota ? \`\${fmtInt(r.step)} / \${fmtInt(r.quota)} · 余 \${fmtInt(Math.max(0, r.quota - r.step))}\` : '—'),
        h('span', {}, r.mem == null ? '—' : fmtBytes(r.mem)),`);
const c = `    } else if (r.child) {
      const c = r.child;`;
const d = `    } else if (r.web) {
      d.append(h('div', {}, '网页视图：' + (r.web.url || r.web.tabId)));
      d.append(h('div', {}, '加载状态：' + r.web.loadState));
      d.append(h('div', {}, '网页由 Chromium 执行，不计入自定义指令读数与逻辑预算。'));
    } else if (r.child) {
      const c = r.child;`;
if (s.includes(c)) { s = s.replace(c, d); console.log('detail ok'); } else console.log('detail miss');
s = s.replace(`      d.append(h('div', {}, \`父系统 \${c.parentId} · 深度 \${c.depth} · 虚拟时钟 \${(c.clock / 1000).toFixed(1)}s · 时间速率 \${c.speed}×\`));`, `      d.append(h('div', {}, \`父系统 \${c.parentId} · 深度 \${c.depth} · 虚拟时钟 \${(c.clock / 1000).toFixed(1)}s · 时间速率 \${c.speed}×\`));
      d.append(h('div', {}, \`内核自身 \${fmtInt(c.kernel?.usedTotal || 0)} · 子树总工作 \${fmtInt(c.totalUsed || 0)} · 内存 \${fmtBytes(c.totalMem || 0)}\`));`);
fs.writeFileSync('js/apps/tasks.js', s);
console.log('done');