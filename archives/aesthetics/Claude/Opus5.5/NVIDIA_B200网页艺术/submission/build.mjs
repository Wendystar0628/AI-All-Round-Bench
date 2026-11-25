// 将 src/ 下的 ES 模块与 three.js 打包成单个经典脚本 app.js，
// 以便在 file:// 方式下直接双击 index.html 运行（不依赖模块脚本与 fetch）。
import * as esbuild from 'esbuild';
const min = process.argv.includes('--min');
await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'app.js',
  minify: min,
  sourcemap: false,
  target: ['chrome110'],
  legalComments: 'none',
  logLevel: 'info',
});
