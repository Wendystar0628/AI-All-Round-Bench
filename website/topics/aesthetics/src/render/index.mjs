// 路由表和渲染入口。站点插件（scripts/site.mjs）在构建时为每条路由生成一页 HTML，开发时按请求现画。
//
//   网址（相对站内根路径，线上是 /aesthetics/；英文在 en/ 下，路径相同）：
//     ''              首页：一屏的标题卡和十卷星座            home
//     volumes/        卷目：十卷星图，一摞书                  volumes
//     models/         受测模型：参测型号的拱窗                  observers
//     judges/         评委：三位评委的登场                    judges
//     votes/          观测者票选（docs/votes.md 第四节）      votes
//     about/          观测须知                                about
//     tasks/<key>/    题目页，一题一页                        task    key 是题 key；题面还没出的方向用暂写的题 key（如 anime-game-logo）
//     models/<id>/    型号页                                  model   id 是型号的网址标识
//
// 页面模块 pages/<page>.mjs 导出 render(ctx, route)，返回 { title, description, body, styles, script, gallery, bare }，
// 由 shell.mjs 拼成整页。ctx 见 context.mjs，数据见 data.mjs。
import { makeContext } from './context.mjs';
import { documentHTML } from './shell.mjs';
import * as home from './pages/home.mjs';
import * as volumes from './pages/volumes.mjs';
import * as observers from './pages/observers.mjs';
import * as judges from './pages/judges.mjs';
import * as votes from './pages/votes.mjs';
import * as about from './pages/about.mjs';
import * as task from './pages/task.mjs';
import * as model from './pages/model.mjs';

export { loadData, votableOf } from './data.mjs';

const PAGES = { home, volumes, observers, judges, votes, about, task, model };
export const LANGS = ['zh', 'en'];

/** 全部路由：{ page, lang, path（不带 en/ 的站内路径）, key } */
export function listRoutes(data) {
  const out = [];
  for (const lang of LANGS) {
    out.push({ page: 'home', lang, path: '' });
    out.push({ page: 'volumes', lang, path: 'volumes/' });
    out.push({ page: 'observers', lang, path: 'models/' });
    out.push({ page: 'judges', lang, path: 'judges/' });
    out.push({ page: 'votes', lang, path: 'votes/' });
    out.push({ page: 'about', lang, path: 'about/' });
    for (const e of data.pages) out.push({ page: 'task', lang, path: e.path, key: e.key });
    for (const m of data.models) out.push({ page: 'model', lang, path: m.path, key: m.id });
  }
  return out;
}

/** 路由对应的网址路径（相对站内根路径） */
export const routeURL = (r) => (r.lang === 'en' ? 'en/' : '') + r.path;

/** votesOrigin：票箱接口的源（构建时的 ONESHOT_VOTES_API，如 https://api.wendystars.com；空串是同源，开发服务器用） */
export function renderRoute(route, data, base, { votesOrigin = '' } = {}) {
  const ctx = makeContext({ data, lang: route.lang, base, route, votesOrigin });
  return documentHTML(ctx, PAGES[route.page].render(ctx, route));
}
