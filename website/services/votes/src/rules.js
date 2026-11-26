// 投票规则，写在存储接口之上，Tablestore 和内存两种实现共用（votes.md 第二节、第 9.1 节、第 10.3 节）。
// - 每卷最多两票，投给两件不同的作品；可以撤回，撤回后能改投。
// - 只收名单里的作品；不在名单里的旧票留在库里、不计入显示，也不占这一卷的两个孔位：
//   这一卷再投新票时，旧票才从这张观测者票上清掉。
// - 先按版本号条件写 ballots，成功后再给 tallies 原子加一；中间失败由每日对账从 ballots 重算。
import { VoteError } from './errors.js';

export const VOTES_PER_TASK = 2;
export const VOTERS = '~voters';   // tallies 里记「投票的观测者数」的那一行（型号 id 不会以 ~ 开头）
const MAX_ATTEMPTS = 8;

export function createRules({ store, votable, topic, now }) {
  const prefix = `${topic}:`;
  const key = task => prefix + task;
  const iso = () => new Date(now()).toISOString();
  const allowed = (list, task, model) => !!list?.tasks.get(task)?.has(model);
  const live = (list, task, models) => models.filter(m => allowed(list, task, m));

  async function taskResult(list, task, models) {
    const tally = Object.fromEntries([...list.tasks.get(task)].map(m => [m, 0]));
    let voters = 0;
    for (const r of await store.listTallies(key(task))) {
      if (r.task !== key(task)) continue;
      if (r.model === VOTERS) voters = Math.max(0, r.count);
      else if (Object.hasOwn(tally, r.model)) tally[r.model] = Math.max(0, r.count);
    }
    return { task, votes: live(list, task, models), tally, voters, updated: iso() };
  }

  // 这位观测者在这一卷从没有票变成有票（或反过来）：本卷观测者数加减一；
  // 别的卷也都没票时，专题的观测者数跟着加减一。并发下可能差一，由对账修正。
  async function voterMoved(voter, task, delta) {
    await store.addTally(key(task), VOTERS, delta);
    const others = (await store.listBallots(voter))
      .filter(b => b.task.startsWith(prefix) && b.task !== key(task) && b.models.length);
    if (!others.length) await store.addTally(topic, VOTERS, delta);
  }

  return {
    allowed,

    async tally() {
      const list = await votable.get();
      const body = { updated: iso(), voters: 0, taskVoters: {}, tasks: {} };
      if (!list) return body;
      for (const [task, models] of list.tasks) {
        body.tasks[task] = Object.fromEntries([...models].map(m => [m, 0]));
        body.taskVoters[task] = 0;
      }
      for (const r of await store.listTallies(topic)) {
        const n = Math.max(0, r.count);
        if (r.task === topic) { if (r.model === VOTERS) body.voters = n; continue; }
        const task = r.task.slice(prefix.length);
        if (!Object.hasOwn(body.tasks, task)) continue;
        if (r.model === VOTERS) body.taskVoters[task] = n;
        else if (Object.hasOwn(body.tasks[task], r.model)) body.tasks[task][r.model] = n;
      }
      return body;
    },

    async me(voter) {
      const list = await votable.get();
      const votes = {};
      if (!voter || !list) return { votes };
      for (const b of await store.listBallots(voter)) {
        if (!b.task.startsWith(prefix)) continue;
        const task = b.task.slice(prefix.length);
        const models = live(list, task, b.models);
        if (models.length) votes[task] = models;
      }
      return { votes };
    },

    async vote(voter, task, model) {
      const list = await votable.get();
      if (!allowed(list, task, model)) throw new VoteError('not_votable');
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const ballot = await store.getBallot(voter, key(task));
        const current = ballot?.models ?? [];
        const kept = live(list, task, current);
        if (kept.includes(model)) throw new VoteError('already_voted', { votes: kept });
        if (kept.length >= VOTES_PER_TASK) throw new VoteError('limit_reached', { votes: kept });
        const models = [...kept, model];
        const times = Object.fromEntries(kept.map(m => [m, ballot.times?.[m] ?? null]));
        times[model] = now();
        if (!await store.putBallot(voter, key(task), { models, times }, ballot?.version ?? 0)) continue;   // 别的请求先写了：重读再判
        const dropped = current.filter(m => !kept.includes(m));
        await Promise.all([store.addTally(key(task), model, 1), ...dropped.map(m => store.addTally(key(task), m, -1))]);
        if (!current.length) await voterMoved(voter, task, 1);
        return taskResult(list, task, models);
      }
      throw new Error('ballot write kept conflicting');
    },

    async retract(voter, task, model) {
      const list = await votable.get();
      if (!allowed(list, task, model)) throw new VoteError('not_votable');
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const ballot = voter ? await store.getBallot(voter, key(task)) : null;
        const current = ballot?.models ?? [];
        if (!current.includes(model)) return taskResult(list, task, current);   // 本来就没投：照实返回
        const models = current.filter(m => m !== model);
        const times = Object.fromEntries(models.map(m => [m, ballot.times?.[m] ?? null]));
        if (!await store.putBallot(voter, key(task), { models, times }, ballot.version)) continue;
        await store.addTally(key(task), model, -1);
        if (!models.length) await voterMoved(voter, task, -1);
        return taskResult(list, task, models);
      }
      throw new Error('ballot write kept conflicting');
    },
  };
}
