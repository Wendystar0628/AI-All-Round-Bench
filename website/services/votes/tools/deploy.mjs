// 部署：node tools/deploy.mjs [--votable-override <名单.json>] [-- <s deploy 的其他参数>]
// 从 .secret 取签名密钥（没有就生成），算出定时对账的口令，作为环境变量交给 s deploy -a octathlon。
// --votable-override 只在测试时用：函数改读这份名单，不读 VOTABLE_URL。不带它就恢复读线上名单。
import { readFileSync } from 'node:fs';
import { ACCESS, loadSecrets, runS } from './common.mjs';

const args = process.argv.slice(2);
const passIndex = args.indexOf('--');
const extra = passIndex < 0 ? [] : args.slice(passIndex + 1);
const own = passIndex < 0 ? args : args.slice(0, passIndex);
let override = '';
for (let i = 0; i < own.length; i++) {
  if (own[i] === '--votable-override') override = JSON.stringify(JSON.parse(readFileSync(own[++i], 'utf8')));
  else throw new Error(`不认识的参数 ${own[i]}`);
}

const { secrets, signer } = loadSecrets();
const token = signer.adminToken();
await runS(['deploy', '-a', ACCESS, '-y', ...extra], {
  env: {
    VOTES_SECRET: secrets.join(','),
    VOTES_RECONCILE_PAYLOAD: JSON.stringify({ op: 'reconcile', token }),
    VOTABLE_OVERRIDE: override,
  },
  hidden: [...secrets, token],
});
console.log(override ? '已部署（测试名单）。' : '已部署（读线上名单 VOTABLE_URL）。');
