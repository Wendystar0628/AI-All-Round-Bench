// 读数据目录（topic.json、models.json、works.json，字段见 docs/data.md），派生出页面直接用的对象。
// 页面只通过这里拿数据；对象之间互相引用（题 → 方向 → 评委，作品 → 题 / 型号），顺序一律照数据：
// 方向按展示顺序，型号按参测登记顺序（不是名次），作品先按题、再按型号。
//
//   data.categories  方向 Category[]（10 个）
//   data.pages       有页面的题 Entry[]：已登记的题，和还没有题的方向暂写的题（upcoming）
//   data.models      型号 Model[]        data.judges  评委 Judge[]
//   data.entry(key) / model(id)
//   data.counts      { categories, models, judges, works }
//   data.updated     作品素材最近更新的日期    data.notice  暂停公示 {zh, en}（正式发布时才可能有）
//   data.ver(path)   数据目录里一个文件的版本号（大小 + 修改时间），拼在图片和下载包的网址后面
//   data.votes       观测者票选（docs/votes.md）：{ path, votable, snapshot, count(题key, 型号id), total(型号id) }
//                    path 是票箱接口的路径 /api/votes/v1/<专题>/（接口所在的源是构建时的设定，见 context.mjs 的 votesApi）；
//                    votable 是能投的名单 { 题key: [型号id] }（votable.json）；snapshot 是发布时的计票（votes.json，没有时 null），
//                    只算名单里的作品；count、total 从快照里取，没有快照时是 0
//
// Category { key, no, name, name_en, short, short_en（简称，星座的星下写它）, judge: Judge, download, tasks: Entry[], upcoming: Entry|null,
//            lead: Entry（这个方向页面上的那道题）, skin（design.mjs skinOf）, cloth（书脊的布色，就是这一题的世界色）,
//            works: Work[], clouded（一件作品都没有） }
// Entry    { key, no|null, name, name_en, tagline, summary, highlights, statement, category, judge, download,
//            upcoming: 布尔（题面还没出）, path: 'tasks/<key>/', works: Work[], votable: Work[]（能投的作品） }
// Work     { id: '<型号id>/<题key>', task: Entry, model: Model, state: 'done'|'answering', images: Image[],
//            cover: Image|null, download: {href,file,bytes,kind,note}|null, comment: {zh,en}|null, votable: 布尔 }
// Model    { …models.json 一项, path: 'models/<id>/', works: Work[], judge: Judge|null（同时当评委时） }
// Judge    { …topic.json judges 一项, categories: Category[], contestant: Model|null（同时参测时） }
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { skinOf } from './design.mjs';

function readJSON(dir, name) {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (e) {
    throw new Error(`数据目录 ${dir} 里的 ${name} 读不出来（${e.message}）。数据由 website/tools/export.py 生成，见 docs/data.md`);
  }
}

/** 可以没有的文件（votable.json、votes.json）：没有时 null，读不出来时打印提示后当作没有 */
function readOptional(dir, name) {
  if (!existsSync(join(dir, name))) return null;
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (e) {
    console.warn(`[site] 数据目录里的 ${name} 读不出来（${e.message}），先当作没有`);
    return null;
  }
}

/** 能投的名单：votable.json；旧数据没有这个文件时，照导出的同一条规则推出来（作答已结束、state 为 done，且挂出了图的作品） */
function votableFrom(topic, workRows, file) {
  if (file && file.tasks && typeof file.tasks === 'object') return file;
  const tasks = {};
  for (const [key, row] of Object.entries(workRows)) tasks[key] = Object.keys(row).filter((id) => row[id].state === 'done' && row[id].images?.length);
  return { updated: topic.updated ?? null, tasks };
}

/** 能投的名单，开发服务器的本地票箱（scripts/site.mjs）按它收票：{ updated, tasks: { 题key: [型号id] } } */
export function votableOf(dir) {
  return votableFrom(readJSON(dir, 'topic.json'), readJSON(dir, 'works.json'), readOptional(dir, 'votable.json'));
}

const count = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);

export function loadData(dir) {
  const topic = readJSON(dir, 'topic.json');
  const modelRows = readJSON(dir, 'models.json');
  const workRows = readJSON(dir, 'works.json');
  const votable = votableFrom(topic, workRows, readOptional(dir, 'votable.json'));

  const models = modelRows.map((m) => ({ ...m, path: `models/${m.id}/`, works: [], judge: null }));
  const modelById = new Map(models.map((m) => [m.id, m]));
  const modelByKey = new Map(models.map((m) => [m.key, m]));

  const judges = topic.judges.map((j) => ({ ...j, categories: [], contestant: modelByKey.get(j.model?.key) ?? null }));
  const judgeById = new Map(judges.map((j) => [j.id, j]));
  for (const j of judges) if (j.contestant) j.contestant.judge = j;

  const categories = topic.categories.map((c, i) => {
    const cat = { ...c, judge: judgeById.get(c.judge) ?? null, works: [] };
    const entry = (t, upcoming) => ({
      tagline: null, summary: null, highlights: [], statement: null, ...t,
      no: upcoming ? null : t.no, category: cat, judge: cat.judge, download: cat.download,
      upcoming, path: `tasks/${t.key}/`, works: [],
    });
    cat.tasks = c.tasks.map((t) => entry(t, false));
    // 还没有题的方向也有一页：用展示文案里按主题暂写的题；连暂写的题都没有时用方向本身
    cat.upcoming = cat.tasks.length ? null : entry(c.upcoming ?? { key: c.key, name: c.name, name_en: c.name_en }, true);
    cat.lead = cat.tasks[0] ?? cat.upcoming;
    cat.skin = skinOf(cat.lead.key, c.name);
    cat.cloth = cat.skin.world;                       // 书脊的布：这一题的世界色
    return cat;
  });
  const pages = categories.flatMap((c) => (c.upcoming ? [c.upcoming] : c.tasks));
  const entryByKey = new Map(pages.map((e) => [e.key, e]));

  for (const j of judges) j.categories = categories.filter((c) => c.judge === j);

  let workCount = 0;
  const notice = topic.notice ?? null;
  for (const cat of categories) {
    for (const t of cat.tasks) {
      const row = workRows[t.key] ?? {};
      const open = new Set(notice ? [] : votable.tasks?.[t.key] ?? []);
      t.works = models.filter((m) => row[m.id]).map((m) => {
        const w = row[m.id];
        const images = w.images ?? [];
        return { id: `${m.id}/${t.key}`, task: t, model: m, state: w.state, images, cover: images[0] ?? null, download: w.download ?? null, comment: w.comment ?? null, votable: open.has(m.id) };
      });
      t.votable = t.works.filter((w) => w.votable);
      for (const w of t.works) w.model.works.push(w);
      cat.works.push(...t.works);
      workCount += t.works.length;
    }
    if (cat.upcoming) cat.upcoming.votable = [];
    cat.clouded = cat.works.length === 0;
  }

  // 发布时的计票快照（votes.json，格式同票箱接口的 tally）：只算名单里的作品，旧票不计入任何显示
  const tasks = categories.flatMap((c) => c.tasks);
  const raw = readOptional(dir, 'votes.json');
  let snapshot = null;
  if (raw && raw.tasks && typeof raw.tasks === 'object' && !notice) {
    snapshot = { updated: raw.updated ?? null, voters: count(raw.voters), taskVoters: {}, tasks: {} };
    for (const t of tasks) {
      snapshot.tasks[t.key] = Object.fromEntries(t.votable.map((w) => [w.model.id, count(raw.tasks[t.key]?.[w.model.id])]));
      snapshot.taskVoters[t.key] = count(raw.taskVoters?.[t.key]);
    }
  }
  const voteOf = (taskKey, modelId) => snapshot?.tasks[taskKey]?.[modelId] ?? 0;

  const versions = new Map();
  const ver = (path) => {
    if (!versions.has(path)) {
      let v = '0';
      try {
        const st = statSync(join(dir, path));
        v = st.size.toString(36) + Math.floor(st.mtimeMs).toString(36);
      } catch { /* 文件不在：照常给地址，浏览器那边就是缺图 */ }
      versions.set(path, v);
    }
    return versions.get(path);
  };

  return {
    dir,
    topic,
    notice,
    updated: topic.updated,
    categories,
    pages,
    models,
    judges,
    counts: { categories: categories.length, models: models.length, judges: judges.length, works: workCount },
    entry: (key) => entryByKey.get(key) ?? null,
    model: (id) => modelById.get(id) ?? null,
    ver,
    votes: {
      path: `/api/votes/v1/${topic.id}/`,
      votable: Object.fromEntries(tasks.map((t) => [t.key, t.votable.map((w) => w.model.id)])),
      snapshot,
      count: voteOf,
      total: (modelId) => tasks.reduce((s, t) => s + voteOf(t.key, modelId), 0),
    },
  };
}
