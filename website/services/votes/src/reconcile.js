// 对账：从 ballots 重算 tallies（每天一次，由定时触发器经 /invoke 调用）。
// 先读 tallies 再扫 ballots，每一行按「读到的旧值」条件写：对账途中有人投票、计数变了，
// 那一行就跳过，留给下一次对账，不会把新加的一票盖掉。
// 清票：维护用，删掉一卷（或一卷里某一件作品）的票，再对账。
import { VOTERS } from './rules.js';

const k2 = (a, b) => `${a}\u0000${b}`;

export async function reconcile(store) {
  const before = await store.listTallies();
  const ballots = await store.scanBallots();

  const want = new Map();
  const bump = (task, model) => want.set(k2(task, model), (want.get(k2(task, model)) ?? 0) + 1);
  const topicVoters = new Map();
  for (const b of ballots) {
    if (!b.models.length) continue;
    for (const m of b.models) bump(b.task, m);
    bump(b.task, VOTERS);
    const topic = b.task.split(':')[0];
    if (!topicVoters.has(topic)) topicVoters.set(topic, new Set());
    topicVoters.get(topic).add(b.voter);
  }
  for (const [topic, set] of topicVoters) want.set(k2(topic, VOTERS), set.size);

  let fixed = 0, skipped = 0;
  const seen = new Set();
  for (const r of before) {
    const id = k2(r.task, r.model);
    seen.add(id);
    const n = want.get(id) ?? 0;
    if (n === r.count && n !== 0) continue;
    (await store.setTally(r.task, r.model, n, r.count)) ? fixed++ : skipped++;
  }
  for (const [id, n] of want) {
    if (seen.has(id)) continue;
    const [task, model] = id.split('\u0000');
    (await store.setTally(task, model, n, null)) ? fixed++ : skipped++;
  }
  return { ballots: ballots.length, rows: want.size, fixed, skipped };
}

export async function purge(store, { topic, task, model = null, limits = false }) {
  const taskKey = `${topic}:${task}`;
  const rows = (await store.scanBallots()).filter(b => b.task === taskKey);
  let votesRemoved = 0;
  const touched = new Set();
  for (const row of rows) {
    let cur = row;
    for (let attempt = 0; cur && attempt < 8; attempt++) {
      const models = model ? cur.models.filter(m => m !== model) : [];
      if (model && models.length === cur.models.length) break;
      const ok = models.length
        ? await store.putBallot(cur.voter, taskKey, { models, times: Object.fromEntries(models.map(m => [m, cur.times?.[m] ?? null])) }, cur.version)
        : await store.deleteBallot(cur.voter, taskKey, cur.version);
      if (ok) { votesRemoved += cur.models.length - models.length; touched.add(cur.voter); break; }
      cur = await store.getBallot(row.voter, taskKey);
      if (cur) cur.voter = row.voter;
    }
  }
  // 只为这一卷来过的观测者，连 voters 里那一行一起删
  let votersRemoved = 0;
  for (const voter of touched) {
    if ((await store.listBallots(voter)).length) continue;
    await store.deleteVoter(voter);
    votersRemoved++;
  }
  const limitsCleared = limits ? await store.clearLimits() : 0;
  return { votesRemoved, votersRemoved, limitsCleared, reconcile: await reconcile(store) };
}
