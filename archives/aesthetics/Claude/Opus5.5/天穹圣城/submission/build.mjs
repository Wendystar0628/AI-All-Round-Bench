import * as esbuild from 'esbuild';

const minify = !process.argv.includes('--dev');
const t0 = Date.now();
await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'app.js',
  minify,
  target: 'es2020',
  legalComments: 'none',
  logLevel: 'warning',
});
console.log(`built app.js in ${Date.now() - t0} ms (minify=${minify})`);
