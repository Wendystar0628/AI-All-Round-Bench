// 签名：观测者 ID 的 Cookie、IP 的加盐哈希、定时任务与维护操作的口令、无感校验的小题。
// 密钥可以是一串或几串（逗号分隔，第一串是当前密钥，其余是轮换前的旧密钥，只用来认旧 Cookie）。
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ID = /^[A-Za-z0-9_-]{22}$/;
const POW_TTL_SECONDS = 300;

export function parseSecrets(secret) {
  const list = (Array.isArray(secret) ? secret : String(secret ?? '').split(','))
    .map(s => String(s).trim())
    .filter(Boolean);
  return list;
}

export function createSigner(secret) {
  const secrets = parseSecrets(secret);
  if (!secrets.length) secrets.push(randomBytes(32).toString('base64url'));   // 本地开发不给密钥时每次启动随机一串
  const mac = (key, text) => createHmac('sha256', key).update(text).digest('base64url');
  const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  return {
    newVoterId: () => randomBytes(16).toString('base64url'),

    /** Cookie 的值：<观测者 ID>.<当前密钥的签名> */
    cookieValue: id => `${id}.${mac(secrets[0], `voter:${id}`)}`,

    /** 认 Cookie：签名对得上任何一串密钥就算数；stale 表示是旧密钥签的，应当换发 */
    readCookie(value) {
      const [id, sig, rest] = String(value ?? '').split('.');
      if (rest !== undefined || !ID.test(id ?? '') || !sig) return null;
      const i = secrets.findIndex(s => same(mac(s, `voter:${id}`), sig));
      return i < 0 ? null : { id, stale: i > 0 };
    },

    ipHash: ip => mac(secrets[0], `ip:${ip}`).slice(0, 22),

    /** 定时对账和维护操作（经 /invoke 进来）要带的口令 */
    adminToken: () => mac(secrets[0], 'admin'),
    checkAdmin(token) {
      return typeof token === 'string' && same(token, mac(secrets[0], 'admin'));
    },

    /** 无感校验：发一道小题，题面自带时间和签名，不用存 */
    powChallenge(nowMs) {
      const body = `${Math.floor(nowMs / 1000).toString(36)}.${randomBytes(9).toString('base64url')}`;
      return `${body}.${mac(secrets[0], `pow:${body}`).slice(0, 22)}`;
    },
    /** 验答案：返回这道题的编号（用来保证一题只用一次），答错或过期返回 null */
    powCheck(challenge, nonce, difficulty, nowMs) {
      if (typeof challenge !== 'string' || typeof nonce !== 'string' || nonce.length > 64) return null;
      const [ts, id, sig, rest] = challenge.split('.');
      if (rest !== undefined || !ts || !id || !sig) return null;
      if (!same(sig, mac(secrets[0], `pow:${ts}.${id}`).slice(0, 22))) return null;
      const age = nowMs / 1000 - parseInt(ts, 36);
      if (!(age >= -5 && age <= POW_TTL_SECONDS)) return null;
      return leadingZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) >= difficulty ? id : null;
    },
  };
}

export function leadingZeroBits(buf) {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) { bits += 8; continue; }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}
