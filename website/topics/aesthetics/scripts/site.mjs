// 站点插件：把 src/render/ 画出的每一页交给 Vite。
//   构建：每条路由一个虚拟的 <路径>/index.html 入口；写完成品后按站内用字做字体子集（scripts/fonts.mjs），
//         再把数据目录原样拷进 dist/data/（topic.json 等和 media/、downloads/，页面里的图片和下载包都指向这里）。
//   开发：按请求现画页面（改 src/render、src/i18n 或数据后自动刷新），<根>data/* 直接读数据目录。
// 数据目录（website/README.md 的站点项目契约）：ONESHOT_SITE_DATA_DIR 优先；开发时其次是 data-local/，再其次 data/；
// 构建时没有 ONESHOT_SITE_DATA_DIR 就读 data/。
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { devFontsHTML, subsetFonts } from './fonts.mjs';

const TYPES = { '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.zip': 'application/zip' };

export function sitePlugin({ root }) {
  const fixed = process.env.ONESHOT_SITE_DATA_DIR?.trim();
  let serving = false;
  let base = '/';
  let outDir = join(root, 'dist');
  let dataDir = join(root, 'data');
  let render = null;          // 构建时载入的 src/render/index.mjs
  let data = null;
  const routes = new Map();   // 虚拟入口 id -> 路由
  const idOf = (url) => posix.join(root.replace(/\\/g, '/'), url, 'index.html');

  return {
    name: 'aesthetics-site',
    enforce: 'pre',

    async config(_, { command }) {
      serving = command === 'serve';
      const local = join(root, 'data-local');
      dataDir = fixed ? resolve(fixed) : serving && existsSync(join(local, 'topic.json')) ? local : join(root, 'data');
      if (!existsSync(join(dataDir, 'topic.json'))) {
        throw new Error(`数据目录 ${dataDir} 里没有 topic.json。先运行 python website/tools/export.py --topic aesthetics；`
          + '本专题还是草稿时导出只写 data-local/，构建要用 ONESHOT_SITE_DATA_DIR=data-local 指过去');
      }
      if (serving) return {};
      render = await import(pathToFileURL(join(root, 'src', 'render', 'index.mjs')).href);
      data = render.loadData(dataDir);
      const input = {};
      for (const r of render.listRoutes(data)) {
        const url = render.routeURL(r);
        routes.set(idOf(url), r);
        input[url ? url.replace(/\/$/, '').replace(/\//g, '__') : 'index'] = idOf(url);
      }
      return { build: { rolldownOptions: { input } } };
    },

    configResolved(c) {
      base = c.base;
      outDir = resolve(c.root, c.build.outDir);
    },

    resolveId(id) {
      const n = id.replace(/\\/g, '/');
      return routes.has(n) ? n : null;
    },

    load(id) {
      const r = routes.get(id.replace(/\\/g, '/'));
      return r ? render.renderRoute(r, data, base) : null;
    },

    async writeBundle() {
      await subsetFonts({ root, outDir, base });
      cpSync(dataDir, join(outDir, 'data'), { recursive: true });
      console.log(`[site] 数据 ${dataDir} 已拷进 ${join(outDir, 'data')}`);
    },

    configureServer(server) {
      const norm = (f) => f.replace(/\\/g, '/');
      const watched = [join(root, 'src', 'render'), join(root, 'src', 'i18n'), dataDir].map(norm);
      server.watcher.add(watched);
      const onChange = (file) => {
        const f = norm(file);
        if (watched.some((w) => f.startsWith(w)) && !f.includes('/media/') && !f.includes('/downloads/')) server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('change', onChange);
      server.watcher.on('add', onChange);

      // <根>data/*：数据目录里的文件（JSON、图片、下载包）
      server.middlewares.use((req, res, next) => {
        const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (!p.startsWith(`${base}data/`)) return next();
        const file = resolve(dataDir, p.slice(`${base}data/`.length));
        if (!file.startsWith(dataDir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });

      // 页面：每次请求现画
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url, 'http://x');
          let p = decodeURIComponent(url.pathname);
          if (base !== '/' && p === base.slice(0, -1)) {
            res.writeHead(301, { Location: base + url.search }).end();
            return;
          }
          if (!p.startsWith(base)) return next();
          p = p.slice(base.length).replace(/index\.html$/, '');
          const mod = await server.ssrLoadModule('/src/render/index.mjs');
          const live = mod.loadData(dataDir);
          const list = mod.listRoutes(live);
          if (p && !p.endsWith('/')) {
            if (list.some((r) => mod.routeURL(r) === `${p}/`)) {
              res.writeHead(301, { Location: `${base}${p}/${url.search}` }).end();
              return;
            }
            return next();
          }
          const route = list.find((r) => mod.routeURL(r) === p);
          if (!route) return next();
          let html = mod.renderRoute(route, live, base).replace('<!--@fonts-->', devFontsHTML());
          html = await server.transformIndexHtml(req.url, html, req.originalUrl);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(html);
        } catch (e) {
          server.ssrFixStacktrace(e);
          next(e);
        }
      });
    },
  };
}
