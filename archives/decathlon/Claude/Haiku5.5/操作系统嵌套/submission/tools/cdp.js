'use strict';
// 开发检查用：通过调试端口（默认 19106）连接应用页面，执行脚本或截图。
// 用法：node tools/cdp.js eval "<js 表达式>"     → 打印 JSON 结果
//       node tools/cdp.js shot <输出.png>         → 截图
//       node tools/cdp.js console                 → 打印最近的控制台消息（需先运行 eval 一次以挂接）
const http = require('http');

const PORT = Number(process.env.NOS_DEBUG_PORT || 19106);

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => {
        try { resolve(JSON.parse(s)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function connect() {
  const pages = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).filter((p) => p.type === 'page' && p.url.startsWith('nos://'));
  if (!pages.length) throw new Error('没有找到应用页面');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text));
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(msg.params.type + ' ' + msg.params.args.map((a) => a.value !== undefined ? a.value : a.description).join(' '));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  return { ws, send, logs };
}

async function main() {
  const [, , cmd, arg] = process.argv;
  const c = await connect();
  if (cmd === 'eval') {
    const r = await c.send('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) console.log('EXCEPTION', r.exceptionDetails.exception && r.exceptionDetails.exception.description);
    console.log(JSON.stringify(r.result && r.result.value, null, 1));
    await new Promise((r2) => setTimeout(r2, 150));
    if (c.logs.length) console.log('--- console ---\n' + c.logs.slice(-40).join('\n'));
  } else if (cmd === 'shot') {
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(arg, Buffer.from(r.data, 'base64'));
    console.log('saved', arg);
  } else if (cmd === 'click' || cmd === 'dblclick' || cmd === 'rclick') {
    const x = Number(process.argv[3]);
    const y = Number(process.argv[4]);
    const button = cmd === 'rclick' ? 'right' : 'left';
    const n = cmd === 'dblclick' ? 2 : 1;
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    for (let i = 1; i <= n; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: i });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: i });
    }
    await new Promise((r2) => setTimeout(r2, 200));
    console.log('clicked', x, y, cmd);
  } else if (cmd === 'selin') {
    // 在父元素内点击子元素：node tools/cdp.js selin '<父选择器>' '<子选择器>' [序号] [dbl]
    const parent = arg;
    const child = process.argv[4];
    const idx = Number(process.argv[5] || 0);
    const dbl = process.argv[6] === 'dbl';
    const r = await c.send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const ps = [...document.querySelectorAll(${JSON.stringify(parent)})]; const els = []; for (const p of ps) els.push(...p.querySelectorAll(${JSON.stringify(child)})); const el = els[${idx}]; if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2, n: els.length}; })()` });
    const p = r.result.value;
    if (!p) { console.log('NOT FOUND', parent, child); } else {
      const n = dbl ? 2 : 1;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      for (let i = 1; i <= n; i++) {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: i });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: i });
      }
      console.log('selin at', Math.round(p.x), Math.round(p.y), 'matches', p.n);
    }
    await new Promise((r2) => setTimeout(r2, 300));
  } else if (cmd === 'sel') {
    // 按选择器点击元素（可指定序号）：node tools/cdp.js sel '<选择器>' [序号] [dbl]
    const idx = Number(process.argv[4] || 0);
    const dbl = process.argv[5] === 'dbl';
    const r = await c.send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const els = [...document.querySelectorAll(${JSON.stringify(arg)})]; const el = els[${idx}]; if (!el) return null; el.scrollIntoView && 0; const b = el.getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2, n: els.length}; })()` });
    const p = r.result.value;
    if (!p) { console.log('NOT FOUND', arg); } else {
      const n = dbl ? 2 : 1;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      for (let i = 1; i <= n; i++) {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: i });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: i });
      }
      console.log('sel', arg, idx, 'at', Math.round(p.x), Math.round(p.y), 'matches', p.n);
    }
    await new Promise((r2) => setTimeout(r2, 300));
  } else if (cmd === 'drag') {
    const [x1, y1, x2, y2] = process.argv.slice(3).map(Number);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 10, y: y1 + ((y2 - y1) * i) / 10, button: 'left', buttons: 1 });
      await new Promise((r2) => setTimeout(r2, 30));
    }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
    await new Promise((r2) => setTimeout(r2, 200));
    console.log('dragged');
  } else if (cmd === 'key') {
    const map = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, F2: 113 };
    const key = arg;
    const vk = map[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    const mods = Number(process.argv[4] || 0);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: vk, modifiers: mods });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, modifiers: mods });
    await new Promise((r2) => setTimeout(r2, 150));
    console.log('key', key);
  } else if (cmd === 'type') {
    await c.send('Input.insertText', { text: arg });
    await new Promise((r2) => setTimeout(r2, 150));
    console.log('typed', arg);
  } else if (cmd === 'console') {
    await new Promise((r2) => setTimeout(r2, 300));
    console.log(c.logs.join('\n'));
  }
  c.ws.close();
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
