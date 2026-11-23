// 构建系统映像：拼接分段源文件 → 编译全部 .ns 为 .nsx（带源码签名与依赖）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../src/host/compiler.js';
import { NATIVES } from '../src/host/vm.js';
import { sigOf } from '../src/host/machine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NS = path.join(ROOT, 'ns');
const natives = new Set(Object.keys(NATIVES));

// 1) 拼接分段（tools/parts/<name>/*.ns -> ns/System/<name>.ns 或 ns/<dest>）
const PARTS = path.join(ROOT, 'tools', 'parts');
const DEST = { kernel: 'System/kernel.ns', wm: 'System/wm.ns', player: 'Apps/player.ns', charts: 'Apps/charts.ns', files: 'Apps/files.ns', editor: 'Apps/editor.ns', tasks: 'Apps/tasks.ns', systems: 'Apps/systems.ns', widgets: 'Apps/widgets.ns', settings: 'Apps/settings.ns' };
if (fs.existsSync(PARTS)) {
  for (const name of fs.readdirSync(PARTS)) {
    const dir = path.join(PARTS, name); if (!fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ns')).sort();
    const out = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
    const dest = DEST[name] || `Apps/${name}.ns`;
    fs.mkdirSync(path.dirname(path.join(NS, dest)), { recursive: true });
    fs.writeFileSync(path.join(NS, dest), out);
  }
}

// 2) 编译
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
}
const read = (p) => { const fp = path.join(NS, p.replace(/^\//, '')); if (!fs.existsSync(fp)) return null; const text = fs.readFileSync(fp, 'utf8'); return { text, sig: sigOf(text) }; };
let ok = 0, bad = 0;
for (const fp of walk(NS)) {
  if (!fp.endsWith('.ns')) continue;
  const rel = '/' + path.relative(NS, fp).replace(/\\/g, '/');
  if (rel.startsWith('/System/lib/')) continue; // 库文件只被包含，不单独编译
  const text = fs.readFileSync(fp, 'utf8');
  try {
    const prog = compile(text, { name: rel, sig: sigOf(text), read, prelude: '/System/lib/sys.ns', natives });
    fs.writeFileSync(fp + 'x', JSON.stringify(prog));
    ok++;
  } catch (e) { console.error('编译失败', rel, e.message); bad++; }
}
console.log(`构建完成：${ok} 个程序编译成功，${bad} 个失败`);
if (bad) process.exitCode = 1;
