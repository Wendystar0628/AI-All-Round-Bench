'use strict';
// 开发检查用：通过调试端口操作正在运行的作品。
// 用法：node tools/cdp.js eval "<js>" | shot <file> | click x y [button] | dbl x y | move x y | drag x1 y1 x2 y2 | key <Key> | type <text> | wheel x y dy
const fs = require('fs');
const PORT = process.env.CDP_PORT || 19106;
async function target() {
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const t = list.find(x => x.type === 'page' && x.url.startsWith('nos://')) || list.find(x => x.type === 'page');
  if (!t) throw new Error('no page target');
  return t;
}
async function connect() {
  const t = await target();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const { res, rej } = pend.get(d.id); pend.delete(d.id); if (d.error) rej(new Error(d.error.message)); else res(d.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  return { send, close: () => ws.close() };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function mouse(c, type, x, y, button, clickCount, buttons) {
  await c.send('Input.dispatchMouseEvent', { type, x, y, button: button || 'none', clickCount: clickCount || 0, buttons: buttons == null ? (type === 'mouseReleased' ? 0 : (button === 'right' ? 2 : button === 'left' ? 1 : 0)) : buttons });
}
async function main() {
  const [, , cmd, ...a] = process.argv;
  const c = await connect();
  try {
    if (cmd === 'eval') {
      const r = await c.send('Runtime.evaluate', { expression: a.join(' '), awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) console.log('EXC', JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails));
      else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1));
    } else if (cmd === 'shot') {
      const sc = +a[1] || 1; const m = await c.send('Page.getLayoutMetrics');
      const vw = m.cssVisualViewport.clientWidth, vh = m.cssVisualViewport.clientHeight;
      const clip = a[2] ? { x: +a[2], y: +a[3], width: +a[4], height: +a[5], scale: sc } : { x: 0, y: 0, width: vw, height: vh, scale: sc };
      const r = await c.send('Page.captureScreenshot', { format: 'png', clip });
      fs.writeFileSync(a[0], Buffer.from(r.data, 'base64')); console.log('saved', a[0]);
    } else if (cmd === 'click' || cmd === 'dbl' || cmd === 'rclick') {
      const x = +a[0], y = +a[1], b = cmd === 'rclick' ? 'right' : (a[2] || 'left');
      await mouse(c, 'mouseMoved', x, y);
      await mouse(c, 'mousePressed', x, y, b, 1); await mouse(c, 'mouseReleased', x, y, b, 1);
      if (cmd === 'dbl') { await sleep(60); await mouse(c, 'mousePressed', x, y, b, 2); await mouse(c, 'mouseReleased', x, y, b, 2); }
    } else if (cmd === 'move') { await mouse(c, 'mouseMoved', +a[0], +a[1]); }
    else if (cmd === 'drag') {
      const [x1, y1, x2, y2] = a.map(Number); const steps = +a[4] || 12;
      await mouse(c, 'mouseMoved', x1, y1); await mouse(c, 'mousePressed', x1, y1, 'left', 1);
      for (let i = 1; i <= steps; i++) { await mouse(c, 'mouseMoved', x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, 'left', 0, 1); await sleep(25); }
      await sleep(80);
      await mouse(c, 'mouseReleased', x2, y2, 'left', 1);
    } else if (cmd === 'key') {
      const key = a[0]; const map = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40 };
      const mod = +a[1] || 0;
      const p = { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, windowsVirtualKeyCode: map[key] || key.toUpperCase().charCodeAt(0), modifiers: mod };
      if (key === 'Enter') p.text = '\r';
      await c.send('Input.dispatchKeyEvent', Object.assign({ type: p.text ? 'keyDown' : 'rawKeyDown' }, p));
      await c.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, p));
    } else if (cmd === 'type') { await c.send('Input.insertText', { text: a.join(' ') }); }
    else if (cmd === 'wheel') { await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +a[0], y: +a[1], deltaX: 0, deltaY: +a[2] }); }
    else if (cmd === 'console') {
      await c.send('Runtime.enable'); await c.send('Log.enable');
      await sleep(+a[0] || 1500);
    }
    await sleep(40);
  } finally { c.close(); }
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
