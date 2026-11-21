"""Export topic websites and the hub. Formal builds read a topic's confirmed snapshot.

python website/tools/export_data.py                                   refresh previews and both hub indexes
python website/tools/export_data.py --topic decathlon --scores-only   grading refresh and local hub index
python website/tools/export_data.py --topic decathlon --confirmed --out <folder>
"""
import argparse
import copy
import json
import posixpath
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True  # importing the orchestrator must not write orchestrator/__pycache__

TOOLS = Path(__file__).resolve().parent
WEBSITE = TOOLS.parent
BENCH = WEBSITE.parent
HUB = WEBSITE / 'hub'
PRIVATE = BENCH / 'orchestrator' / 'private_models.json'
LOGOS = WEBSITE / 'logos' / 'mark'
sys.path.insert(0, str(BENCH / 'orchestrator'))

import grading  # noqa: E402  (read-only use: load, task_scores, model_scores, phases, run_dir)
import costs  # noqa: E402  (read-only use: load)
import common  # noqa: E402
from model_registry import private_models, registered_models  # noqa: E402
from run_state import paths  # noqa: E402
from task_registry import DEFAULT_TOPIC, TASKS, TOPICS, tasks_for  # noqa: E402

try:
    from pypinyin import Style, lazy_pinyin
except ImportError:
    raise SystemExit('缺少 pypinyin：先运行 python -m pip install pypinyin==0.53.0')

CJK = re.compile(r'[\u3400-\u9fff]')


def one(x):
    """0-100 score with one decimal, as scores_report prints it; None stays None."""
    return None if x is None else float(f'{x:.1f}')


def num(x):
    """Weights as plain numbers: 15 rather than 15.0."""
    return int(x) if float(x).is_integer() else x


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, data):
    content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if path.is_file() and path.read_text(encoding='utf-8') == content:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    stream = tempfile.NamedTemporaryFile(dir=path.parent, suffix='.tmp', delete=False,
                                         mode='w', encoding='utf-8')
    tmp = Path(stream.name)
    try:
        with stream:
            stream.write(content)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def date_of(ts):
    return datetime.fromtimestamp(ts).strftime('%Y-%m-%d')


# ---------- registry and task copy ----------

def project_dir(topic):
    return BENCH / TOPICS[topic]['paths']['website']


def topic_url(topic):
    url = TOPICS[topic]['paths']['url']
    if not re.fullmatch(r'/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)+', url):
        raise ValueError(f'{topic} 的 paths.url 必须是站内目录路径：{url}')
    return url


def topic_dir(topic):
    return TOOLS / 'topics' / topic


def load_registry(include_private=False, unpublished=False, *, topic=DEFAULT_TOPIC):
    """Join this topic's participants to shared identities; private registrations are local only."""
    models = registered_models(TOOLS, topic)
    if unpublished:
        models.extend(unpublished_models(topic))
    seen_id, seen_key = set(), set()
    for m in models:
        for field in ('id', 'key', 'name', 'short', 'vendor', 'region', 'logo', 'agent', 'effort'):
            if not m.get(field):
                raise SystemExit(f'models.json：{m.get("key") or m} 缺少 {field}')
        if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', m['id']):
            raise SystemExit(f'models.json：id 只能用小写字母、数字和连字符：{m["id"]}')
        if m['id'] in seen_id or m['key'] in seen_key:
            raise SystemExit(f'models.json：重复登记 {m["id"]} / {m["key"]}')
        if not (LOGOS / f'{m["logo"]}.svg').is_file():
            raise SystemExit(f'models.json：没有图标 website/logos/mark/{m["logo"]}.svg')
        seen_id.add(m['id'])
        seen_key.add(m['key'])
    # Temporary hold, rarely used: "audit": true keeps a model registered (videos and cost accounting still read it)
    # but leaves it off the site entirely. The user removes the field when it may go public and publish.py runs again.
    return models if include_private else [m for m in models if not m.get('audit')]


def unpublished_models(topic):
    return private_models(PRIVATE, topic)


def site_notice(topic=DEFAULT_TOPIC):
    """Optional bilingual notice shown in place of this topic's public scores."""
    path = topic_dir(topic) / 'site.json'
    notice = read_json(path).get('notice') if path.is_file() else None
    if notice and not (notice.get('zh') and notice.get('en')):
        raise SystemExit('site.json：notice 要有 zh 和 en 两句，关闭时写 null')
    return notice or None


_timer = None


def timer_state():
    """The answering records of orchestrator/state.json ({'<model key>/<task>': record}), read once."""
    global _timer
    if _timer is None:
        try:
            _timer = json.loads(paths.state.read_text(encoding='utf-8')).get('tasks', {})
        except (OSError, ValueError):
            _timer = {}
    return _timer


def latest_session_date(key, topic=DEFAULT_TOPIC):
    """Start date of the model's latest answering session among the current tasks (orchestrator/state.json)."""
    try:
        timer = json.loads(paths.state.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    starts = [r['start'] for t in tasks_for(topic)
              if isinstance(r := timer.get('tasks', {}).get(f'{key}/{t}'), dict) and r.get('start')]
    return date_of(max(starts)) if starts else None


def load_tasks(topic=DEFAULT_TOPIC):
    """Join this site's presentation copy to the ordered categories and tasks in its manifest."""
    meta = read_json(topic_dir(topic) / 'tasks_meta.json')
    registered = tasks_for(topic)
    category_meta = {cat['key']: cat for cat in meta['categories']}
    by_source, keys = {}, set()
    for cat in meta['categories']:
        for t in cat['tasks']:
            src = registered.get(t['source'])
            if src is None:
                raise SystemExit(f'tasks_meta.json：专题 {topic} 没有这道题：{t["source"]}')
            if src.category_key != cat['key'] or src.website_key != t['key']:
                raise SystemExit(f'tasks_meta.json：{src.name} 的专题清单路径为 {src.category_key}/{src.website_key}')
            if t['key'] in keys or t['source'] in by_source:
                raise SystemExit(f'tasks_meta.json：重复的题目 {t["key"]}')
            keys.add(t['key'])
            by_source[src.name] = t
    if missing := [n for n in registered if n not in by_source]:
        raise SystemExit('tasks_meta.json 缺少这些题：' + '、'.join(missing))

    categories, number = [], 0
    for category in TOPICS[topic]['categories']:
        cat = category_meta[category['key']]
        tasks = []
        for n, src in registered.items():
            if src.category_key != category['key']:
                continue
            number += 1
            t = by_source[n]
            tasks.append({
                'key': src.website_key, 'path': f'{src.category_key}/{src.website_key}', 'no': number, 'category': src.category_key,
                'name': n, 'name_en': t['name_en'], 'short': t['short'], 'short_en': t['short_en'],
                'weight': num(src.weight), 'minutes': src.minutes, 'kind': src.grading_type,
                'brief': t['brief'], 'brief_en': t['brief_en'],
                'deliverable': t['deliverable'], 'deliverable_en': t['deliverable_en'],
                'statement': src.statement.relative_to(BENCH).as_posix(),
                '_source': n, '_terms': t.get('terms', []),
            })
        categories.append({
            'key': category['key'], 'name': category['name'], 'en': cat['en'], 'short': cat['short'], 'short_en': cat['short_en'],
            'icon': cat['key'], 'weight': num(category['weight']), 'kind': tasks[0]['kind'],
            'brief': cat['brief'], 'brief_en': cat['brief_en'], 'tasks': tasks,
        })
    return categories, meta.get('sections', [])


# ---------- scores ----------

def public_fields(data, fields):
    """Explicit scalar projection: private cost extensions never become downloadable website data."""
    if not isinstance(data, dict):
        return {}
    return {k: data[k] for k in fields if k in data and (data[k] is None or isinstance(data[k], (str, int, float, bool)))}


def public_cost(cost):
    out = public_fields(cost, ('cny', 'basis', 'tokens', 'tasks', 'method', 'api_usd', 'api_cny', 'hours', 'tps', 'tps_replies'))
    if 'plan' in cost:
        out['plan'] = (public_fields(cost['plan'], ('name', 'name_en', 'price', 'currency', 'period', 'credits'))
                       if isinstance(cost['plan'], dict) else None)
    return out


def ranks(values):
    """{id: rank} by score, highest first; equal one-decimal scores share a rank (1, 2, 2, 4); None gets None."""
    scored = sorted((v for v in values.values() if v is not None), reverse=True)
    return {k: (None if v is None else scored.index(v) + 1) for k, v in values.items()}


def grader_scores(task, sc):
    """A design task's score as each main-item grader alone would give it ([{name, score}]), composed like
    grading.design_score (performance items keep their own grader), only when two or more graders scored the main
    items; their mean is the task score."""
    if TASKS[task].grading_type != 'design':
        return []
    sources = sc.get('sources') or []
    main = [g for g in grading.GRADERS if any(s[0] == g and s[1] in (None, 'main') for s in sources)
            and g in sc.get('grader_keys', TASKS[task].graders_for('main'))]
    if len(main) < 2:
        return []
    expected = grading.guide_items(task)
    performance = {grading.norm(k) for k in TASKS[task].performance_items}
    out = []
    for g in main:
        total = full = 0
        for key, (maximum, weight) in expected.items():
            selected = 'performance' if key in performance else 'main'
            vals = [mine[key]['score'] for grader, scope, r in sources if key in (mine := grading.by_key(r))
                    and grader in (('codex',) if selected == 'performance' else main) and scope in (None, selected)
                    and (selected == 'performance' or grader == g)]
            full += maximum * weight
            if vals:
                total += sum(vals) / len(vals) * weight
        if full:
            out.append({'name': grading.GRADERS[g], 'score': one(min(100, total / full * 100))})
    return out


def task_info(model, per, timer):
    """Per task, only what the score itself does not say: why it has no score yet ('state': testing = 评测中,
    missing = 未交, failed = 评分失败, unscored = 未给总分), each grader's score of a design task, and
    anomaly text ([{text}]) without its grader attribution. Tasks with nothing to add are left out."""
    out = {}
    for n, p in per.items():
        info = {}
        g = p['gap']
        if g:
            closed = isinstance(r := timer.get(f'{model["key"]}/{n}'), dict) and r.get('closed')
            info['state'] = {'未评完': 'testing', '评分失败': 'failed', '未给总分': 'unscored'}.get(
                g, 'missing' if closed else 'testing')
        elif graders := grader_scores(n, p['sc']):
            info['graders'] = graders
        notes = [{'text': r['anomaly']} for r in p['rs'] if r and r.get('anomaly')]
        if notes:
            info['anomaly'] = notes
        if info:
            out[n] = info
    return out


def model_record(state, model, categories, topic=DEFAULT_TOPIC):
    """One model's scores. A task counts once its score is final (grading.py reports no gap for it); a category or
    kind needs all its tasks, and the total needs all tasks in this topic."""
    registered = tasks_for(topic)
    per = grading.task_scores(state, model['key'], topic=topic)
    total, cats = grading.model_scores(per, topic=topic)
    final = {n: p['sc']['score'] is not None and not p['gap'] for n, p in per.items()}
    score = {n: p['sc']['score'] if final[n] else None for n, p in per.items()}

    def mean(names):
        if not names or not all(final[n] for n in names):
            return None
        return sum(registered[n].weight * score[n] for n in names) / sum(registered[n].weight for n in names)

    tasks = {t['key']: one(score[t['_source']]) for c in categories for t in c['tasks']}
    record = {
        'total': one(total) if all(final.values()) else None,
        'kinds': {group['key']: one(mean([n for n, task in registered.items() if task.grading_type == group['key']]))
                  for group in TOPICS[topic]['groups']},
        'categories': {c['key']: one(cats[c['name']][0]) if all(final[t['_source']] for t in c['tasks']) else None
                       for c in categories},
        'tasks': tasks,
        'status': 'ranked' if all(final.values()) else 'testing',
        'done': sum(final.values()),
    }
    keys = {t['_source']: t['key'] for c in categories for t in c['tasks']}
    info = task_info(model, per, timer_state())
    record['task_info'] = {keys[n]: v for n, v in info.items() if n in keys}
    used = [grading.run_dir(p) / 'result.json'
            for n in per if final[n] for job in per[n]['js'] if job
            for p in grading.phases(job) if p['state'] == 'done']
    mtimes = [f.stat().st_mtime for f in used if f.is_file()]
    return record, (max(mtimes) if mtimes else None)


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


def build_scores(models, categories, complete_only=True, *, topic=DEFAULT_TOPIC):
    state = grading.load()
    cost_source, model_costs = costs.load([m['key'] for m in models], topic=topic)
    records, newest = {}, []
    task_keys = [t['key'] for c in categories for t in c['tasks']]
    for m in models:
        if complete_only and m['key'] not in state['models']:
            print(f'提示：{m["key"]} 还没有评分记录，不公开。')
            continue
        record, latest = model_record(state, m, categories, topic=topic)
        if complete_only and not grading.complete_score_record(record, task_keys, topic=topic):
            continue
        records[m['id']] = record
        records[m['id']]['cost'] = public_cost(model_costs.get(m['key'], {}))
        if latest:
            newest.append(latest)
    order = rank_records(records, categories)
    return {
        'updated': date_of(max(newest)) if newest else None,
        'cost_source': public_fields(cost_source, ('name', 'name_en', 'url', 'fetched', 'usd_cny')),
        'order': order,
        'scores': {i: records[i] for i in order},
    }


def build_zeros(models, scores, categories, *, topic=DEFAULT_TOPIC):
    """zeros.json for 0分盘点: the written reason ({kind, zh, en}) of every 0 the exported scores hold, by task key and
    model id. Reasons live in zero-reasons.json by task name and model key and always follow that file (the confirmed
    snapshot freezes scores only); a 0 without a written reason is listed, and the page falls back to the grader's
    anomaly note."""
    path = topic_dir(topic) / 'zero-reasons.json'
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


# ---------- search ----------

def spell(texts):
    """Pinyin full spelling and initials of the texts that contain Chinese, lower-case, letters and digits only."""
    full, initials = [], []
    for text in texts:
        if not text or not CJK.search(text):
            continue
        for style, out in ((Style.NORMAL, full), (Style.FIRST_LETTER, initials)):
            value = re.sub(r'[^a-z0-9]', '', ''.join(lazy_pinyin(text, style=style)).lower())
            if value and value not in out:
                out.append(value)
    return full, initials


def item(kind, id_, name, en, short, terms, href, **extra):
    """One search entry; terms already contained in the name, English name or short name are left out."""
    shown = [x.lower() for x in (name, en, short) if x]
    terms = list(dict.fromkeys(x for x in terms if x and not any(x.lower() in s for s in shown)))
    py, pyi = spell([name, short, *terms])
    return {'type': kind, 'id': id_, 'name': name, 'en': en, 'short': short, 'terms': terms,
            'py': py, 'pyi': pyi, **extra, 'href': href}


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


# ---------- 题干 (the statement text on each task page) ----------

# STEM_RULE, the one rule for what counts as 题干 (website/docs/tasks.md「题干」):
# - A statement is cut into sections by its headings. A section whose heading contains any of NOT_STEM is not 题干,
#   together with all its subsections; every other section is, and so is the lead text before the first section.
#   The top heading itself (「# 题目」 or the task's name) is dropped: the page already has the title.
# - Problems kept as separate files go with it: the files named 第NN题.md at the top of the task's materials folder
#   (the folder beside the statement, orchestrator/tasks.py MATERIALS) follow the statement in number order, each as
#   one section under its own heading, cut by the same rule. Other material files (the Luban lock layer drawings and
#   voxel data, the graders) are only linked: the statement links them, and the page links the folder.
NOT_STEM = ('作答', '提交', '交付',                       # how to answer and hand in
            '规定', '规则', '注意事项',                    # rules and pitfalls
            '评分', '评价', '评测',                        # scoring, timing, the grader program and machine
            '运行环境', '本机环境', '技术要求',            # environment and technology
            '视频导出', '录制')                            # interfaces for recording the work
STEM_KEEP = ('游戏规则',)                                  # the rules of play are 题干, though they contain 规则
PROBLEM_FILE = re.compile(r'第(\d+)题\.md')

MD_HEADING = re.compile(r'(#{1,6})\s+(.+?)\s*#*\s*$')
MD_FENCE = re.compile(r'( *)(`{3,}|~{3,})\s*([\w+#-]*)\s*$')
MD_ITEM = re.compile(r'( *)([-*+]|(\d{1,9})[.)])( +|$)(.*)')
MD_RULE = re.compile(r' {0,3}([-*_])( *\1){2,} *$')
MD_ALIGN = re.compile(r' *:?-{3,}:? *')
MD_LINK = re.compile(r'(?<!!)\[([^\]]+)\]\(([^)\s]+)\)')


def md_tree(text):
    """Headings outside code fences -> {title, level, lines, sections}; the root holds the lines before the first one."""
    root = {'title': '', 'level': 0, 'lines': [], 'sections': []}
    stack, fence = [root], None
    for line in text.replace('\r\n', '\n').split('\n'):
        if fence:
            if line.strip().startswith(fence):
                fence = None
        elif m := MD_FENCE.match(line):
            fence = m.group(2)[0] * 3
        elif m := MD_HEADING.match(line):
            node = {'title': m.group(2), 'level': len(m.group(1)), 'lines': [], 'sections': []}
            while stack[-1]['level'] >= node['level']:
                stack.pop()
            stack[-1]['sections'].append(node)
            stack.append(node)
            continue
        stack[-1]['lines'].append(line)
    # a file under one top heading: that heading is the file's title, its lead text the root's
    if len(root['sections']) == 1 and root['sections'][0]['level'] == 1 and not ''.join(root['lines']).strip():
        top = root['sections'][0]
        root = {**top, 'level': 0}
    return root


WIDE = re.compile(r'[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]')


def join_lines(lines):
    """Soft line breaks: nothing between two Chinese characters or full-width marks, a space otherwise."""
    out = ''
    for s in (x.strip() for x in lines):
        out += s if not out or (WIDE.match(out[-1]) and WIDE.match(s[0])) else ' ' + s
    return out


def split_row(line):
    """Table cells; a | inside $…$ or `…` does not split, nor an escaped \\|."""
    s = line.strip()
    s = s[1:] if s.startswith('|') else s
    s = s[:-1] if s.endswith('|') and not s.endswith('\\|') else s
    cells, cur, quote, i = [], '', None, 0
    while i < len(s):
        c = s[i]
        if c == '\\' and s[i + 1:i + 2] == '|':
            cur += '|'
            i += 2
            continue
        if quote:
            quote = None if c == quote else quote
        elif c in '$`':
            quote = c
        elif c == '|':
            cells.append(cur.strip())
            cur = ''
            i += 1
            continue
        cur += c
        i += 1
    return cells + [cur.strip()]


def md_blocks(lines, base):
    """Markdown block lines -> the site's block list (site/src/reading/content.js). Inline markup stays as written;
    links relative to the file become "gh:<path in the repo>"."""
    def inline(s):
        def link(m):
            href = m.group(2)
            if re.match(r'[a-z]+:|#', href):
                return m.group(0)
            return f'[{m.group(1)}](gh:{posixpath.normpath(posixpath.join(base, href))})'
        return MD_LINK.sub(link, s)

    out, para, i = [], [], 0

    def flush():
        if para:
            out.append(inline(join_lines(para)))
            para.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            flush()
            i += 1
            continue
        if m := MD_FENCE.match(line):
            flush()
            indent, mark, code = len(m.group(1)), m.group(2), []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith(mark[0] * len(mark)):
                ln = lines[i]
                code.append(ln[min(indent, len(ln) - len(ln.lstrip(' '))):])
                i += 1
            i += 1
            out.append({'code': '\n'.join(code), 'lang': m.group(3)} if m.group(3) else {'code': '\n'.join(code)})
            continue
        if s.startswith('$$'):
            flush()
            tex = s[2:]
            if tex.endswith('$$') and tex.strip() != '':
                tex, i = tex[:-2], i + 1
            else:
                i += 1
                while i < len(lines) and not lines[i].strip().endswith('$$'):
                    tex += '\n' + lines[i]
                    i += 1
                if i < len(lines):
                    tex += '\n' + lines[i].strip()[:-2]
                i += 1
            out.append({'math': tex.strip()})
            continue
        if MD_RULE.match(line):
            flush()
            i += 1
            continue
        if s.startswith('|') and i + 1 < len(lines) and all(MD_ALIGN.fullmatch(c) for c in split_row(lines[i + 1])):
            flush()
            head, align = split_row(line), split_row(lines[i + 1])
            rows, i = [], i + 2
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append([inline(c) for c in split_row(lines[i])])
                i += 1
            spec = {'head': [inline(c) for c in head], 'rows': rows}
            if num := [k for k, a in enumerate(align) if a.strip().endswith(':') and not a.strip().startswith(':')]:
                spec['num'] = num
            out.append({'table': spec})
            continue
        if (m := MD_ITEM.match(line)) and len(m.group(1)) < 4:
            flush()
            ordered, indent = m.group(3) is not None, len(m.group(1))
            items, cur = [], None
            while i < len(lines):
                ln = lines[i]
                im = MD_ITEM.match(ln)
                if im and len(im.group(1)) == indent and (im.group(3) is not None) == ordered:
                    cur = {'col': indent + len(im.group(2)) + max(1, len(im.group(4))), 'lines': [im.group(5)]}
                    items.append(cur)
                    i += 1
                    continue
                if not ln.strip():
                    nxt = next((x for x in lines[i + 1:] if x.strip()), None)
                    if nxt is None or len(nxt) - len(nxt.lstrip(' ')) < cur['col'] and not (
                            (nm := MD_ITEM.match(nxt)) and len(nm.group(1)) == indent):
                        break
                    cur['lines'].append('')
                    i += 1
                    continue
                lead = len(ln) - len(ln.lstrip(' '))
                if lead >= cur['col']:
                    cur['lines'].append(ln[cur['col']:])
                elif cur['lines'][-1].strip() and not im and not ln.lstrip().startswith(('$$', '|', '```')):
                    cur['lines'].append(ln.strip())  # lazy continuation of the item's paragraph
                else:
                    break
                i += 1
            parsed = []
            for it in items:
                b = md_blocks(it['lines'], base)
                if len(b) == 1 and isinstance(b[0], str):
                    parsed.append(b[0])
                elif b and isinstance(b[0], str):
                    parsed.append({'text': b[0], 'blocks': b[1:]})
                else:
                    parsed.append({'text': '', 'blocks': b})
            block = {'ol' if ordered else 'ul': parsed}
            if ordered and (start := int(m.group(3))) != 1:
                block['start'] = start
            out.append(block)
            continue
        para.append(line)
        i += 1
    flush()
    return out


def stem_sections(node, base, omitted):
    """Kept subsections of a node as {title, blocks, sections}; left-out headings go to omitted."""
    out = []
    for sec in node['sections']:
        if any(word in sec['title'] for word in NOT_STEM) and not any(word in sec['title'] for word in STEM_KEEP):
            omitted.append(sec['title'])
            continue
        item = {'title': sec['title'], 'blocks': md_blocks(sec['lines'], base)}
        if subs := stem_sections(sec, base, omitted):
            item['sections'] = subs
        out.append(item)
    return out


def build_stem(source):
    """One task's 题干 by STEM_RULE: { statement, materials, omitted, blocks, sections }."""
    task = TASKS[source]
    statement = task.statement.relative_to(BENCH).as_posix()
    base = posixpath.dirname(statement)
    root = md_tree(task.statement.read_text(encoding='utf-8-sig'))
    omitted = []
    sections = stem_sections(root, base, omitted)
    folder = task.materials[0] if task.materials else None
    if folder:
        files = sorted((int(m.group(1)), f) for f in folder.iterdir() if (m := PROBLEM_FILE.fullmatch(f.name)))
        rel = folder.relative_to(BENCH).as_posix()
        for _, f in files:
            prob = md_tree(f.read_text(encoding='utf-8-sig'))
            item = {'title': prob['title'] or f.stem, 'blocks': md_blocks(prob['lines'], rel)}
            if subs := stem_sections(prob, rel, omitted):
                item['sections'] = subs
            sections.append(item)
    return {
        'statement': statement,
        'materials': folder.relative_to(BENCH).as_posix() if folder else None,
        'omitted': list(dict.fromkeys(omitted)),
        'blocks': md_blocks(root['lines'], base),
        'sections': sections,
    }


def write_stems(categories, out):
    """Write current task statements and remove obsolete generated JSON."""
    stems = out / 'stems'
    expected = set()
    for c in categories:
        for t in c['tasks']:
            path = stems / c['key'] / f'{t["key"]}.json'
            expected.add(path)
            write_json(path, build_stem(t['_source']))
    for stale in set(stems.glob('*/*.json')) - expected:
        stale.unlink()


# ---------- main ----------

def confirmed_data(categories, *, topic=DEFAULT_TOPIC):
    path = topic_dir(topic) / 'confirmed-scores.json'
    if not path.is_file():
        raise SystemExit(f'{topic} 缺少已确认成绩快照，不能正式发布')
    snapshot = read_json(path)
    # 快照只冻结成绩和当时的测评日期；名字、简称、厂商、地区等登记信息跟随登记表
    registry = {m['id']: m for m in load_registry(topic=topic)}
    models = [public_model(registry[m['id']], m.get('tested'), topic=topic)
              for m in snapshot['models'] if m['id'] in registry]
    task_keys = [t['key'] for c in categories for t in c['tasks']]
    scores = copy.deepcopy(snapshot['scores'])
    scores['scores'] = {m['id']: scores['scores'][m['id']] for m in models}
    if not all(grading.complete_score_record(r, task_keys, topic=topic) for r in scores['scores'].values()):
        raise SystemExit('已确认快照含未完成全套的模型')
    # 快照只冻结成绩；测试开销、Token、TPS 是用量统计，始终按当前台账与计价重算
    cost_source, model_costs = costs.load([m['key'] for m in models], topic=topic)
    scores['cost_source'] = public_fields(cost_source, ('name', 'name_en', 'url', 'fetched', 'usd_cny'))
    for m in models:
        record = scores['scores'][m['id']]
        record['cost'] = public_cost(model_costs.get(m['key'], {}))
        for info in record.get('task_info', {}).values():
            if 'anomaly' in info:
                info['anomaly'] = [{'text': a['text']} for a in info['anomaly']]
    scores['order'] = rank_records(scores['scores'], categories)
    scores['notice'] = site_notice(topic)
    if scores['notice']:
        models = []
        scores['scores'] = {}
        scores['order'] = []
    return models, scores


def public_model(m, tested=None, *, topic=DEFAULT_TOPIC):
    """A registry entry as the site shows it (preview and formal alike): its identity and display fields, and the
    test date (the confirmed snapshot passes the date of the confirmed round)."""
    return ({k: m[k] for k in ('id', 'key', 'name', 'short') if k in m} |
            {'aliases': m.get('aliases', []), 'vendor': m['vendor'], 'region': m['region'], 'logo': m['logo'],
             'agent': m['agent'], 'effort': m['effort'],
             'tested': tested or m.get('tested') or latest_session_date(m['key'], topic)})


def confirm_model(topic, key):
    """Called only by the explicit user-authorized --confirm command; update exactly this model's scores."""
    categories, _ = load_tasks(topic)
    model = next((m for m in load_registry(include_private=True, topic=topic) if m['key'] == key), None)
    if model is None:
        raise SystemExit('没有登记这个型号：' + key)
    fresh = build_scores([model], categories, topic=topic)
    if model['id'] not in fresh['scores']:
        raise SystemExit(f'{topic} 确认正式成绩需要全套 {len(tasks_for(topic))} 题完整且无评分缺口：{key}')
    path = topic_dir(topic) / 'confirmed-scores.json'
    snapshot = read_json(path) if path.exists() else {'models': [], 'scores': {'updated': None, 'scores': {}}}
    entry = {'id': model['id'], 'key': key, 'tested': model.get('tested') or latest_session_date(key, topic)}
    snapshot['models'] = [m for m in snapshot['models'] if m['id'] != model['id']] + [entry]
    snapshot['scores']['scores'][model['id']] = {k: v for k, v in fresh['scores'][model['id']].items() if k != 'cost'}
    snapshot['scores']['updated'] = fresh['updated'] or snapshot['scores']['updated']
    snapshot['scores']['order'] = rank_records(snapshot['scores']['scores'], categories)
    write_json(path, snapshot)
    participants = topic_dir(topic) / 'participants.json'
    registration = read_json(participants)
    registration[key].pop('audit', None)
    write_json(participants, registration)
    return model['id']


def export(topic, out, categories, sections, *, confirmed=False, scores_only=False, unpublished=False):
    static = not scores_only or not (out / 'tasks.json').is_file() or any(
        not (out / 'stems' / c['key'] / f'{t["key"]}.json').is_file()
        for c in categories for t in c['tasks'])
    if confirmed:
        models, scores = confirmed_data(categories, topic=topic)
    else:
        registry = load_registry(include_private=True, unpublished=unpublished, topic=topic)
        scores = build_scores(registry, categories, complete_only=False, topic=topic)
        models = [public_model(m, topic=topic) for m in registry if m['id'] in scores['scores']]
        scores['notice'] = None
    search = build_search(models, categories, sections)
    tasks = [c | {'tasks': [{k: v for k, v in t.items() if not k.startswith('_')} for t in c['tasks']]}
             for c in categories]

    write_json(out / 'scores.json', scores)
    write_json(out / 'models.json', models)
    if static:
        write_json(out / 'tasks.json', tasks)
    write_json(out / 'search.json', search)
    write_json(out / 'zeros.json', build_zeros(models, scores, categories, topic=topic))
    if static:
        write_stems(categories, out)
    print(f'已同步 {out}，共 {len(models)} 个型号，数据日期 {scores["updated"]}')
    return models, scores


def topic_summary(topic, models, scores):
    manifest = TOPICS[topic]
    models_by_id = {m['id']: m for m in models}
    ranked = [mid for mid in scores['order'] if scores['scores'][mid]['rank'] is not None]
    top = [{k: models_by_id[mid][k] for k in ('id', 'name', 'short', 'vendor', 'logo', 'effort')}
           | {'total': scores['scores'][mid]['total']} for mid in ranked[:3]]
    return {'id': topic, 'name': manifest['name'], 'name_en': manifest['name_en'],
            'status': manifest['website_status'], 'url': topic_url(topic),
            'tasks': len(manifest['tasks']), 'categories': len(manifest['categories']),
            'ranked': len(ranked), 'updated': scores['updated'] or datetime.now().date().isoformat(),
            'top': top}


def write_hub(out, summaries):
    rows = list(summaries)
    updated = max((row['updated'] for row in rows), default=datetime.now().date().isoformat())
    write_json(out / 'topics.json', {'updated': updated, 'topics': rows})


def refresh_previews(selected, scores_only):
    local_rows, confirmed_rows = [], []
    for topic, manifest in TOPICS.items():
        online = manifest['website_status'] == 'online'
        project = project_dir(topic)
        public, local = project / 'data', project / 'data-local'
        # Existing data-local must be refreshed even after removing a private registration.
        local_dir = local if not online or local.exists() or unpublished_models(topic) else public
        if topic in selected or not all((local_dir / f).is_file() for f in ('scores.json', 'models.json')):
            categories, sections = load_tasks(topic)
            if online:
                models, scores = export(topic, public, categories, sections, scores_only=scores_only)
            if local_dir == local:
                models, scores = export(topic, local, categories, sections, scores_only=scores_only, unpublished=True)
        else:
            models, scores = read_json(local_dir / 'models.json'), read_json(local_dir / 'scores.json')
        local_rows.append(topic_summary(topic, models, scores))
        if online and not scores_only:
            categories, _ = load_tasks(topic)
            confirmed_rows.append(topic_summary(topic, *confirmed_data(categories, topic=topic)))
    write_hub(HUB / 'data-local', local_rows)
    if not scores_only:
        write_hub(HUB / 'data', confirmed_rows)


def main(argv=()):
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='导出专题网站与总站数据')
    ap.add_argument('--topic', choices=TOPICS)
    ap.add_argument('--confirmed', action='store_true')
    ap.add_argument('--scores-only', action='store_true', help='刷新本地成绩与总站预览，补齐缺少的静态文件')
    ap.add_argument('--out', type=Path)
    args = ap.parse_args(argv)
    if args.confirmed and (not args.out or args.scores_only):
        ap.error('--confirmed 需要独立的 --out 目录，只生成完整正式数据')
    if args.out is not None:
        topic = args.topic or DEFAULT_TOPIC
        if TOPICS[topic]['website_status'] != 'online':
            ap.error('草稿专题只参与本地预览')
        out = args.out.resolve()
        if args.confirmed and any(out.is_relative_to((root / folder).resolve())
                                  for root in (HUB, *(project_dir(t) for t in TOPICS))
                                  for folder in ('data', 'data-local')):
            ap.error('--confirmed 必须用 --out 指向独立正式构建目录')
        export(topic, out, *load_tasks(topic), confirmed=args.confirmed, scores_only=args.scores_only)
        return
    # Keep a single local index consistent when independent grades trigger overlapping topic refreshes.
    lock = HUB.parent / '.build-cache' / 'preview-data.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    with common.singleton(lock, 1800):
        refresh_previews([args.topic] if args.topic else TOPICS, args.scores_only)


if __name__ == '__main__':
    main(sys.argv[1:])
