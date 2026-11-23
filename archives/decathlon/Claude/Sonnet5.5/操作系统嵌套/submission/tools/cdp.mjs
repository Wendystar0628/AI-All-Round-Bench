// 简易 CDP 客户端（调试用）：node tools/cdp.mjs eval "<js>" | shot <out.png> | click x y | key <key> | type <text>
import fs from 'node:fs';
const PORT = process.env.CDP_PORT || 19106;
async function target() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  return list.find((t) => t.type === 'page' && t.url.includes('index.html')) || list.find((t) => t.type === 'page');
}
export async function connect() {
  const t = await target();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, close: () => ws.close() };
}
export async function evalJs(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) return { error: r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || 'error' };
  return r.result.result.value;
}
export async function shot(c, out) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
}
export async function click(c, x, y, button = 'left', count = 1) {
  const b = button;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: b, clickCount: count, buttons: b === 'right' ? 2 : 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: b, clickCount: count });
}
export async function key(c, k, mods = 0) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, modifiers: mods });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, modifiers: mods });
}
export async function typeText(c, text) { await c.send('Input.insertText', { text }); }
const VK = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46 };
export async function pressKey(c, k) { const vk = VK[k] || 0; await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: vk }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk }); }
export async function typeKeys(c, s) { for (const ch of s) { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } }

// 按 data-testid（可附加属性过滤）定位元素中心
export async function rectOf(c, tid, attr, nth = 0) {
  const sel = '[data-testid="' + tid + '"]' + (attr ? attr.split('&').map((a) => '[data-' + a.split('=')[0] + '="' + a.split('=').slice(1).join('=') + '"]').join('') : '');
  const r = await evalJs(c, '(() => { const els = [...document.querySelectorAll(' + JSON.stringify(sel) + ')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }); const e = els[' + nth + ']; if (!e) return null; const b = e.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2, n: els.length}; })()');
  return r;
}
export async function clickTid(c, tid, attr, opts = {}) {
  const r = await rectOf(c, tid, attr, opts.nth || 0);
  if (!r || r.error) throw new Error('找不到 ' + tid + ' ' + (attr || ''));
  await click(c, r.x, r.y, opts.button || 'left', opts.count || 1);
  return r;
}
if (process.argv[1] && process.argv[1].endsWith('cdp.mjs')) {
  const [cmd, a, b] = process.argv.slice(2);
  const c = await connect();
  if (cmd === 'eval') console.log(JSON.stringify(await evalJs(c, a), null, 1));
  else if (cmd === 'shot') { await shot(c, a); console.log('saved', a); }
  else if (cmd === 'click') await click(c, Number(a), Number(b));
  else if (cmd === 'rclick') await click(c, Number(a), Number(b), 'right');
  else if (cmd === 'dbl') await click(c, Number(a), Number(b), 'left', 2);
  else if (cmd === 'tid') console.log(JSON.stringify(await clickTid(c, a, b)));
  else if (cmd === 'dtid') console.log(JSON.stringify(await clickTid(c, a, b, { count: 2 })));
  else if (cmd === 'rtid') console.log(JSON.stringify(await clickTid(c, a, b, { button: 'right' })));
  else if (cmd === 'key') await pressKey(c, a);
  else if (cmd === 'type') await typeText(c, a);
  c.close();
}
