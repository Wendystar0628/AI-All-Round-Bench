// 表格存储（Tablestore）里的票箱：线上用。官方 tablestore SDK，凭证用函数角色的临时密钥（credentials() 每次取）。
// 四张表（votes.md 第 9.1 节）在第一次用到时建好，已有就跳过：
//   ballots  主键 voter, task    列 models（JSON 数组）、times（JSON）、version、updated
//   tallies  主键 task, model    列 n（原子加减）
//   voters   主键 voter          列 issued、ipHash
//   limits   主键 k, w           列 n（原子加一）；表上 TTL 一天，过期自动删除
// 卷 key 在库里写成 <专题>:<卷 key>；tallies 里 <专题> 这一行记专题的观测者数。
import TableStore from 'tablestore';

const { Long, Condition, RowExistenceExpectation: Expect, SingleColumnCondition, ComparatorType, ReturnType, INF_MIN, INF_MAX } = TableStore;

export const TABLES = {
  ballots: { pk: [['voter', 'STRING'], ['task', 'STRING']], ttl: -1 },
  tallies: { pk: [['task', 'STRING'], ['model', 'STRING']], ttl: -1 },
  voters: { pk: [['voter', 'STRING']], ttl: -1 },
  limits: { pk: [['k', 'STRING'], ['w', 'INTEGER']], ttl: 86400 },
};

// 只重试一定没写进去的错误；条件不满足（OTSConditionCheckFail）不重试，交给规则层重读再判
const RETRYABLE = new Set(['OTSRowOperationConflict', 'OTSServerBusy', 'OTSTableNotReady', 'OTSNotEnoughCapacityUnit', 'OTSPartitionUnavailable', 'OTSQuotaExhausted', 'OTSOperationThrottled']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** SDK 把服务端错误码放在 code 或 message 里，这里统一取出 OTSxxx */
export function otsCode(err) {
  if (typeof err?.code === 'string' && err.code.startsWith('OTS')) return err.code;
  return /OTS[A-Za-z]+/.exec(String(err?.message ?? ''))?.[0] ?? null;
}

const num = v => (v == null ? 0 : typeof v === 'number' ? v : v.toNumber());
const attrs = row => Object.fromEntries((row?.attributes ?? []).map(a => [a.columnName, a.columnValue]));
const pk = row => Object.fromEntries((row?.primaryKey ?? []).map(p => [p.name, p.value]));
const parse = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const versionIs = v => new Condition(Expect.EXPECT_EXIST, new SingleColumnCondition('version', Long.fromNumber(v), ComparatorType.EQUAL, false));
const countIs = n => new Condition(Expect.EXPECT_EXIST, new SingleColumnCondition('n', Long.fromNumber(n), ComparatorType.EQUAL, false));

/**
 * @param {object} o
 * @param {string} o.endpoint  如 https://octathlon-votes.cn-hangzhou.ots.aliyuncs.com
 * @param {string} o.instance
 * @param {() => {accessKeyId, accessKeySecret, securityToken}} o.credentials
 */
export function createTablestore({ endpoint, instance, credentials, log = console }) {
  const clients = new Map();
  function client() {
    const c = credentials();
    if (!c?.accessKeyId || !c?.accessKeySecret) throw new Error('no credentials for Tablestore');
    const id = `${c.accessKeyId}\u0000${c.securityToken ?? ''}`;
    let cl = clients.get(id);
    if (!cl) {
      cl = new TableStore.Client({
        accessKeyId: c.accessKeyId, secretAccessKey: c.accessKeySecret, stsToken: c.securityToken,
        endpoint, instancename: instance, maxRetries: 0, httpOptions: { timeout: 5000 },
      });
      clients.set(id, cl);
      if (clients.size > 4) clients.delete(clients.keys().next().value);
    }
    return cl;
  }

  async function call(op, params) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client()[op](params);
      } catch (err) {
        if (attempt >= 4 || !RETRYABLE.has(otsCode(err))) throw err;
        await sleep(40 * 2 ** attempt * (0.5 + Math.random()));
      }
    }
  }
  /** 条件写：条件不满足返回 false */
  async function conditional(op, params) {
    try { await call(op, params); return true; }
    catch (err) { if (otsCode(err) === 'OTSConditionCheckFail') return false; throw err; }
  }

  let ready = null;
  async function ensureTables() {
    const { tableNames = [] } = await call('listTable', {});
    const created = [];
    for (const [name, spec] of Object.entries(TABLES)) {
      if (tableNames.includes(name)) continue;
      try {
        await call('createTable', {
          tableMeta: { tableName: name, primaryKey: spec.pk.map(([n, type]) => ({ name: n, type })) },
          reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
          tableOptions: { timeToLive: spec.ttl, maxVersions: 1 },
        });
        created.push(name);
      } catch (err) {
        if (otsCode(err) !== 'OTSObjectAlreadyExist') throw err;
      }
    }
    if (created.length) {
      log.info?.(JSON.stringify({ at: 'tablestore', created }));
      await sleep(3000);   // 新建的表要几秒才能读写
    }
  }
  const tables = () => (ready ??= ensureTables().catch(err => { ready = null; throw err; }));

  async function range(tableName, start, end) {
    await tables();
    const rows = [];
    let from = start;
    while (from) {
      const data = await call('getRange', { tableName, direction: TableStore.Direction.FORWARD, maxVersions: 1, inclusiveStartPrimaryKey: from, exclusiveEndPrimaryKey: end, limit: 5000 });
      rows.push(...data.rows);
      from = data.nextStartPrimaryKey ? data.nextStartPrimaryKey.map(p => ({ [p.name]: p.value })) : null;
    }
    return rows;
  }

  const ballotOf = row => {
    const a = attrs(row), k = pk(row);
    return { voter: k.voter, task: k.task, models: parse(a.models, []), times: parse(a.times, {}), version: num(a.version) };
  };
  const tallyOf = row => {
    const k = pk(row);
    return { task: k.task, model: k.model, count: num(attrs(row).n) };
  };

  return {
    kind: 'tablestore',
    ensureTables: tables,

    async getBallot(voter, task) {
      await tables();
      const { row } = await call('getRow', { tableName: 'ballots', primaryKey: [{ voter }, { task }], maxVersions: 1 });
      return row?.primaryKey ? ballotOf(row) : null;
    },
    async putBallot(voter, task, { models, times }, expectedVersion) {
      await tables();
      return conditional('putRow', {
        tableName: 'ballots',
        condition: expectedVersion ? versionIs(expectedVersion) : new Condition(Expect.EXPECT_NOT_EXIST, null),
        primaryKey: [{ voter }, { task }],
        attributeColumns: [
          { models: JSON.stringify(models) },
          { times: JSON.stringify(times) },
          { version: Long.fromNumber(expectedVersion + 1) },
          { updated: Long.fromNumber(Date.now()) },
        ],
      });
    },
    async deleteBallot(voter, task, expectedVersion) {
      await tables();
      return conditional('deleteRow', { tableName: 'ballots', condition: versionIs(expectedVersion), primaryKey: [{ voter }, { task }] });
    },
    async listBallots(voter) {
      return (await range('ballots', [{ voter }, { task: INF_MIN }], [{ voter }, { task: INF_MAX }])).map(ballotOf);
    },
    async scanBallots() {
      return (await range('ballots', [{ voter: INF_MIN }, { task: INF_MIN }], [{ voter: INF_MAX }, { task: INF_MAX }])).map(ballotOf);
    },

    async addTally(task, model, delta) {
      await tables();
      await call('updateRow', {
        tableName: 'tallies',
        condition: new Condition(Expect.IGNORE, null),
        primaryKey: [{ task }, { model }],
        updateOfAttributeColumns: [{ INCREMENT: [{ n: Long.fromNumber(delta) }] }],
      });
    },
    async listTallies(prefix) {
      const rows = prefix === undefined
        ? await range('tallies', [{ task: INF_MIN }, { model: INF_MIN }], [{ task: INF_MAX }, { model: INF_MAX }])
        : await range('tallies', [{ task: prefix }, { model: INF_MIN }], [{ task: `${prefix};` }, { model: INF_MIN }]);   // ';' 紧跟在 ':' 后面
      return rows.map(tallyOf).filter(r => prefix === undefined || r.task === prefix || r.task.startsWith(`${prefix}:`));
    },
    async setTally(task, model, count, expected) {
      await tables();
      const condition = expected === null ? new Condition(Expect.EXPECT_NOT_EXIST, null) : countIs(expected);
      if (count === 0) {
        if (expected === null) return true;
        return conditional('deleteRow', { tableName: 'tallies', condition, primaryKey: [{ task }, { model }] });
      }
      return conditional('putRow', { tableName: 'tallies', condition, primaryKey: [{ task }, { model }], attributeColumns: [{ n: Long.fromNumber(count) }] });
    },

    async createVoter(voter, { issued, ipHash }) {
      await tables();
      await call('putRow', {
        tableName: 'voters',
        condition: new Condition(Expect.EXPECT_NOT_EXIST, null),
        primaryKey: [{ voter }],
        attributeColumns: [{ issued: Long.fromNumber(issued) }, { ipHash }],
      });
    },
    async deleteVoter(voter) {
      await tables();
      await call('deleteRow', { tableName: 'voters', condition: new Condition(Expect.IGNORE, null), primaryKey: [{ voter }] });
    },

    async hit(key, window) {
      await tables();
      const { row } = await call('updateRow', {
        tableName: 'limits',
        condition: new Condition(Expect.IGNORE, null),
        primaryKey: [{ k: key }, { w: Long.fromNumber(window) }],
        updateOfAttributeColumns: [{ INCREMENT: [{ n: Long.fromNumber(1) }] }],
        returnContent: { returnType: ReturnType.AfterModify, returnColumns: ['n'] },
      });
      return num(attrs(row).n);
    },
    async clearLimits() {
      const rows = await range('limits', [{ k: INF_MIN }, { w: INF_MIN }], [{ k: INF_MAX }, { w: INF_MAX }]);
      for (const row of rows) {
        const k = pk(row);
        await call('deleteRow', { tableName: 'limits', condition: new Condition(Expect.IGNORE, null), primaryKey: [{ k: k.k }, { w: k.w }] });
      }
      return rows.length;
    },
  };
}
