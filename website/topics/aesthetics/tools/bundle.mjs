// 把页面里的模块脚本按文档顺序合成一个入口，用 esbuild 打成一个不再引用其他文件的 ES 模块，供 package.py 内联。
// 用法：node bundle.mjs < job.json，job = {root, nodePaths, importmap, scripts: [{file} | {code}]}；结果写到 stdout。
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const job = JSON.parse(fs.readFileSync(0, 'utf8'));
const imports = job.importmap?.imports || {};
const entry = job.scripts.map((s, i) => `import ${JSON.stringify(s.file ? './' + s.file : `inline:${i}`)};`).join('\n');

// 页面内联的模块脚本和 import map 里的裸模块名
const page = {
  name: 'page',
  setup(build) {
    build.onResolve({ filter: /^inline:\d+$/ }, a => ({ path: a.path, namespace: 'inline' }));
    build.onLoad({ filter: /.*/, namespace: 'inline' }, a => ({
      contents: job.scripts[Number(a.path.slice(7))].code, resolveDir: job.root, loader: 'js' }));
    build.onResolve({ filter: /^[^./]/ }, a => {
      const key = a.path in imports ? a.path
        : Object.keys(imports).filter(k => k.endsWith('/') && a.path.startsWith(k)).sort((x, y) => y.length - x.length)[0];
      if (key === undefined) return undefined;
      const target = imports[key] + a.path.slice(key.length);
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return { path: target, external: true };
      return { path: path.resolve(job.root, target.replace(/^\/+/, '')) };
    });
  },
};

const result = await esbuild.build({
  stdin: { contents: entry, resolveDir: job.root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'browser', write: false, charset: 'utf8',
  legalComments: 'inline', logLevel: 'silent', nodePaths: job.nodePaths || [], plugins: [page],
});
process.stdout.write(result.outputFiles[0].text);
