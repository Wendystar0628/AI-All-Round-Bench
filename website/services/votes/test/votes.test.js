// 函数的单元测试：真的起一个 HTTP 服务，用内存票箱（votes.md 第十一节）。  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createHandler } from '../src/handler.js';
import { createMemoryStore } from '../src/store/memory.js';
import { reconcile, purge } from '../src/reconcile.js';
import { createSigner, leadingZeroBits } from '../src/signing.js';

const VOTABLE = { updated: '2026-11-27T00:00:00Z', tasks: { 'vol-a': ['m1', 'm2', 'm3', 'm4'], 'vol-b': ['m1', 'm2'] } };
const NO_LIMITS = { ipPerMinute: 0, voterPerMinute: 0, newIdsPerIp: 0 };

async function start({ limits = {}, votable = VOTABLE, store = createMemoryStore(), ...rest } = {}) {
  let t = Date.UTC(2026, 10, 27, 12, 0, 30);
  let list = votable;
  const handle = createHandler({
    store,
    votable: () => (typeof list === 'function' ? list() : list),
    secret: 'test-secret',
    limits: { ...NO_LIMITS, ...limits },
    now: () => t,
    clientIp: req => req.headers['x-test-ip'] ?? '10.0.0.1',
    log: { error() {}, info() {} },
    ...rest,
  });
  const server = http.createServer(handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/votes/v1/aesthetics`;
  return {
    store, base,
    close: () => new Promise(r => server.close(r)),
    advance: ms => { t += ms; },
    setVotable: v => { list = v; },
    browser: (ip, cookie = '') => browser(base, ip, cookie),
  };
}

// 一个只记 Cookie 的小浏览器
function browser(base, ip, cookie) {
  async function req(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(cookie && { cookie }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(ip && { 'x-test-ip': ip }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, headers: res.headers, body: await res.json(), setCookie };
  }
  return {
    req,
    vote: (task, model, extra = {}) => req('POST', '/vote', { task, model, ...extra }),
    retract: (task, model) => req('DELETE', '/vote', { task, model }),
    me: () => req('GET', '/me'),
    tally: () => req('GET', '/tally'),
    get cookie() { return cookie; },
  };
}

test('计票：名单里的作品都列出，没票写 0；缓存 30 秒', async () => {
  const s = await start();
  const r = await s.browser().tally();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=30');
  assert.deepEqual(r.body.tasks, { 'vol-a': { m1: 0, m2: 0, m3: 0, m4: 0 }, 'vol-b': { m1: 0, m2: 0 } });
  assert.equal(r.body.voters, 0);
  assert.ok(!Number.isNaN(Date.parse(r.body.updated)));
  await s.close();
});

test('第一次投票发签名 Cookie；我的票和计票跟着变', async () => {
  const s = await start();
  const b = s.browser();
  assert.deepEqual((await b.me()).body, { votes: {} });
  const r = await b.vote('vol-a', 'm1');
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /^octa_voter=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}; Max-Age=63072000; Path=\/api\/votes\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(r.body.votes, ['m1']);
  assert.deepEqual(r.body.tally, { m1: 1, m2: 0, m3: 0, m4: 0 });
  assert.equal(r.body.voters, 1);
  const me = await b.me();
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.deepEqual(me.body, { votes: { 'vol-a': ['m1'] } });
  const t = (await b.tally()).body;
  assert.equal(t.tasks['vol-a'].m1, 1);
  assert.equal(t.voters, 1);
  assert.deepEqual(t.taskVoters, { 'vol-a': 1, 'vol-b': 0 });
  await s.close();
});

test('每卷两票的上限；十卷各自独立', async () => {
  const s = await start();
  const b = s.browser();
  assert.equal((await b.vote('vol-a', 'm1')).status, 200);
  assert.equal((await b.vote('vol-a', 'm2')).status, 200);
  const third = await b.vote('vol-a', 'm3');
  assert.equal(third.status, 409);
  assert.equal(third.body.error, 'limit_reached');
  assert.ok(third.body.message.zh && third.body.message.en);
  assert.deepEqual(third.body.votes, ['m1', 'm2']);
  assert.equal((await b.vote('vol-b', 'm1')).status, 200);   // 另一卷照常
  assert.deepEqual((await b.tally()).body.tasks['vol-a'], { m1: 1, m2: 1, m3: 0, m4: 0 });
  await s.close();
});

test('同一件作品不能投两次', async () => {
  const s = await start();
  const b = s.browser();
  await b.vote('vol-a', 'm1');
  const again = await b.vote('vol-a', 'm1');
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'already_voted');
  assert.equal((await b.tally()).body.tasks['vol-a'].m1, 1);
  await s.close();
});

test('撤回后能改投；撤回没投过的作品照实返回', async () => {
  const s = await start();
  const b = s.browser();
  await b.vote('vol-a', 'm1');
  await b.vote('vol-a', 'm2');
  const r = await b.retract('vol-a', 'm1');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.votes, ['m2']);
  assert.equal(r.body.tally.m1, 0);
  const re = await b.vote('vol-a', 'm3');
  assert.equal(re.status, 200);
  assert.deepEqual(re.body.votes, ['m2', 'm3']);
  assert.deepEqual(re.body.tally, { m1: 0, m2: 1, m3: 1, m4: 0 });
  const noop = await b.retract('vol-a', 'm4');
  assert.equal(noop.status, 200);
  assert.deepEqual(noop.body.votes, ['m2', 'm3']);
  // 一卷的票全撤回，本卷和专题的观测者数都减一
  await b.retract('vol-a', 'm2');
  const last = await b.retract('vol-a', 'm3');
  assert.equal(last.body.voters, 0);
  assert.equal((await b.tally()).body.voters, 0);
  await s.close();
});

test('名单外的作品不收；名单读不到时计票为空、一律不收', async () => {
  const s = await start();
  const b = s.browser();
  for (const [task, model] of [['vol-a', 'm9'], ['vol-z', 'm1'], ['vol-b', 'm3']]) {
    const r = await b.vote(task, model);
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'not_votable');
  }
  assert.equal((await b.retract('vol-a', 'm9')).body.error, 'not_votable');
  await b.vote('vol-a', 'm1');
  s.setVotable(() => { throw new Error('missing'); });
  const t = await b.tally();
  assert.equal(t.status, 200);
  assert.deepEqual(t.body.tasks, {});
  assert.equal((await b.vote('vol-a', 'm2')).body.error, 'not_votable');
  assert.deepEqual((await b.me()).body, { votes: {} });
  s.setVotable(null);
  assert.deepEqual((await b.tally()).body.tasks, {});
  await s.close();
});

test('撤下的作品：旧票不计入显示，也不占孔位；再投时从票上清掉', async () => {
  const s = await start();
  const b = s.browser();
  await b.vote('vol-a', 'm1');
  await b.vote('vol-a', 'm2');
  s.setVotable({ tasks: { 'vol-a': ['m2', 'm3', 'm4'] } });
  assert.deepEqual((await b.me()).body.votes, { 'vol-a': ['m2'] });
  assert.equal('m1' in (await b.tally()).body.tasks['vol-a'], false);
  const r = await b.vote('vol-a', 'm3');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.votes, ['m2', 'm3']);
  s.setVotable(VOTABLE);   // 重新上架：m1 的那一票已经清掉了
  assert.deepEqual((await b.me()).body.votes, { 'vol-a': ['m2', 'm3'] });
  assert.equal((await b.tally()).body.tasks['vol-a'].m1, 0);
  await s.close();
});

test('并发投第三票时只成功两票', async () => {
  const s = await start();
  const b = s.browser();
  await b.vote('vol-b', 'm1');   // 先领到观测者 ID
  for (let round = 0; round < 5; round++) {
    const results = await Promise.all(['m1', 'm2', 'm3', 'm4'].map(m => b.vote('vol-a', m)));
    assert.equal(results.filter(r => r.status === 200).length, 2);
    assert.equal(results.filter(r => r.status === 409 && r.body.error === 'limit_reached').length, 2);
    assert.equal((await b.me()).body.votes['vol-a'].length, 2);
    const tally = (await b.tally()).body.tasks['vol-a'];
    assert.equal(Object.values(tally).reduce((a, n) => a + n, 0), 2);
    for (const m of (await b.me()).body.votes['vol-a']) await b.retract('vol-a', m);
  }
  // 两个标签页同时投同一件：只记一票
  const same = await Promise.all([b.vote('vol-a', 'm1'), b.vote('vol-a', 'm1'), b.vote('vol-a', 'm1')]);
  assert.equal(same.filter(r => r.status === 200).length, 1);
  assert.equal((await b.tally()).body.tasks['vol-a'].m1, 1);
  await s.close();
});

test('限频：按观测者 ID 和按 IP 每分钟的次数，带 Retry-After', async () => {
  const s = await start({ limits: { voterPerMinute: 3, ipPerMinute: 5 } });
  const b = s.browser('10.0.0.2');
  assert.equal((await b.vote('vol-a', 'm1')).status, 200);   // 领 ID 这一次不算观测者 ID 的次数
  assert.equal((await b.retract('vol-a', 'm1')).status, 200);
  assert.equal((await b.vote('vol-a', 'm1')).status, 200);
  assert.equal((await b.retract('vol-a', 'm1')).status, 200);
  const r = await b.vote('vol-a', 'm1');
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'rate_limited');
  assert.equal(r.body.message.zh, '投得太快了，稍等一下再试。');
  assert.equal(r.headers.get('retry-after'), '30');
  s.advance(30_000);
  assert.equal((await b.vote('vol-a', 'm1')).status, 200);
  // 同一个 IP 上换不同的浏览器，也挡在每分钟 5 次
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await s.browser('10.0.0.3').vote('vol-a', 'm2')).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  await s.close();
});

test('同一个 IP 一段时间里只能领有限个新 ID', async () => {
  const s = await start({ limits: { newIdsPerIp: 2, newIdWindowSeconds: 3600 } });
  assert.equal((await s.browser('10.0.0.4').vote('vol-a', 'm1')).status, 200);
  assert.equal((await s.browser('10.0.0.4').vote('vol-a', 'm1')).status, 200);
  const third = await s.browser('10.0.0.4').vote('vol-a', 'm1');
  assert.equal(third.status, 429);
  assert.equal(third.setCookie, null);
  const kept = s.browser('10.0.0.4');
  assert.equal((await s.browser('10.0.0.5').vote('vol-a', 'm1')).status, 200);   // 别的 IP 照常
  s.advance(3600_000);
  assert.equal((await kept.vote('vol-a', 'm1')).status, 200);
  assert.equal((await s.browser('10.0.0.4').tally()).body.tasks['vol-a'].m1, 4);
  await s.close();
});

test('伪造或改过的 Cookie 不认；旧密钥签的 Cookie 认并换发', async () => {
  const store = createMemoryStore();
  const s = await start({ store });
  const b = s.browser();
  await b.vote('vol-a', 'm1');
  const [name, value] = b.cookie.split('=');
  const forged = s.browser('', `${name}=${value.slice(0, -2)}xx`);
  assert.deepEqual((await forged.me()).body.votes, {});
  const r = await forged.vote('vol-a', 'm1');   // 当成新观测者
  assert.equal(r.status, 200);
  assert.notEqual(forged.cookie, b.cookie);
  await s.close();

  // 轮换密钥：新密钥在前，旧密钥在后
  const rotated = await start({ store, secret: ['new-secret', 'test-secret'] });
  const old = rotated.browser('', b.cookie);
  const me = await old.me();
  assert.deepEqual(me.body.votes, { 'vol-a': ['m1'] });
  assert.ok(me.setCookie, '换发了新签名的 Cookie');
  assert.notEqual(old.cookie, b.cookie);
  assert.equal((await old.vote('vol-a', 'm1')).body.error, 'already_voted');
  await rotated.close();
});

test('对账能修正计票', async () => {
  const s = await start();
  const a = s.browser(), b = s.browser();
  await a.vote('vol-a', 'm1');
  await a.vote('vol-a', 'm2');
  await b.vote('vol-a', 'm1');
  await b.vote('vol-b', 'm2');
  // 模拟加一失败、多加、残留
  await s.store.addTally('aesthetics:vol-a', 'm1', -1);
  await s.store.addTally('aesthetics:vol-a', 'm3', 4);
  await s.store.addTally('aesthetics:vol-a', '~voters', 3);
  await s.store.addTally('aesthetics', '~voters', -2);
  const res = await reconcile(s.store);
  assert.equal(res.skipped, 0);
  assert.ok(res.fixed >= 4);
  const t = (await a.tally()).body;
  assert.deepEqual(t.tasks, { 'vol-a': { m1: 2, m2: 1, m3: 0, m4: 0 }, 'vol-b': { m1: 0, m2: 1 } });
  assert.deepEqual(t.taskVoters, { 'vol-a': 2, 'vol-b': 1 });
  assert.equal(t.voters, 2);
  assert.equal((await reconcile(s.store)).fixed, 0);   // 再跑一遍没有可改的
  await s.close();
});

test('对账时计数刚被改过的那一行跳过，不盖掉新票', async () => {
  const store = createMemoryStore();
  const s = await start({ store });
  await s.browser().vote('vol-a', 'm1');
  await store.addTally('aesthetics:vol-a', 'm1', 5);
  const realSet = store.setTally;
  store.setTally = async (...args) => { await store.addTally('aesthetics:vol-a', 'm1', 1); store.setTally = realSet; return realSet(...args); };
  const res = await reconcile(store);
  assert.equal(res.skipped, 1);
  await s.close();
});

test('清票：删掉一卷的票和只为这一卷来的观测者，再对账', async () => {
  const s = await start({ limits: { ipPerMinute: 100 } });
  const a = s.browser(), b = s.browser();
  await a.vote('vol-a', 'm1');
  await a.vote('vol-b', 'm1');
  await b.vote('vol-a', 'm2');
  const res = await purge(s.store, { topic: 'aesthetics', task: 'vol-a', limits: true });
  assert.equal(res.votesRemoved, 2);
  assert.equal(res.votersRemoved, 1);
  assert.ok(res.limitsCleared > 0);
  const t = (await a.tally()).body;
  assert.deepEqual(t.tasks['vol-a'], { m1: 0, m2: 0, m3: 0, m4: 0 });
  assert.equal(t.voters, 1);
  const { ballots, voters, tallies } = s.store._dump();
  assert.equal(ballots.size, 1);
  assert.equal(voters.size, 1);
  assert.equal([...tallies.values()].filter(r => r.task === 'aesthetics:vol-a').length, 0);
  await s.close();
});

test('正文不对回 400；路径不对 404；方法不对 405；别的路径交给 next', async () => {
  const s = await start();
  const b = s.browser();
  const cases = [
    await b.req('POST', '/vote', '{"task":', {}),
    await b.req('POST', '/vote', { task: 'vol-a' }),
    await b.req('POST', '/vote', { task: 'Vol A', model: 'm1' }),
    await b.req('POST', '/vote', 'task=vol-a&model=m1', { 'content-type': 'application/x-www-form-urlencoded' }),
    await b.req('POST', '/vote', { task: 'vol-a', model: 'm1', pad: 'x'.repeat(5000) }),
  ];
  for (const r of cases) {
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'bad_request');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await b.req('GET', '/nope')).body.error, 'not_found');
  const m = await b.req('PUT', '/vote', { task: 'vol-a', model: 'm1' });
  assert.equal(m.status, 405);
  assert.equal(m.headers.get('allow'), 'POST, DELETE');
  assert.equal((await fetch(s.base.replace('/aesthetics', '/other') + '/tally')).status, 404);
  await s.close();

  const handle = createHandler({ votable: VOTABLE, log: { error() {} } });
  let passed = false;
  await handle({ url: '/aesthetics/index.html', headers: {} }, {}, () => { passed = true; });
  assert.ok(passed);
});

test('票箱关闭时投票回 503，计票照常', async () => {
  const s = await start({ closed: true });
  const b = s.browser();
  const r = await b.vote('vol-a', 'm1');
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'closed');
  assert.equal((await b.tally()).status, 200);
  await s.close();
});

test('存储出错时回 503 closed', async () => {
  const store = createMemoryStore();
  store.listTallies = async () => { throw new Error('down'); };
  const s = await start({ store });
  const r = await s.browser().tally();
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'closed');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  await s.close();
});

test('无感校验打开时：先答题再投票，一题只能用一次', async () => {
  const s = await start({ pow: 8 });
  const b = s.browser();
  const me = await b.me();
  assert.equal(me.body.pow.difficulty, 8);
  const r = await b.vote('vol-a', 'm1');
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'pow_required');
  const { challenge } = r.body.pow;
  let nonce = 0;
  while (leadingZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) < 8) nonce++;
  const ok = await b.vote('vol-a', 'm1', { pow: { challenge, nonce: String(nonce) } });
  assert.equal(ok.status, 200);
  const reused = await b.vote('vol-a', 'm2', { pow: { challenge, nonce: String(nonce) } });
  assert.equal(reused.body.error, 'pow_required');
  assert.equal((await b.retract('vol-a', 'm1')).status, 200);   // 撤回不用答题
  await s.close();
});

test('签名：口令和 Cookie 只认对的密钥', () => {
  const a = createSigner('one'), b = createSigner('two');
  assert.ok(a.checkAdmin(a.adminToken()));
  assert.ok(!b.checkAdmin(a.adminToken()));
  assert.ok(!a.checkAdmin(undefined));
  const id = a.newVoterId();
  assert.deepEqual(a.readCookie(a.cookieValue(id)), { id, stale: false });
  assert.equal(b.readCookie(a.cookieValue(id)), null);
  assert.equal(a.readCookie('garbage'), null);
});

test('跨源：列出的来源能带凭证调用，预检回 204；别的来源不给放行头', async () => {
  const site = 'https://octathlon.wendystars.com';
  const s = await start({ cors: [site] });
  const pre = await fetch(`${s.base}/vote`, { method: 'OPTIONS', headers: { origin: site, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), site);
  assert.equal(pre.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, POST, DELETE');
  assert.equal(pre.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(pre.headers.get('vary'), 'Origin');

  const b = s.browser('', '');
  const r = await b.req('POST', '/vote', { task: 'vol-a', model: 'm1' }, { origin: site });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), site);
  assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(r.headers.get('vary'), 'Origin');
  const t = await b.req('GET', '/tally', undefined, { origin: site });
  assert.equal(t.headers.get('access-control-allow-origin'), site);
  assert.equal(t.headers.get('cache-control'), 'public, max-age=30');
  const limited = await b.req('POST', '/vote', { task: 'vol-a', model: 'm1' }, { origin: site });
  assert.equal(limited.headers.get('access-control-allow-origin'), site);   // 错误回复也带，前端才读得到

  const evil = await fetch(`${s.base}/vote`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(evil.status, 204);
  assert.equal(evil.headers.get('access-control-allow-origin'), site);   // 对不上请求的来源，浏览器就拦下
  assert.equal(evil.headers.get('access-control-allow-credentials'), null);
  assert.equal(evil.headers.get('access-control-allow-methods'), null);
  const evilGet = await s.browser().req('GET', '/tally', undefined, { origin: 'https://evil.example' });
  assert.equal(evilGet.headers.get('access-control-allow-origin'), site);
  assert.equal(evilGet.headers.get('vary'), 'Origin');
  await s.close();
});
