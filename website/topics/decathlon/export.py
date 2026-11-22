"""十项全能网站的数据、榜单与正式成绩快照。"""
from datetime import date
import math
from pathlib import Path

from export_core import (
    date_of, item, load_confirmed, public_cost, public_fields, public_model, read_json,
    registry, save_confirmed, session, write_json, write_stems,
)
import contracts
import layout


def one(x):
    """Round a score to one decimal for display, preserving a missing score."""
    return None if x is None else float(f'{x:.1f}')


def num(x):
    """Weights as plain numbers: 15 rather than 15.0."""
    return int(x) if float(x).is_integer() else x


def load_tasks(ctx):
    """Join this site's presentation copy to the ordered categories and tasks in its manifest."""
    meta = read_json(ctx.project / 'meta' / 'tasks_meta.json')
    topic = ctx.topic
    registered = topic.tasks
    category_meta = {cat['key']: cat for cat in meta['categories']}
    by_source, keys = {}, set()
    for cat in meta['categories']:
        for t in cat['tasks']:
            src = registered.get(t['source'])
            if src is None:
                raise SystemExit(f'tasks_meta.json：专题 {topic.id} 没有这道题：{t["source"]}')
            if src.category != cat['key'] or src.key != t['key']:
                raise SystemExit(f'tasks_meta.json：{src.name} 的专题清单路径为 {src.category}/{src.key}')
            if t['key'] in keys or t['source'] in by_source:
                raise SystemExit(f'tasks_meta.json：重复的题目 {t["key"]}')
            keys.add(t['key'])
            by_source[src.name] = t
    if missing := [n for n in registered if n not in by_source]:
        raise SystemExit('tasks_meta.json 缺少这些题：' + '、'.join(missing))

    categories, number = [], 0
    for category in topic.categories:
        cat = category_meta[category['key']]
        tasks = []
        for n, src in registered.items():
            if src.category != category['key']:
                continue
            number += 1
            t = by_source[n]
            tasks.append({
                'key': src.key, 'path': f'{src.category}/{src.key}', 'no': number, 'category': src.category,
                'name': n, 'name_en': t['name_en'], 'short': t['short'], 'short_en': t['short_en'],
                'weight': num(src.weight), 'minutes': src.minutes, 'kind': src.group,
                'brief': t['brief'], 'brief_en': t['brief_en'],
                'deliverable': t['deliverable'], 'deliverable_en': t['deliverable_en'],
                'statement': src.statement.relative_to(layout.BENCH).as_posix(),
                '_source': n, '_terms': t.get('terms', []),
            })
        categories.append({
            'key': category['key'], 'name': category['name'], 'en': cat['en'], 'short': cat['short'], 'short_en': cat['short_en'],
            'icon': cat['key'], 'weight': num(category['weight']), 'kind': tasks[0]['kind'],
            'brief': cat['brief'], 'brief_en': cat['brief_en'], 'tasks': tasks,
        })
    return categories, meta.get('sections', [])


def ranks(values):
    """{id: rank} by score, highest first; equal one-decimal scores share a rank (1, 2, 2, 4); None gets None."""
    scored = sorted((v for v in values.values() if v is not None), reverse=True)
    return {k: (None if v is None else scored.index(v) + 1) for k, v in values.items()}


def rank_records(records, categories):
    ids = list(records)
    overall = ranks({i: records[i]['total'] for i in ids})
    by_cat = {c['key']: ranks({i: records[i]['categories'][c['key']] for i in ids}) for c in categories}
    by_task = {t['key']: ranks({i: records[i]['tasks'][t['key']] for i in ids}) for c in categories for t in c['tasks']}
    for i in ids:
        records[i]['rank'] = overall[i]
        records[i]['category_ranks'] = {c: by_cat[c][i] for c in by_cat}
        records[i]['task_ranks'] = {t: by_task[t][i] for t in by_task}
    return sorted(ids, key=lambda i: (overall[i] is None, overall[i] or 0, ids.index(i)))


def build_zeros(ctx, models, scores, categories):
    """zeros.json for 0分盘点: the written reason ({kind, zh, en}) of every 0 the exported scores hold, by task key and
    model id. Reasons live in zero-reasons.json by task name and model key and always follow that file (the confirmed
    snapshot freezes scores only); a 0 without a written reason is listed, and the page falls back to the grader's
    anomaly note."""
    path = ctx.project / 'publish' / 'zero-reasons.json'
    written = read_json(path) if path.is_file() else {}
    key_of = {m['id']: m['key'] for m in models}
    reasons, missing = {}, []
    for c in categories:
        for t in c['tasks']:
            by = written.get(t['_source'], {})
            for i, r in scores['scores'].items():
                if r['tasks'].get(t['key']) != 0:
                    continue
                if key_of[i] in by:
                    reasons.setdefault(t['key'], {})[i] = by[key_of[i]]
                else:
                    missing.append(f'{t["_source"]} {key_of[i]}')
    if missing:
        print('提示：这些 0 分还没写原因（zero-reasons.json）：' + '；'.join(missing))
    return {'reasons': reasons}


def build_search(models, categories, sections):
    items = [item('model', m['id'], m['name'], m['name'], m['short'],
                  [*m.get('aliases', []), m['vendor'], m['agent'], m['key']], f'/models/{m["id"]}/')
             for m in models]
    items += [item('task', t['key'], t['name'], t['name_en'], t['short'], [t['short_en'], *t['_terms']],
                   f'/tasks/{c["key"]}/{t["key"]}/', category=c['key'], short_en=t['short_en'])
              for c in categories for t in c['tasks']]
    items += [item('category', c['key'], c['name'], c['en'], c['short'], [c['short_en']], f'/categories/#{c["key"]}',
                   short_en=c['short_en'])
              for c in categories]
    items += [item('section', s['id'], s['name'], s['en'], s['name'], [], f'/about/#{s["id"]}', page='about',
                   **({'parent': s['parent']} if s.get('parent') else {}))
              for s in sections]
    return {'items': items}


def load_costs(topic_id):
    import costs
    return costs.load(topic_id)


def cost_source(source):
    return public_fields(source, ('name', 'name_en', 'url', 'fetched', 'usd_cny'))


def complete_record(record, categories):
    keys = {t['key'] for c in categories for t in c['tasks']}
    tasks = record.get('tasks')
    if not isinstance(tasks, dict) or tasks.keys() != keys:
        return False
    return all(type(n) in (int, float) and math.isfinite(n) for n in (record.get('total'), *tasks.values()))


def display_order(graders, labels):
    # The published profile order applies to regular graders. A paired result
    # inherits its public label and follows the direct graders on the page.
    order = {name: i for i, name in enumerate(labels)}
    return sorted(graders.items(), key=lambda entry: (
        entry[0] != entry[1]['public_name'], order[entry[1]['public_name']]))


def grader_scores(topic, task, graders, labels):
    """Keep one grader's main items and the performance receipts common to both views."""
    if task.group != 'design':
        return []
    main = [(key, g) for key, g in graders if 'main' in g['phase'].split('+') and g['items']]
    if len(main) < 2:
        return []
    composer = contracts.resolve(contracts.COMPOSERS, topic.manifest['evaluation']['composers'][task.group])
    performance = {key + '/performance': dict(g, phase='performance') for key, g in graders
                   if g['role'] == 'main' and 'performance' in g['phase'].split('+')}
    result = []
    for key, g in main:
        scored = composer(task, {key: dict(g, phase='main'), **performance})
        if scored['score'] is not None:
            result.append({'name': labels[g['public_name']], 'score': one(scored['score'])})
    return result


def pending_state(ctx, model, name, row):
    if row['state'] in ('pending', 'grading'):
        return 'testing'
    why = row['note']
    if why == '缺少提交':
        return 'missing' if session(ctx, model, name).get('closed') else 'testing'
    return {'未评完': 'testing', '评分失败': 'failed', '未给总分': 'unscored'}[why]


def latest_result_time(task, model, graders):
    # Archives can acquire new mtimes during a move. Only on-site result files
    # participate in the website's historical "updated" date.
    ref = task.ref(model)
    stamps = []
    for key, row in graders:
        if row.get('result'):
            for phase in row['phase'].split('+'):
                live = layout.grading_dir(ref, key, phase) / 'result.json'
                try:
                    stamps.append(live.stat().st_mtime)
                except FileNotFoundError:
                    continue
    return max(stamps, default=None)


def model_record(ctx, model, categories, labels):
    evaluation = ctx.topic.evaluation
    key = model['key']
    per = evaluation.task_scores(key)
    overall = evaluation.model_scores(key)
    tasks = {}
    done = set()
    info = {}
    newest = None
    for category in categories:
        for meta in category['tasks']:
            task = ctx.topic.tasks[meta['_source']]
            row = per[task.name]
            graders = display_order(row['graders'], labels)
            detail = {}
            if row['state'] == 'done' and row['score'] is not None:
                tasks[task.key] = one(row['score'])
                done.add(task.name)
                if parts := grader_scores(ctx.topic, task, graders, labels):
                    detail['graders'] = parts
                stamp = latest_result_time(task, model['key'], graders)
                if stamp is not None:
                    newest = stamp if newest is None else max(newest, stamp)
            else:
                tasks[task.key] = None
                detail['state'] = pending_state(ctx, key, task.name, row)
            anomalies = [{'text': g['result']['anomaly']} for _, g in graders
                         if g.get('result') and g['result'].get('anomaly')]
            if anomalies:
                detail['anomaly'] = anomalies
            if detail:
                info[task.key] = detail
    complete = overall['complete'] and len(done) == len(ctx.topic.tasks)
    record = {
        'total': one(overall['total']) if complete else None,
        'kinds': {g['key']: one(overall['groups'][g['key']]) if all(
            t.name in done for t in ctx.topic.tasks.values() if t.group == g['key']) else None
            for g in ctx.topic.groups},
        'categories': {c['key']: one(overall['categories'][c['key']]) if all(
            t['_source'] in done for t in c['tasks']) else None for c in categories},
        'tasks': tasks,
        'status': 'ranked' if complete else 'testing',
        'done': len(done),
        'task_info': info,
    }
    return record, newest


def live_data(ctx, categories):
    entries = registry(ctx, include_audited=True)
    source, costs = load_costs(ctx.topic.id)
    labels = read_json(ctx.project / 'meta' / 'graders.json')
    records, times = {}, []
    for m in entries:
        row, timestamp = model_record(ctx, m, categories, labels)
        row['cost'] = public_cost(costs.get(m['key'], {}))
        records[m['id']] = row
        if timestamp is not None:
            times.append(timestamp)
    order = rank_records(records, categories)
    scores = {'updated': date_of(max(times)) if times else None, 'cost_source': cost_source(source),
              'order': order, 'scores': {i: records[i] for i in order}, 'notice': None}
    return [public_model(ctx, m) for m in entries], scores


def confirmed_data(ctx, categories):
    if ctx.include_private:
        raise ValueError('正式数据只能使用公开参测登记')
    try:
        snapshot = load_confirmed(ctx)
    except FileNotFoundError as exc:
        raise SystemExit(f'{ctx.topic.id} 缺少已确认成绩快照，不能正式发布') from exc
    entries = {m['id']: m for m in registry(ctx)}
    models = [public_model(ctx, entries[m['id']], m.get('tested'))
              for m in snapshot['models'] if m['id'] in entries]
    scores = snapshot['scores']
    scores['scores'] = {m['id']: scores['scores'][m['id']] for m in models}
    if not all(complete_record(r, categories) for r in scores['scores'].values()):
        raise SystemExit('已确认快照含未完成全套的模型')
    source, costs = load_costs(ctx.topic.id)
    scores['cost_source'] = cost_source(source)
    for m in models:
        record = scores['scores'][m['id']]
        record['cost'] = public_cost(costs.get(m['key'], {}))
        for info in record.get('task_info', {}).values():
            if 'anomaly' in info:
                info['anomaly'] = [{'text': a['text']} for a in info['anomaly']]
    scores['order'] = rank_records(scores['scores'], categories)
    notice = read_json(ctx.project / 'publish' / 'notice.json')['notice']
    if notice and not (notice.get('zh') and notice.get('en')):
        raise ValueError('notice.json 的 notice 需要 zh 和 en 两句')
    scores['notice'] = notice
    if notice:
        models, scores['scores'], scores['order'] = [], {}, []
    return models, scores


def confirm(ctx, model: str) -> None:
    if ctx.include_private:
        raise ValueError('确认成绩只使用公开参测登记')
    entry = next((m for m in registry(ctx, include_audited=True) if m['key'] == model), None)
    if entry is None:
        raise SystemExit(f'{ctx.topic.id} 没有公开登记这个型号：{model}')
    categories, _ = load_tasks(ctx)
    labels = read_json(ctx.project / 'meta' / 'graders.json')
    row, latest = model_record(ctx, entry, categories, labels)
    if row['status'] != 'ranked' or not complete_record(row, categories):
        raise SystemExit(f'{ctx.topic.id} 确认正式成绩需要全套 {len(ctx.topic.tasks)} 题完整且无评分缺口：{model}')
    try:
        snapshot = load_confirmed(ctx)
    except FileNotFoundError:
        snapshot = {'models': [], 'scores': {'updated': None, 'scores': {}}}
    mid = entry['id']
    tested = public_model(ctx, entry)['tested']
    snapshot['models'] = [m for m in snapshot['models'] if m['id'] != mid] + [
        {'id': mid, 'key': model, 'tested': tested}]
    scores = snapshot['scores']
    scores['scores'][mid] = row
    if latest is not None:
        scores['updated'] = date_of(latest)
    scores['order'] = rank_records(scores['scores'], categories)
    participants = ctx.topic.content_dir / '参测.json'
    registration = read_json(participants)
    audit = registration[model].pop('audit', None)
    save_confirmed(ctx, snapshot)
    if audit is not None:
        write_json(participants, registration)


def topic_card(ctx, models, scores):
    topic = ctx.topic
    by_id = {m['id']: m for m in models}
    ranked = [mid for mid in scores['order'] if scores['scores'][mid]['rank'] is not None]
    items = [{'model': {k: by_id[mid][k] for k in ('id', 'name', 'vendor', 'logo', 'effort')},
              'value': scores['scores'][mid]['total'], 'max': 100} for mid in ranked[:3]]
    return {
        'id': topic.id, 'name': topic.name, 'name_en': topic.name_en, 'status': topic.website_status,
        'url': f'/{topic.id}/', 'accent': read_json(ctx.project / 'meta' / 'card.json')['accent'],
        'updated': scores['updated'] or date.today().isoformat(),
        'stats': [
            {'label': {'zh': '题目', 'en': 'Tasks'}, 'value': len(topic.tasks)},
            {'label': {'zh': '类别', 'en': 'Categories'}, 'value': len(topic.categories)},
            {'label': {'zh': '上榜型号', 'en': 'Ranked models'}, 'value': len(ranked)},
        ],
        'feature': {'kind': 'ranking', 'title': {'zh': '前 3 名', 'en': 'Top 3'}, 'items': items},
    }


def export(ctx, out: Path, formal: bool) -> dict:
    categories, sections = load_tasks(ctx)
    models, scores = confirmed_data(ctx, categories) if formal else live_data(ctx, categories)
    static = formal or not ctx.live or not (out / 'tasks.json').is_file() or any(
        not (out / 'stems' / c['key'] / f'{t["key"]}.json').is_file()
        for c in categories for t in c['tasks'])
    write_json(out / 'scores.json', scores)
    write_json(out / 'models.json', models)
    write_json(out / 'search.json', build_search(models, categories, sections))
    write_json(out / 'zeros.json', build_zeros(ctx, models, scores, categories))
    if static:
        tasks = [c | {'tasks': [{k: v for k, v in t.items() if not k.startswith('_')} for t in c['tasks']]}
                 for c in categories]
        write_json(out / 'tasks.json', tasks)
        write_stems(ctx, categories, out)
    return topic_card(ctx, models, scores)


def summary(card: dict, out: Path) -> list[str]:
    models = {m['id']: m['name'] for m in read_json(out / 'models.json')}
    scores = read_json(out / 'scores.json')
    lines = [f'[{card["id"]}] {card["name"]}  成绩日期 {scores["updated"]}，{len(models)} 个模型']
    for mid in scores['order']:
        s = scores['scores'][mid]
        lines.append(f'  {s["rank"] or "评测中"}  {models[mid]}  {"—" if s["total"] is None else s["total"]}'
                     + ('' if s['rank'] else f'（已出 {s["done"]} 题）'))
    return lines
