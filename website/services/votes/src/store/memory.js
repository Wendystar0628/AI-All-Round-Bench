// 内存里的票箱：本地开发和测试用，进程退出票就没了。
// 和 Tablestore 那一份实现同一个存储接口（见 README「存储接口」）。每个操作先让出一次事件循环，
// 这样并发的请求会真的交错，「先读再按版本号写」的规则在这里也要经得起并发。
const tick = () => new Promise(resolve => setImmediate(resolve));
const k2 = (a, b) => `${a}\u0000${b}`;
const copy = row => row && { ...row, models: [...row.models], times: { ...row.times } };

export function createMemoryStore() {
  const ballots = new Map();   // voter\0task → {voter, task, models, times, version}
  const tallies = new Map();   // task\0model → {task, model, count}
  const voters = new Map();    // voter → {issued, ipHash}
  const limits = new Map();    // key\0window → count

  return {
    kind: 'memory',

    async getBallot(voter, task) {
      await tick();
      return copy(ballots.get(k2(voter, task))) ?? null;
    },
    async putBallot(voter, task, { models, times }, expectedVersion) {
      await tick();
      const id = k2(voter, task);
      const cur = ballots.get(id);
      if ((cur?.version ?? 0) !== expectedVersion) return false;
      ballots.set(id, { voter, task, models: [...models], times: { ...times }, version: expectedVersion + 1 });
      return true;
    },
    async deleteBallot(voter, task, expectedVersion) {
      await tick();
      const id = k2(voter, task);
      if (ballots.get(id)?.version !== expectedVersion) return false;
      ballots.delete(id);
      return true;
    },
    async listBallots(voter) {
      await tick();
      return [...ballots.values()].filter(b => b.voter === voter).map(copy);
    },
    async scanBallots() {
      await tick();
      return [...ballots.values()].map(copy);
    },

    async addTally(task, model, delta) {
      await tick();
      const id = k2(task, model);
      tallies.set(id, { task, model, count: (tallies.get(id)?.count ?? 0) + delta });
    },
    async listTallies(prefix) {
      await tick();
      return [...tallies.values()]
        .filter(r => prefix === undefined || r.task === prefix || r.task.startsWith(`${prefix}:`))
        .map(r => ({ ...r }));
    },
    async setTally(task, model, count, expected) {
      await tick();
      const id = k2(task, model);
      if ((tallies.get(id)?.count ?? null) !== expected) return false;
      if (count === 0) tallies.delete(id);
      else tallies.set(id, { task, model, count });
      return true;
    },

    async createVoter(id, info) {
      await tick();
      voters.set(id, { ...info });
    },
    async deleteVoter(id) {
      await tick();
      voters.delete(id);
    },

    async hit(key, window) {
      await tick();
      const id = k2(key, window);
      const n = (limits.get(id) ?? 0) + 1;
      limits.set(id, n);
      return n;
    },
    async clearLimits() {
      await tick();
      const n = limits.size;
      limits.clear();
      return n;
    },

    /** 只给测试看的内部状态 */
    _dump: () => ({ ballots, tallies, voters, limits }),
  };
}
