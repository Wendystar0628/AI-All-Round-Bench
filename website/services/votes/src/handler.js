// 观测者票选的请求处理：函数计算和网站的 Vite 开发服务器跑的是同一个处理函数。
//
//   import { createHandler } from '.../services/votes/src/handler.js';
//   import { createMemoryStore } from '.../services/votes/src/store/memory.js';
//   const handle = createHandler({ store: createMemoryStore(), votable: () => readVotableJson() });
//   server.middlewares.use(handle);          // (req, res, next)：不是 /api/votes/ 的请求交给 next
//
// 接口（votes.md 第 10.2 节）：
//   GET    /api/votes/v1/<专题>/tally   全部计票，Cache-Control: public, max-age=30
//   GET    /api/votes/v1/<专题>/me      这位观测者投了什么，no-store
//   POST   /api/votes/v1/<专题>/vote    投一票  {task, model}
//   DELETE /api/votes/v1/<专题>/vote    撤回一票 {task, model}
//   OPTIONS 以上任一路径                 跨源预检（cors 里列出的来源）
import { VoteError, errorBody, errorStatus } from './errors.js';
import { createRules } from './rules.js';
import { createSigner } from './signing.js';
import { createVotable, isId } from './votable.js';
import { createMemoryStore } from './store/memory.js';

export const COOKIE = 'octa_voter';
const COOKIE_MAX_AGE = 2 * 365 * 24 * 3600;
const MAX_BODY = 4096;

/** 限频与新 ID 上限的默认值；≤ 0 表示不限 */
export const DEFAULT_LIMITS = Object.freeze({
  ipPerMinute: 60,          // 同一 IP 每分钟最多投票加撤回几次
  voterPerMinute: 20,       // 同一观测者 ID 每分钟最多投票加撤回几次
  newIdsPerIp: 20,          // 同一 IP 在一个时间窗里最多领几个新观测者 ID
  newIdWindowSeconds: 3600, // 上面那个时间窗的长度（秒，最长 86400）
});

const defaultClientIp = req => req.socket?.remoteAddress ?? '';

/**
 * @param {object} o
 * @param {object} [o.store]    存储接口的一种实现；不给就用内存票箱
 * @param {string|Function|object} o.votable  能投的名单：网址、返回名单的函数（同步或异步）、或名单对象
 * @param {string|string[]} [o.secret]  签名密钥；可给几串，第一串是当前的。不给就每次启动随机一串（本地开发）
 * @param {Partial<typeof DEFAULT_LIMITS>} [o.limits]
 * @param {() => number} [o.now]  当前时间（毫秒）
 * @param {string} [o.topic]      专题，接口前缀 /api/votes/v1/<topic>/
 * @param {(req) => string} [o.clientIp]  取观测者 IP
 * @param {boolean|(() => boolean)} [o.closed]  票箱关闭：投票和撤回回 503 closed
 * @param {number} [o.pow]  无感校验的难度（前导零位数），0 为关
 * @param {boolean} [o.cookieSecure]  Cookie 带 Secure（默认带；localhost 上浏览器也认）
 * @param {string[]} [o.cors]  允许带凭证跨源调用的来源，如 ['https://octathlon.wendystars.com']；同源挂载时不用给
 */
export function createHandler({
  store = createMemoryStore(),
  votable,
  secret,
  limits = {},
  now = Date.now,
  topic = 'aesthetics',
  clientIp = defaultClientIp,
  closed = false,
  pow = 0,
  cookieSecure = true,
  cors = [],
  log = console,
} = {}) {
  const origins = new Set(cors);
  const lim = { ...DEFAULT_LIMITS, ...limits };
  lim.newIdWindowSeconds = Math.min(Math.max(1, lim.newIdWindowSeconds), 86400);
  const signer = createSigner(secret);
  const list = createVotable(votable, { now, log });
  const rules = createRules({ store, votable: list, topic, now });
  const base = `/api/votes/v1/${topic}/`;
  const isClosed = typeof closed === 'function' ? closed : () => !!closed;
  const powOn = () => pow > 0;

  async function limit(key, windowSeconds, max) {
    if (!(max > 0)) return;
    const t = now() / 1000;
    const w = Math.floor(t / windowSeconds);
    if (await store.hit(key, w) > max) {
      throw new VoteError('rate_limited', { retryAfter: Math.max(1, Math.ceil((w + 1) * windowSeconds - t)) });
    }
  }

  const powBody = () => ({ challenge: signer.powChallenge(now()), difficulty: pow });
  async function checkPow(answer) {
    const id = signer.powCheck(answer?.challenge, answer?.nonce, pow, now());
    if (!id || await store.hit(`pow:${id}`, 0) !== 1) throw new VoteError('pow_required', { pow: powBody() });
  }

  function cookie(res, id) {
    res.setHeader('Set-Cookie', `${COOKIE}=${signer.cookieValue(id)}; Max-Age=${COOKIE_MAX_AGE}; Path=/api/votes/; HttpOnly;${cookieSecure ? ' Secure;' : ''} SameSite=Lax`);
  }

  function readVoter(req) {
    for (const part of String(req.headers.cookie ?? '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === COOKIE) {
        const v = signer.readCookie(part.slice(i + 1).trim());
        if (v) return v;
      }
    }
    return null;
  }

  async function readBallotRequest(req) {
    let data = req.body;
    if (!data || typeof data !== 'object' || Buffer.isBuffer(data)) {
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) throw new VoteError('bad_request');
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > MAX_BODY) throw new VoteError('bad_request');
        chunks.push(c);
      }
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new VoteError('bad_request'); }
    }
    if (!data || typeof data !== 'object' || !isId(data.task) || !isId(data.model)) throw new VoteError('bad_request');
    return data;
  }

  async function ballot(req, res, method) {
    if (isClosed()) throw new VoteError('closed');
    const { task, model, pow: answer } = await readBallotRequest(req);
    if (!rules.allowed(await list.get(), task, model)) throw new VoteError('not_votable');

    const ipHash = signer.ipHash(clientIp(req) || 'unknown');
    await limit(`ip:${ipHash}`, 60, lim.ipPerMinute);
    let voter = readVoter(req)?.id ?? null;
    if (voter) await limit(`voter:${voter}`, 60, lim.voterPerMinute);

    if (method === 'DELETE') {
      const body = await rules.retract(voter, task, model);
      if (voter) cookie(res, voter);
      return body;
    }
    if (powOn()) await checkPow(answer);
    if (!voter) {
      await limit(`newid:${ipHash}`, lim.newIdWindowSeconds, lim.newIdsPerIp);
      voter = signer.newVoterId();
      await store.createVoter(voter, { issued: now(), ipHash });
    }
    const body = await rules.vote(voter, task, model);
    cookie(res, voter);
    return body;
  }

  return async function handle(req, res, next) {
    const path = String(req.originalUrl ?? req.url ?? '/').split('?')[0];
    if (!path.startsWith('/api/votes/')) {
      if (typeof next === 'function') return next();
      return send(res, 404, errorBody('not_found'));
    }
    const route = path.startsWith(base) ? path.slice(base.length) : null;
    const method = req.method;
    // 跨源：只对列出的来源回 Access-Control-Allow-Origin，并允许带 Cookie；回复随来源而变。
    // 别的来源也回一个固定的（列表里的第一个）：函数计算会给回复里缺的跨源头补默认值，其中 Allow-Origin
    // 是把请求的 Origin 原样填回；回一个固定值，浏览器比对不上来源就拦下。
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    } else if (origin && origins.size) {
      res.setHeader('Access-Control-Allow-Origin', origins.values().next().value);
    }
    if (method === 'OPTIONS') {
      if (origin && origins.has(origin)) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
      }
      res.statusCode = 204;
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    try {
      if (route === 'tally') {
        if (method !== 'GET') throw new VoteError('method_not_allowed');
        return send(res, 200, await rules.tally(), 'public, max-age=30');
      }
      if (route === 'me') {
        if (method !== 'GET') throw new VoteError('method_not_allowed');
        const v = readVoter(req);
        const body = await rules.me(v?.id);
        if (v?.stale) cookie(res, v.id);   // 旧密钥签的：换发
        if (powOn()) body.pow = powBody();
        return send(res, 200, body);
      }
      if (route === 'vote') {
        if (method !== 'POST' && method !== 'DELETE') throw new VoteError('method_not_allowed');
        return send(res, 200, await ballot(req, res, method));
      }
      throw new VoteError('not_found');
    } catch (e) {
      if (e instanceof VoteError) {
        const { retryAfter, ...extra } = e.extra;
        if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
        if (e.code === 'method_not_allowed') res.setHeader('Allow', route === 'vote' ? 'POST, DELETE' : 'GET');
        return send(res, errorStatus(e.code), errorBody(e.code, retryAfter ? { ...extra, retryAfter } : extra));
      }
      log.error?.(JSON.stringify({ at: 'handler', path, method, error: String(e?.stack ?? e) }));
      return send(res, 503, errorBody('closed'));
    }
  };
}

function send(res, status, body, cacheControl = 'no-store') {
  if (res.headersSent) return;
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', Buffer.byteLength(text));
  res.end(text);
}
