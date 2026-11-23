// 读取 ns/ 目录为系统映像（Map: 路径 -> 文本）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NS_DIR = path.join(ROOT, 'ns');
export function loadImageFiles() {
  const m = new Map();
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else m.set('/' + path.relative(NS_DIR, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8'));
    }
  };
  walk(NS_DIR);
  return m;
}
