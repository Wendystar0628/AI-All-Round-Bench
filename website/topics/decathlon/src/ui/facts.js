// What every reader of a board needs, said once for the page and the posters (charts/poster.js):
//   challengeFacts(data)   the scale of the challenge: models ranked (and in testing), tasks (and categories),
//                          the per-task time limit — the leaderboard head's big figures and the posters' figures
//   modelFacts(data, id)   one model's total (and place) and its two task kinds, for the chart posters of a model
//   guideLines(data)       sentences for a poster's 怎么看这张图: { total, pass, rules, best, cost: [lines with marks] }
import { t } from '../core/i18n.js';
import { minuteRange, fmtScore, DASH } from '../core/format.js';
import { rankBy } from '../core/rank.js';

export function challengeFacts(data) {
  const ranked = rankBy(data, 'total').filter((e) => e.ranked).length;
  const testing = data.order.length - ranked;
  return [
    { value: String(ranked), label: t('common.figs.models'), sub: testing ? t('common.figs.testing', { n: testing }) : null },
    { value: String(data.tasks.length), label: t('common.figs.tasks'), sub: t('common.figs.cats', { n: data.categories.length }) },
    { value: minuteRange(data), label: t('common.figs.minutes'), sub: t('common.figs.minutesNote') },
  ];
}

/** One model's figures for its chart posters: the total (with its place), the two kinds of tasks. */
export function modelFacts(data, id) {
  const s = data.score(id);
  const place = rankBy(data, 'total').find((e) => e.id === id);
  const num = (v) => (v == null ? DASH : fmtScore(v));
  return [
    { value: num(s.total), label: t('common.score.total'), sub: place?.ranked && place.rank != null ? t('common.figs.rank', { n: place.rank }) : t('common.score.pending') },
    { value: num(s.kinds?.standard), label: t('common.kind.standard') },
    { value: num(s.kinds?.design), label: t('common.kind.design') },
  ];
}

export function guideLines(data) {
  const n = { cats: data.categories.length, tasks: data.tasks.length, range: minuteRange(data) };
  return {
    total: t('common.poster.total', n),
    pass: t('common.poster.pass'),
    rules: t('common.poster.rules', n),
    best: t('common.poster.best'),
    cost: [
      { mark: 'subscription', text: t('common.poster.costPlan') },
      { mark: 'api', text: t('common.poster.costApi') },
      t('common.poster.tokens', n),
    ],
  };
}
