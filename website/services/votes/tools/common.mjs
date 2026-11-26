// deploy.mjs 和 admin.mjs 共用：本地签名密钥文件、调用 s 并遮掉输出里的密钥。
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSigner, parseSecrets } from '../src/signing.js';

export const SERVICE = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SECRET_FILE = join(SERVICE, '.secret');
export const ACCESS = 'octathlon';
export const REGION = 'cn-hangzhou';
export const FUNCTION = 'octathlon-votes';

/** 读 .secret：一行一串，第一行是当前密钥，往下是轮换前的旧密钥；# 开头是注释。没有文件就生成一串。 */
export function loadSecrets() {
  if (!existsSync(SECRET_FILE)) {
    writeFileSync(SECRET_FILE, `${randomBytes(32).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
    console.log('已生成签名密钥：website/services/votes/.secret（不进 git，不要外传）');
  }
  const secrets = parseSecrets(readFileSync(SECRET_FILE, 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('#')));
  if (!secrets.length) throw new Error('.secret 里没有密钥');
  return { secrets, signer: createSigner(secrets) };
}

/** 跑 s，把输出里出现的任何一串 hidden 换成 ****** 再打印 */
export function runS(args, { env = {}, hidden = [] } = {}) {
  // 连同每串的前后 16 个字符一起遮：输出折行把一串拆开时也露不出来
  const words = hidden.filter(h => h && h.length >= 16).flatMap(h => [h, h.slice(0, 16), h.slice(-16)]);
  const redact = text => words.reduce((t, w) => t.split(w).join('******'), text);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(['s', ...args].join(' '), { cwd: SERVICE, shell: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const pipe = (stream, sink) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        buf += chunk;
        const cut = buf.lastIndexOf('\n');
        if (cut < 0) return;
        const lines = redact(buf.slice(0, cut + 1));
        buf = buf.slice(cut + 1);
        out += lines;
        sink.write(lines);
      });
      stream.on('end', () => { if (buf) { const rest = redact(buf); out += rest; sink.write(rest); } });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on('error', reject);
    child.on('close', code => {
      scrubLogs(started, redact);
      return code ? reject(new Error(`s ${args[0]} 退出码 ${code}`)) : resolve(out);
    });
  });
}

// s 会把这次运行的完整日志（含环境变量）写进 ~/.s/logs/<时间>/，这里把其中的密钥原地遮掉
const LOGS = join(homedir(), '.s', 'logs');
function scrubLogs(since, redact) {
  if (!existsSync(LOGS)) return;
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const entry of readdirSync(LOGS, { withFileTypes: true })) {
    const dir = join(LOGS, entry.name);
    if (!entry.isDirectory() || statSync(dir).mtimeMs < since - 60_000) continue;
    for (const file of walk(dir)) {
      const text = readFileSync(file, 'utf8');
      const clean = redact(text);
      if (clean !== text) writeFileSync(file, clean);
    }
  }
}
