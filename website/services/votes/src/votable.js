// 能投的名单：{"updated", "tasks": {"<卷 key>": ["<型号 id>", …]}}（votes.md 第 9.2 节）。
// 来源可以是网址（缓存几分钟）、函数（同步或异步，每次都调用）或现成的对象。
// 读不到或格式不对就是 null：计票为空，投票一律 not_votable。
export const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isId = v => typeof v === 'string' && v.length <= 64 && ID.test(v);

/** 把名单整理成 {updated, tasks: Map<卷 key, Set<型号 id>>}；格式不对返回 null */
export function normalizeVotable(data) {
  if (!data || typeof data !== 'object' || !data.tasks || typeof data.tasks !== 'object' || Array.isArray(data.tasks)) return null;
  const tasks = new Map();
  for (const [task, models] of Object.entries(data.tasks)) {
    if (!isId(task) || !Array.isArray(models)) return null;
    const set = new Set();
    for (const m of models) {
      if (!isId(m)) return null;
      set.add(m);
    }
    tasks.set(task, set);
  }
  return { updated: data.updated ?? null, tasks };
}

/**
 * @param {string|Function|object|{get: Function}} source
 * @param {{ttlSeconds?: number, staleSeconds?: number, now?: () => number, fetch?: typeof fetch, log?: Console}} [opts]
 * @returns {{get(): Promise<{updated, tasks: Map<string, Set<string>>}|null>}}
 */
export function createVotable(source, { ttlSeconds = 180, staleSeconds = 1800, now = Date.now, fetch: fetchImpl = globalThis.fetch, log = console } = {}) {
  if (source && typeof source.get === 'function') return source;
  if (typeof source === 'function') {
    return {
      async get() {
        try { return normalizeVotable(await source()); }
        catch (e) { log.error?.(JSON.stringify({ at: 'votable', error: String(e?.message ?? e) })); return null; }
      },
    };
  }
  if (typeof source !== 'string') {
    const fixed = normalizeVotable(source);
    return { get: async () => fixed };
  }

  // 网址：成功的结果缓存 ttlSeconds；取失败时，网址明确回 4xx 就关（名单被撤了），
  // 网络出错或 5xx 时沿用最近一次成功的名单，最多 staleSeconds，再久就关。
  let good = null, goodAt = 0, failedAt = -Infinity, pending = null;
  async function load() {
    try {
      const res = await fetchImpl(source, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        if (res.status < 500) good = null;
        throw new Error(`HTTP ${res.status}`);
      }
      const list = normalizeVotable(await res.json());
      if (!list) { good = null; throw new Error('format'); }
      good = list; goodAt = now();
    } catch (e) {
      failedAt = now();
      log.error?.(JSON.stringify({ at: 'votable', url: source, error: String(e?.message ?? e) }));
    }
  }
  return {
    async get() {
      const t = now();
      const fresh = good && t - goodAt < ttlSeconds * 1000;
      const retryLater = t - failedAt < 30_000;   // 失败后 30 秒内不再重取
      if (!fresh && !retryLater) {
        pending ??= load().finally(() => { pending = null; });
        await pending;
      }
      return good && now() - goodAt < (ttlSeconds + staleSeconds) * 1000 ? good : null;
    },
  };
}
