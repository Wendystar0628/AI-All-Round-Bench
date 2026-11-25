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
//
// Category { key, no, name, name_en, short, short_en（简称，星座的星下写它）, judge: Judge, download, tasks: Entry[], upcoming: Entry|null,
//            lead: Entry（这个方向页面上的那道题）, skin（design.mjs skinOf）, cloth（书脊的布色，就是这一题的世界色）,
//            works: Work[], clouded（一件作品都没有） }
// Entry    { key, no|null, name, name_en, tagline, summary, highlights, statement, category, judge, download,
//            upcoming: 布尔（题面还没出）, path: 'tasks/<key>/', works: Work[] }
// Work     { id: '<型号id>/<题key>', task: Entry, model: Model, state: 'done'|'answering', images: Image[],
//            cover: Image|null, download: {href,file,bytes,kind,note}|null, comment: {zh,en}|null }
// Model    { …models.json 一项, path: 'models/<id>/', works: Work[], judge: Judge|null（同时当评委时） }
// Judge    { …topic.json judges 一项, categories: Category[], contestant: Model|null（同时参测时） }
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { skinOf } from './design.mjs';

function readJSON(dir, name) {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch (e) {
    throw new Error(`数据目录 ${dir} 里的 ${name} 读不出来（${e.message}）。数据由 website/tools/export.py 生成，见 docs/data.md`);
  }
}

export function loadData(dir) {
  const topic = readJSON(dir, 'topic.json');
  const modelRows = readJSON(dir, 'models.json');
  const workRows = readJSON(dir, 'works.json');

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
  for (const cat of categories) {
    for (const t of cat.tasks) {
      const row = workRows[t.key] ?? {};
      t.works = models.filter((m) => row[m.id]).map((m) => {
        const w = row[m.id];
        const images = w.images ?? [];
        return { id: `${m.id}/${t.key}`, task: t, model: m, state: w.state, images, cover: images[0] ?? null, download: w.download ?? null, comment: w.comment ?? null };
      });
      for (const w of t.works) w.model.works.push(w);
      cat.works.push(...t.works);
      workCount += t.works.length;
    }
    cat.clouded = cat.works.length === 0;
  }

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
    notice: topic.notice ?? null,
    updated: topic.updated,
    categories,
    pages,
    models,
    judges,
    counts: { categories: categories.length, models: models.length, judges: judges.length, works: workCount },
    entry: (key) => entryByKey.get(key) ?? null,
    model: (id) => modelById.get(id) ?? null,
    ver,
  };
}
