// npm run dev      -> http://localhost:5187/ : pages rendered on each request, data from data-local/ when it
//                     has topics.json, else data/ (ONESHOT_HUB_DATA_DIR overrides both); refresh to see edits
// npm run preview  -> http://localhost:5186/ : the built dist/
// --port <n> picks another port.
import http from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { HUB, LOGO_DIR, FONT_DIR, loadConfig, renderPage, dataDir, read } from './render.mjs';

const args = process.argv.slice(2);
const dist = args.includes('--dist');
const pi = args.indexOf('--port');
const port = pi >= 0 ? Number(args[pi + 1]) : dist ? 5186 : 5187;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

// a file inside dir, or null (no escaping the folder)
const inside = (dir, rel) => {
  const f = normalize(join(dir, rel));
  if (f !== dir && !f.startsWith(dir + sep)) return null;
  if (existsSync(f) && statSync(f).isDirectory()) return existsSync(join(f, 'index.html')) ? join(f, 'index.html') : null;
  return existsSync(f) ? f : null;
};

async function resolveDev(p) {
  if (p === '/' || p === '/index.html') return { html: renderPage('zh', await loadConfig()) };
  if (p === '/en/' || p === '/en/index.html') return { html: renderPage('en', await loadConfig()) };
  if (['/hub.css', '/hub.js', '/favicon.svg'].includes(p)) return { file: join(HUB, 'src', p.slice(1)) };
  if (p.startsWith('/logos/')) return { file: inside(LOGO_DIR, p.slice('/logos/'.length)) };
  if (p.startsWith('/fonts/')) return { file: inside(FONT_DIR, p.slice('/fonts/'.length)) };
  if (p.startsWith('/data/')) return { file: inside(dataDir({ dev: true }), p.slice('/data/'.length)) };
  return {};
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      if (p === '/en') {
        res.writeHead(301, { Location: '/en/' + url.search });
        return res.end();
      }
      const r = dist ? { file: inside(join(HUB, 'dist'), p) } : await resolveDev(p);
      const headers = { 'Cache-Control': 'no-cache' };
      if (r.html) {
        res.writeHead(200, { ...headers, 'Content-Type': TYPES['.html'] });
        return res.end(r.html);
      }
      if (r.file) {
        res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(r.file)] || 'application/octet-stream' });
        return res.end(read(r.file));
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 ${p}`);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(e?.stack || e));
    }
  })
  .listen(port, () => {
    const from = dist ? join(HUB, 'dist') : `data: ${dataDir({ dev: true })}`;
    console.log(`[hub] http://localhost:${port}/  (${from})`);
  });
