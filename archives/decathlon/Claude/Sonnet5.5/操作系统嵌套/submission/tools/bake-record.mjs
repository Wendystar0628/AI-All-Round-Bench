// 烘焙默认演出的飞行记录：node tools/bake-record.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../src/host/compiler.js';
import { VM, NATIVES, tostr, newMap } from '../src/host/vm.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenePath = path.join(ROOT, 'ns', 'Demo', 'helicopter-24.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const read = (p) => { const fp = path.join(ROOT, 'ns', p.replace(/^\//, '')); return fs.existsSync(fp) ? { text: fs.readFileSync(fp, 'utf8'), sig: '' } : null; };
const prog = compile(fs.readFileSync(path.join(ROOT, 'tools', 'bake.ns'), 'utf8'), { name: 'bake.ns', read, prelude: null, natives: new Set(Object.keys(NATIVES)) });
const P = JSON.parse(process.argv.find((a) => a.startsWith('{')) || '{}');
const params = Object.assign({ wind_speed: 3, t_vib: 6.4, t_smoke: 6.9, t_tail: 7.8, t_engine: 9.2, t_lift: 2.1, t_fwd0: 3.0, t_fwd1: 5.2, t_turn0: 4.6, t_turn1: 7.6, yaw_end: 2.9, alt: 11, speed: 15 }, P);
const args = JSON.parse(JSON.stringify({ flight: scene.flight, terrain: scene.terrain, pads: scene.pads, obstacles: scene.obstacles, duration: scene.duration, ...params }));
const vm = new VM(); const ctx = vm.spawn(prog, { args: (function conv(v) { if (Array.isArray(v)) return v.map(conv); if (v && typeof v === 'object') { const m = newMap(); for (const k in v) m[k] = conv(v[k]); return m; } return v; })(args) });
let exitVal; const t0 = Date.now(); let total = 0;
for (let i = 0; i < 20000; i++) {
  const r = vm.run(ctx, 5_000_000); total += r.used;
  if (r.status === 'trap') { if (ctx.trap.name === 'exit') { exitVal = ctx.trap.args[0]; break; } vm.ret(ctx, null); }
  else if (r.status === 'error') { console.error('烘焙出错', ctx.err); process.exit(1); }
  else if (r.status === 'done') break;
}
const out = JSON.parse(JSON.stringify(exitVal));
if (process.argv.includes('--track')) for (const r of out.track) console.log(r.join('	'));
console.log('烘焙完成', Date.now() - t0, 'ms，指令', total, JSON.stringify(out.summary));
if (!process.argv.includes('--dry')) { scene.flight.record = out.record; fs.writeFileSync(scenePath, JSON.stringify(scene)); console.log('已写入记录：控制样本', out.record.controls.length, '检查点', out.record.cp.length); }
