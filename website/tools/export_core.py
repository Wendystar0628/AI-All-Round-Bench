"""Shared data access, JSON output, pinyin and statement excerpts for site plugins."""
from dataclasses import dataclass
from datetime import datetime
from functools import cached_property
import json
from pathlib import Path
import posixpath
import re
import sys
import tempfile

TOOLS = Path(__file__).resolve().parent
WEBSITE = TOOLS.parent
sys.path.insert(0, str(WEBSITE.parent / 'orchestrator'))

import layout
import models
import store
from topic import Topic

try:
    from pypinyin import Style, lazy_pinyin
except ImportError:
    raise SystemExit('缺少 pypinyin，请运行 python -m pip install pypinyin==0.53.0')

CJK = re.compile(r'[\u3400-\u9fff]')


@dataclass(frozen=True)
class Context:
    topic: Topic
    project: Path
    include_private: bool = False
    live: bool = False

    @cached_property
    def sessions(self):
        return store.snapshot('sessions', self.topic.id)['sessions']


def registry(ctx, *, include_audited=False):
    participants = ctx.topic.participants(include_private=ctx.include_private)
    catalog = {model.key: model for model in models.identities(include_private=ctx.include_private)}
    result = []
    for key, entry in participants.items():
        if entry.audit and not include_audited:
            continue
        model = catalog[key]
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', model.id):
            raise ValueError(f'{key} 的网址标识无效：{model.id}')
        mark = layout.vendor_icons() / 'mark' / f'{model.logo}.svg'
        if not mark.is_file():
            raise ValueError(f'{key} 缺少厂商图标 {mark}')
        result.append({'id': model.id, 'key': model.key, 'name': model.name, 'short': model.short,
                       'aliases': model.aliases, 'vendor': model.vendor, 'region': model.region,
                       'logo': model.logo, 'agent': entry.agent, 'effort': entry.effort, 'tested': entry.tested})
    return result


def session(ctx, model, task):
    ref = ctx.topic.task(task).ref(model)
    return ctx.sessions.get(layout.session_key(ref), {})


def public_model(ctx, m, tested=None):
    date = tested or m.get('tested')
    if not date:
        starts = [record['start'] for name in ctx.topic.tasks
                  if (record := session(ctx, m['key'], name)).get('start')]
        date = date_of(max(starts)) if starts else None
    return {k: m[k] for k in ('id', 'key', 'name', 'short', 'aliases', 'vendor', 'region',
                               'logo', 'agent', 'effort')} | {'tested': date}


def load_confirmed(ctx):
    return read_json(ctx.project / 'publish' / 'confirmed.json')


def save_confirmed(ctx, data):
    write_json(ctx.project / 'publish' / 'confirmed.json', data)


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
    """Markdown block lines -> the site's statement block list. Inline markup stays as written;
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


def build_stem(task):
    """One task's 题干 by STEM_RULE: { statement, materials, omitted, blocks, sections }."""
    statement = task.statement.relative_to(layout.BENCH).as_posix()
    base = posixpath.dirname(statement)
    root = md_tree(task.statement.read_text(encoding='utf-8-sig'))
    omitted = []
    sections = stem_sections(root, base, omitted)
    folder = task.materials.source if task.materials else None
    if folder:
        files = sorted((int(m.group(1)), f) for f in folder.iterdir() if (m := PROBLEM_FILE.fullmatch(f.name)))
        rel = folder.relative_to(layout.BENCH).as_posix()
        for _, f in files:
            prob = md_tree(f.read_text(encoding='utf-8-sig'))
            item = {'title': prob['title'] or f.stem, 'blocks': md_blocks(prob['lines'], rel)}
            if subs := stem_sections(prob, rel, omitted):
                item['sections'] = subs
            sections.append(item)
    return {
        'statement': statement,
        'materials': folder.relative_to(layout.BENCH).as_posix() if folder else None,
        'omitted': list(dict.fromkeys(omitted)),
        'blocks': md_blocks(root['lines'], base),
        'sections': sections,
    }


def write_stems(ctx, categories, out):
    """Write current task statements and remove obsolete generated JSON."""
    stems = out / 'stems'
    expected = set()
    for c in categories:
        for t in c['tasks']:
            path = stems / c['key'] / f'{t["key"]}.json'
            expected.add(path)
            write_json(path, build_stem(ctx.topic.task(t['_source'])))
    for stale in set(stems.glob('*/*.json')) - expected:
        stale.unlink()
