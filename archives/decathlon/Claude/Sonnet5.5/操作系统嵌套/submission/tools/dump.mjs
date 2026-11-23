import { compileFile } from './nsc.mjs';
import { OP } from '../src/host/compiler.js';
const p = compileFile(process.argv[2]);
const names = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));
const only = process.argv[3];
for (const f of p.f) { if (only && f.n !== only) continue; console.log('fn', f.n, 'argc', f.a, 'locals', f.l); for (let i = 0; i < f.c.length; i += 3) console.log('  ', i / 3, names[f.c[i]], f.c[i + 1], f.c[i + 2]); }
console.log('consts', JSON.stringify(p.k), 'globals', p.gn, 'nat', p.nat);
