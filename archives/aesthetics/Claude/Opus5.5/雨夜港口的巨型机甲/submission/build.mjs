import * as esbuild from 'esbuild';
const entry = process.argv[2] || 'main';
const minify = process.argv.includes('--min');
await esbuild.build({
  entryPoints: [`src/${entry}.js`],
  bundle: true, format: 'iife', outfile: `dist/${entry === 'main' ? 'app' : entry}.js`,
  minify, legalComments: 'none', target: ['chrome110'], logLevel: 'warning',
});
console.log('built', entry);
