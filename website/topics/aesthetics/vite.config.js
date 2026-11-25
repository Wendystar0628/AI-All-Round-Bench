// AI审美全能 网站：Vite 多页静态站。每一页由 src/render/ 在构建时画好（scripts/site.mjs），浏览器端脚本只管交互。
// 站点项目契约（website/README.md）：站内根路径取 ONESHOT_SITE_BASE（线上是 /aesthetics/，publish.py 构建时给），
// 数据目录取 ONESHOT_SITE_DATA_DIR。开发服务器没有 ONESHOT_SITE_BASE 时挂在 /；看成品（vite preview）要和构建时给同一个根路径。
import { defineConfig } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sitePlugin } from './scripts/site.mjs';

const root = dirname(fileURLToPath(import.meta.url));

function siteBase(command) {
  const base = process.env.ONESHOT_SITE_BASE?.trim();
  if (!base) {
    if (command === 'build') throw new Error('ONESHOT_SITE_BASE 没有设置：构建须给出站内根路径（如 /aesthetics/），由 website/tools/publish.py 传入');
    return '/';
  }
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(base)) throw new Error(`ONESHOT_SITE_BASE 应写成 /<专题 id>/，现在是 ${base}`);
  return base;
}

export default defineConfig(({ command }) => ({
  root,
  base: siteBase(command),
  appType: 'mpa',
  publicDir: false,
  plugins: [sitePlugin({ root })],
  server: { port: 5195, strictPort: false },
  preview: { port: 5196, strictPort: false },   // npm run preview：看 dist/，要和构建时一样给 ONESHOT_SITE_BASE
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
}));
