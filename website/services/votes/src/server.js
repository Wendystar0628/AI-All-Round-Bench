// 函数计算 3.0 的入口：自定义运行时里的一个 HTTP 服务（customRuntimeConfig.port）。
// - HTTP 触发器的请求原样转进来，交给 createHandler；
// - 定时触发器和 s invoke 的事件请求是 POST /invoke，正文里带口令（见 README「对账」「清票」）。
// Tablestore 用函数角色的临时密钥：每个请求的 x-fc-access-key-id 等请求头里有最新的一份，
// 没有时退回实例环境变量 ALIBABA_CLOUD_ACCESS_KEY_ID 等。
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHandler } from './handler.js';
import { readConfig } from './config.js';
import { createVotable } from './votable.js';
import { createSigner } from './signing.js';
import { createTablestore } from './store/tablestore.js';
import { purge, reconcile } from './reconcile.js';

const cfg = readConfig(process.env);
if (!cfg.secret) throw new Error('VOTES_SECRET 没有设置');

const requestCredentials = new AsyncLocalStorage();
function credentials() {
  const h = requestCredentials.getStore();
  if (h?.['x-fc-access-key-id'] && h['x-fc-access-key-secret']) {
    return { accessKeyId: h['x-fc-access-key-id'], accessKeySecret: h['x-fc-access-key-secret'], securityToken: h['x-fc-security-token'] };
  }
  const e = process.env;
  return { accessKeyId: e.ALIBABA_CLOUD_ACCESS_KEY_ID, accessKeySecret: e.ALIBABA_CLOUD_ACCESS_KEY_SECRET, securityToken: e.ALIBABA_CLOUD_SECURITY_TOKEN };
}

// 观测者 IP：函数计算会把它看到的对端地址追加在 x-forwarded-for 的最右边，客户端伪造的只能出现在左边，
// 所以默认取最右一项（接口域名前面没有 CDN）。以后前面加了 CDN，再用 CLIENT_IP_HEADER 指定 CDN 给的真实 IP 头。
function clientIp(req) {
  if (cfg.ipHeader && req.headers[cfg.ipHeader]) return String(req.headers[cfg.ipHeader]).split(',')[0].trim();
  const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : (req.socket.remoteAddress ?? '');
}

const store = createTablestore({ ...cfg.ots, credentials });
const signer = createSigner(cfg.secret);
const handle = createHandler({
  store,
  votable: createVotable(cfg.votable, { ttlSeconds: cfg.votableCacheSeconds }),
  secret: cfg.secret,
  limits: cfg.limits,
  topic: cfg.topic,
  clientIp,
  closed: cfg.closed,
  pow: cfg.pow,
  cors: cfg.cors,
});

// 事件：{"op": "reconcile", "token"} 对账；{"op": "purge", "token", "task", "model"?, "limits"?} 清票后对账。
// 定时触发器把这段 JSON 放在 payload 里；s invoke 直接把它当正文。
async function onEvent(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let event = {};
  try { event = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* 下面按口令不对处理 */ }
  if (typeof event.payload === 'string') { try { event = JSON.parse(event.payload); } catch { event = {}; } }
  const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (!signer.checkAdmin(event.token)) return reply(403, { error: 'forbidden' });
  try {
    const started = Date.now();
    let result;
    if (event.op === 'reconcile') result = await reconcile(store);
    else if (event.op === 'purge' && typeof event.task === 'string') {
      result = await purge(store, { topic: event.topic || cfg.topic, task: event.task, model: event.model ?? null, limits: !!event.limits });
    } else return reply(400, { error: 'unknown op' });
    const body = { op: event.op, ms: Date.now() - started, ...result };
    console.log(JSON.stringify({ at: 'event', ...body }));
    return reply(200, body);
  } catch (err) {
    console.error(JSON.stringify({ at: 'event', op: event.op, error: String(err?.stack ?? err) }));
    return reply(500, { error: 'failed' });
  }
}

http.createServer((req, res) => {
  requestCredentials.run(req.headers, () => {
    if (req.method === 'POST' && req.url.split('?')[0] === '/invoke') return onEvent(req, res);
    return handle(req, res);
  });
}).listen(cfg.port, () => console.log(JSON.stringify({ at: 'start', port: cfg.port, topic: cfg.topic })));
