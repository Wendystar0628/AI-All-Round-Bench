// 端到端：逐层创建子系统，直到第四层，并在每层截图
import { connect, evalJs, shot, clickTid, rectOf } from './cdp.mjs';
const c = await connect();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2] || '/tmp/nos';
async function sysState() { return evalJs(c, 'JSON.stringify(window.__os.machine.systemList().map(s => s.id + ":" + s.state))'); }
// 第 0 层：打开系统管理
await clickTid(c, 'desktop-icon', 'app-id=systems&system-id=outer', { count: 2 }); await sleep(1500);
await clickTid(c, 'system-new', 'system-id=outer'); await sleep(4000);
console.log(await sysState());
for (let d = 1; d <= 3; d++) {
  const sid = 'inner-' + d;
  // 在该层桌面双击“系统管理”图标
  await clickTid(c, 'desktop-icon', 'app-id=systems&system-id=' + sid, { count: 2 }); await sleep(2500);
  await clickTid(c, 'system-new', 'system-id=' + sid); await sleep(5000);
  console.log(d, await sysState());
  await shot(c, `${out}/nest${d}.png`);
}
c.close();
