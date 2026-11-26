// 维护操作：经 s invoke 发一个带口令的事件给线上函数（POST /invoke）。
//   node tools/admin.mjs reconcile                                   立即对账一次
//   node tools/admin.mjs purge --task <卷key> [--model <型号id>] [--limits]
//                                                                    清掉一卷（或其中一件作品）的票后对账；--limits 顺带清空限频计数
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACCESS, FUNCTION, REGION, loadSecrets, runS } from './common.mjs';

const [op, ...rest] = process.argv.slice(2);
const event = { op };
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--task') event.task = rest[++i];
  else if (rest[i] === '--model') event.model = rest[++i];
  else if (rest[i] === '--topic') event.topic = rest[++i];
  else if (rest[i] === '--limits') event.limits = true;
  else throw new Error(`不认识的参数 ${rest[i]}`);
}
if (op !== 'reconcile' && !(op === 'purge' && event.task)) {
  console.error('用法：node tools/admin.mjs reconcile | purge --task <卷key> [--model <型号id>] [--limits]');
  process.exit(2);
}

const { secrets, signer } = loadSecrets();
event.token = signer.adminToken();
const dir = mkdtempSync(join(tmpdir(), 'votes-admin-'));
const file = join(dir, 'event.json');
try {
  writeFileSync(file, JSON.stringify(event), { mode: 0o600 });
  await runS(['cli', 'fc3', 'invoke', '-a', ACCESS, '--region', REGION, '--function-name', FUNCTION, '-f', `"${file}"`], { hidden: [...secrets, event.token] });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
