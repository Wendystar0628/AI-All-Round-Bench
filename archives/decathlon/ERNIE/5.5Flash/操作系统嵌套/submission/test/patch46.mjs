import fs from 'fs';
let s = fs.readFileSync('js/shell.js', 'utf8');
s = s.replace(`    for (const w of wins) {
      const r = w.app.systemTick ? w.app.systemTick(sys) : null;
      if (r && r.cost) cost += r.cost;
    }
    return { cost: Math.max(2, cost) };`, `    for (const w of wins) {
      const r = w.app.systemTick ? w.app.systemTick(sys) : null;
      if (r && r.cost) cost += r.cost;
      const def = w.app.sceneDef;
      cost += def ? 2 + Math.round((def.trees || 0) / 12 + (def.rocks || 0) / 6 + ((def.timeline?.keys?.length || 1) / 4)) : 2;
    }
    return { cost: Math.max(2, Math.round(cost)) };`);
s = s.replace(`      if (w.systemId === sys.id && w.appId === 'charts' && w.app?.tick) {
        const r = w.app.tick(STEP_MS, sys);
        if (r?.cost) cost += r.cost;
      }`, `      if (w.systemId === sys.id && w.appId === 'charts' && w.app?.tick) {
        const r = w.app.tick(STEP_MS, sys);
        if (r?.cost) cost += r.cost;
        const d = w.app.chart?.data;
        cost += 2 + (d?.labels?.length || 0) * (d?.series?.length || 1) / 10;
      }`);
fs.writeFileSync('js/shell.js', s);
console.log('done');