// 通过调试端口截图 / 执行脚本
import fs from 'fs';
const port = process.env.PORT || 19106;
const out = process.argv[2] || 'shot.png';
const expr = process.argv[3];
const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => { ws.onopen = r; });
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
await send('Page.enable');
await send('Runtime.enable');
if (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result && r.result.result ? r.result.result.value : r.result, null, 1).slice(0, 4000));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
process.exit(0);
