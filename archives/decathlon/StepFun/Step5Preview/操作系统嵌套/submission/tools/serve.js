// 独立静态服务器：供浏览器模式测试使用（node tools/serve.js）
const http = require('http');
const path = require('path');
const fs = require('fs');
const APP_DIR = path.join(__dirname, '..', 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.osprog': 'text/plain; charset=utf-8', '.scene': 'application/json; charset=utf-8',
  '.sheet': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(APP_DIR, path.normalize(p).replace(/^([\\/])+/, ''));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.listen(18106, '127.0.0.1', () => console.log('serving on http://127.0.0.1:18106'));
