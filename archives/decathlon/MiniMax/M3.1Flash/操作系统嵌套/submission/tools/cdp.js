/*
 * 调试工具：通过 Electron 的远程调试端口检查渲染层。
 * 用法：node tools/cdp.js logs | eval "<表达式>" | shot <输出文件>
 */
const fs = require('fs');
const http = require('http');

const PORT = process.env.CDP_PORT || 19106;

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function findPage() {
  const list = await getJSON('/json/list');
  const pages = list.filter((t) => t.type === 'page');
  if (!pages.length) throw new Error('没有找到页面');
  for (const p of pages) {
    if (/index\.html|app:\/\//.test(p.url || '')) return p;
  }
  return pages[0];
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('超时: ' + method)); }
      }, 30000);
    });
  }
}

async function connect() {
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  return cdp;
}

async function main() {
  const cmd = process.argv[2] || 'logs';
  const cdp = await connect();
  if (cmd === 'logs') {
    await new Promise((r) => setTimeout(r, 1500));
    for (const ev of cdp.events) {
      if (ev.method === 'Runtime.consoleAPICalled') {
        const args = (ev.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
        console.log('[console.' + ev.params.type + '] ' + args);
      } else if (ev.method === 'Runtime.exceptionThrown') {
        const d = ev.params.exceptionDetails;
        console.log('[异常] ' + (d.exception && (d.exception.description || d.exception.value) || d.text) +
          ' @ ' + (d.url || '') + ':' + (d.lineNumber === undefined ? '?' : d.lineNumber + 1));
      } else if (ev.method === 'Log.entryAdded') {
        console.log('[log.' + ev.params.entry.level + '] ' + ev.params.entry.text + ' @ ' + (ev.params.entry.url || ''));
      }
    }
    console.log('--- 事件数 ' + cdp.events.length);
  } else if (cmd === 'eval') {
    const expr = process.argv[3];
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(r.result && r.result.value !== undefined ? r.result.value : r, null, 1));
  } else if (cmd === 'shot') {
    const file = process.argv[3] || 'shot.png';
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('已保存 ' + file);
  }
  process.exit(0);
}

main().catch((e) => { console.error('错误: ' + e.message); process.exit(1); });
