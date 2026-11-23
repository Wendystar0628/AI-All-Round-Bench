// 端到端：表格 → 子系统图表 的实时连接
import { connect, evalJs, shot, clickTid, pressKey, typeText, typeKeys } from './cdp.mjs';
const c = await connect(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = process.argv[2] || 'C:/Users/AIAgent/AppData/Local/Temp/nos';
await evalJs(c, 'window.__os.reload().then(()=>1)'); await sleep(2500);
// 1. 打开示例工作簿
await clickTid(c, 'desktop-icon', 'app-id=files&system-id=outer', { count: 2 }); await sleep(1500);
await clickTid(c, 'files-nav', 'file-path=/Demo'); await sleep(800);
await clickTid(c, 'files-item', 'file-path=/Demo/sample.sheet', { count: 2 }); await sleep(1500);
// 2. 创建子系统
await clickTid(c, 'desktop-icon', 'app-id=systems&system-id=outer', { count: 2 }); await sleep(1500);
await clickTid(c, 'system-new', 'system-id=outer'); await sleep(7000);
// 3. 子系统里打开图表工作台
await clickTid(c, 'desktop-icon', 'app-id=charts&system-id=inner-1', { count: 2 }); await sleep(2500);
await clickTid(c, 'chart-source', 'system-id=inner-1'); await sleep(800);
await clickTid(c, 'chart-source-option', 'system-id=inner-1'); await sleep(800);
await clickTid(c, 'chart-connect', 'system-id=inner-1'); await sleep(2500);
await shot(c, D + '/c1.png');
console.log(await evalJs(c, 'JSON.stringify(window.__os.display.collect().charts)'));
// 4. 在根表格修改数量
await clickTid(c, 'sheet-cell', 'cell-address=B2'); await sleep(300);
await clickTid(c, 'sheet-formula'); await sleep(200);
await evalJs(c, "(() => { const f = document.querySelector('[data-testid=sheet-formula]'); f.select(); return 1; })()");
await typeText(c, '60'); await pressKey(c, 'Enter'); await sleep(2500);
await shot(c, D + '/c2.png');
await clickTid(c, 'chart-type', 'system-id=inner-1&value=line'); await sleep(1500);
await shot(c, D + '/c3.png');
console.log(await evalJs(c, 'JSON.stringify(window.__os.display.collect().charts)'));
c.close();
