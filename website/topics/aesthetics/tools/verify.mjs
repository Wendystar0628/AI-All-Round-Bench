// 打开同一件作品的两个版本并逐帧比对：原作品经本地网页服务器打开，打包后的单个 html 以 file:// 打开。
// 两边都用作品自带的 window.videoExport 走到同样的几帧截图，并记录控制台报错和 file:// 下读不到的本地文件。
// 用法：node verify.mjs <job.json>；job 见 package.py 的 verify()。结果写到 <out>/result.json。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { width, height, fps, samples } = job;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 两边用同一个随机数种子，作品里用 Math.random 生成的场景才能逐像素对上。
const SEEDED_RANDOM = `(() => { let s = 0x2545f491; Math.random = () => {
  s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

const MIME = { '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm',
  '.glsl': 'text/plain', '.txt': 'text/plain' };

function serve(root) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, rel);
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(rel === 'favicon.ico' ? 204 : 404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(file).toLowerCase()] || 'application/octet-stream') + '; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = new Set();
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const q = this.pending.get(m.id); if (!q) return;
        this.pending.delete(m.id); clearTimeout(q.timer);
        m.error ? q.reject(new Error(`${q.method}: ${m.error.message}`)) : q.resolve(m.result);
      } else for (const fn of this.listeners) fn(m);
    };
  }
  open() { return new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; }); }
  send(method, params = {}, sessionId, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 超时 ${timeout} ms`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function launch(profile) {
  fs.rmSync(profile, { recursive: true, force: true });
  // 以管理员身份运行时 Chrome 默认会降权重启自己，--do-not-de-elevate 让 proc 就是浏览器进程本身，关得掉、等得到
  const proc = spawn(job.chrome, ['--headless=new', '--do-not-de-elevate', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !fs.existsSync(portFile); i++) await sleep(100);
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
  const cdp = new CDP(`ws://127.0.0.1:${port}${wsPath}`);
  await cdp.open();
  return { proc, cdp };
}

function text(arg) { return arg.value !== undefined ? String(arg.value) : arg.description || arg.type; }

async function visit(cdp, label, url, trackLocal) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params, timeout) => cdp.send(method, params, sessionId, timeout);
  const evaluate = async (expression, timeout = 120000) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const out = { url, ready: false, errors: [], local: [], live: null, runs: [], failure: null };
  let loaded = false;
  const listener = m => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Page.loadEventFired') loaded = true;
    else if (m.method === 'Runtime.exceptionThrown') out.errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) out.errors.push(p.args.map(text).join(' '));
    else if (m.method === 'Log.entryAdded' && p.entry.level === 'error') out.errors.push(p.entry.text + (p.entry.url ? ` (${p.entry.url})` : ''));
    else if (m.method === 'Network.requestWillBeSent' && trackLocal && p.request.url.startsWith('file:') && p.request.url !== url) out.local.push(p.request.url);
  };
  cdp.listeners.add(listener);
  // ms：把页面上的 CSS / Web 动画停在同一时刻再截图。有的作品在导出模式下仍有按真实时间转的 CSS 动画，
  // 不停住的话两次打开会差几条细线；两边做同样的处理，比的仍是同一份代码的画面。
  const shot = async (name, ms) => {
    if (ms !== undefined) await evaluate(`(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${ms}; } return 1; })()`, 30000).catch(() => {});
    await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))', 30000).catch(() => {});
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, 120000);
    fs.writeFileSync(path.join(job.out, name), Buffer.from(data, 'base64'));
    return name;
  };
  try {
    for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await send(`${domain}.enable`);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SEEDED_RANDOM });
    await send('Page.navigate', { url });
    const deadline = Date.now() + job.readyMs;
    while (!out.ready && Date.now() < deadline) {
      out.ready = loaded && await evaluate('document.readyState === "complete" && !!window.videoExport', 30000).catch(() => false);
      if (!out.ready) await sleep(250);
    }
    await evaluate('document.fonts.ready.then(() => 1)', 30000).catch(() => {});
    await sleep(job.settleMs);
    out.live = await shot(`${label}-live.png`);
    if (!out.ready) { out.failure = loaded ? '页面没有提供 window.videoExport' : '页面没有加载完'; return out; }
    for (const run of await evaluate('window.videoExport.runs')) {
      const info = await evaluate(`Promise.resolve(window.videoExport.begin(${JSON.stringify(run)}, { fps: ${fps} }))`, 600000);
      const frames = info.frames;
      const picks = [...new Set(samples.map(f => Math.min(frames - 1, Math.floor(f * frames))))];
      const entry = { run, frames, shots: [] };
      for (let i = 0; i <= Math.max(...picks); i++) {
        await evaluate(`Promise.resolve(window.videoExport.frame(${i})).then(() => 1)`, 300000);
        if (picks.includes(i)) entry.shots.push({ frame: i, file: await shot(`${label}-${run}-${i}.png`, Math.round(i * 1000 / fps)) });
      }
      await evaluate('Promise.resolve(window.videoExport.end()).then(() => 1)', 120000);
      out.runs.push(entry);
    }
  } catch (e) {
    out.failure = String(e.message || e);
  } finally {
    cdp.listeners.delete(listener);
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
  return out;
}

fs.mkdirSync(job.out, { recursive: true });
const profile = path.join(job.out, '_profile');
const server = await serve(job.original);
const { proc, cdp } = await launch(profile);
const result = {};
try {
  result.original = await visit(cdp, 'original', `http://127.0.0.1:${server.address().port}/index.html`, false);
  result.single = await visit(cdp, 'single', pathToFileURL(job.single).href, true);
  fs.writeFileSync(path.join(job.out, 'result.json'), JSON.stringify(result, null, 2));
} finally {
  await cdp.send('Browser.close').catch(() => {});
  for (let i = 0; i < 300 && proc.exitCode === null; i++) await sleep(100);
  if (proc.exitCode === null) proc.kill();
  server.close();
  // 配置目录是临时的，删不掉留给下次打包时清
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {}
}
