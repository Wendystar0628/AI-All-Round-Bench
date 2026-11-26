"""审美全能网站的数据：方向与题目、评委、型号、作品图与下载包、观测者票选能投的名单，以及公开确认快照。字段见 docs/data.md。

图片由 tools/shots.py 做好放在 website/.build-cache/aesthetics/media/，下载包由 tools/package.py 放在同级的
packages/；这里按本次导出的型号和作品把用到的文件拷进数据目录的 media/ 和 downloads/。完整导出先把下载包
做到最新（来源没变的沿用），实时刷新（--live）不打包、用现有的包。缺图、缺下载包、缺文案都照常导出，只打印提示。
"""
from datetime import date, datetime
from functools import cache
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys

from export_core import load_confirmed, public_model, read_json, registry, save_confirmed, session, write_json
import layout
import models as registered_models

PROJECT = Path(__file__).resolve().parent


def _tool(name):
    spec = importlib.util.spec_from_file_location(f'oneshot_aesthetics_{name}', PROJECT / 'tools' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


shots = _tool('shots')
packaging = _tool('package')
JUDGES = layout.video_package('aesthetics') / 'judges' / 'judges.json'
HEADS = layout.portraits_dir() / 'heads.json'


def warn(text):
    print(f'提示：{text}', flush=True)


def read_optional(path: Path, what: str):
    """可能还没有或正在写的文件：没有时 None，读不出来时打印提示后当作没有。"""
    if not path.is_file():
        return None
    try:
        return read_json(path)
    except ValueError as exc:
        warn(f'{what}读不出来（{exc}），先当作没有')
        return None


# ---------- 方向、题目、评委 ----------

def load_copy(ctx):
    """共用展示文案 topics/审美全能/展示文案.json 的 directions：展示顺序、展示用的中英文名、点题短语、主要内容、看点。"""
    data = read_optional(ctx.topic.content_dir / '展示文案.json', '展示文案.json ')
    rows = data.get('directions') if isinstance(data, dict) else None
    if not isinstance(rows, list):
        warn('还没有展示文案 topics/审美全能/展示文案.json：方向先按专题清单的顺序排，名字用登记名，题目没有介绍')
        return None
    return rows


def load_judges():
    data = read_optional(JUDGES, '评委登记 judges.json ')
    if not data:
        warn(f'没有评委登记 {JUDGES}')
        return []
    return data['judges']


def blurb(row: dict) -> dict:
    """展示文案里一道题的介绍：点题短语、主要内容（各 {zh, en}）、看点（[{zh, en}]）。"""
    return {'tagline': row.get('tagline'), 'summary': row.get('summary'), 'highlights': row.get('highlights') or []}


def build_categories(ctx, judges):
    """专题清单的类别和题，按展示文案的顺序，配上展示名、介绍、评委和下载规则。"""
    names = {c['key']: c['name'] for c in ctx.topic.categories}
    rows = load_copy(ctx)
    copy = {} if rows is None else {r['category']['key']: r for r in rows if r.get('category', {}).get('key') in names}
    if rows is not None:
        for key in names.keys() - copy.keys():
            warn(f'展示文案里还没有方向 {key}，先排在最后')
    judge_of = {cat: j['id'] for j in judges for cat in j['categories']}
    out, number = [], 0
    for no, key in enumerate([*copy, *(k for k in names if k not in copy)], 1):
        row = copy.get(key, {})
        planned = row.get('task') or {}
        tasks = []
        for task in ctx.topic.tasks.values():
            if task.category != key:
                continue
            number += 1
            mine = row if planned.get('key') == task.key else {}
            if rows is not None and not mine:
                warn(f'展示文案里还没有题 {task.key}')
            name = (mine.get('task') or {}).get('name') or {}
            tasks.append({
                'key': task.key, 'no': number, 'name': name.get('zh') or task.name, 'name_en': name.get('en') or task.name,
                'category': key, 'judge': judge_of.get(key), 'download': key not in packaging.NO_DOWNLOAD,
                **blurb(mine), 'statement': task.statement.relative_to(layout.BENCH).as_posix(), '_name': task.name,
            })
        upcoming = None
        if row.get('provisional') and not tasks:
            name = planned.get('name') or {}
            upcoming = {'key': planned.get('key'), 'name': name.get('zh'), 'name_en': name.get('en'), **blurb(row)}
        name = (row.get('category') or {}).get('name') or {}
        short = (row.get('category') or {}).get('short') or {}
        out.append({'key': key, 'no': no, 'name': name.get('zh') or names[key], 'name_en': name.get('en') or names[key],
                    'short': short.get('zh') or name.get('zh') or names[key],
                    'short_en': short.get('en') or name.get('en') or names[key],
                    'judge': judge_of.get(key), 'download': key not in packaging.NO_DOWNLOAD, 'tasks': tasks,
                    'upcoming': upcoming})
    return out


def image_entry(folder: str, image: dict, media: set) -> dict:
    media.update((f'{folder}/{image["file"]}', f'{folder}/{image["thumb"]}'))
    return {'src': f'media/{folder}/{image["file"]}', 'width': image['width'], 'height': image['height'],
            'thumb': f'media/{folder}/{image["thumb"]}', 'thumb_width': image['thumb_width'],
            'thumb_height': image['thumb_height']}


def portrait(kind, ident, file_name, heads, media):
    """立绘：WebP 大图和缩略图，head 是 heads.json 量好的头部框（按来源图的像素量的，换算成占整张图的比例）。"""
    manifest = shots.portrait(kind, ident, layout.portraits_dir() / file_name) if file_name else None
    if not manifest or not manifest['images']:
        warn(f'{kind}/{ident} 没有立绘（{file_name or "未登记"}）')
        return None
    image = manifest['images'][0]
    entry = image_entry(f'{kind}/{ident}', image, media)
    if box := heads.get(file_name):
        w, h = image['source_size']
        entry['head'] = {'x': round(box['x'] / w, 4), 'y': round(box['y'] / h, 4),
                         'w': round(box['w'] / w, 4), 'h': round(box['h'] / h, 4)}
    return entry


def judge_rows(ctx, judges, categories, heads, media):
    meta = read_json(ctx.project / 'meta' / 'judges.json')
    order = [c['key'] for c in categories]
    known = {m.key: m for m in registered_models.identities()}
    rows = []
    for j in judges:
        model = known.get(j['model'])
        rows.append({
            'id': j['id'], 'name': j['name'],
            'model': {'key': j['model'], **({'id': model.id, 'vendor': model.vendor, 'logo': model.logo} if model else {})},
            'persona': {'zh': j.get('persona'), 'en': meta.get(j['id'], {}).get('persona_en')},
            'categories': sorted(j['categories'], key=lambda k: order.index(k) if k in order else len(order)),
            'portrait': portrait('judges', j['id'], j.get('portrait'), heads, media),
        })
    return rows


# ---------- 型号与作品 ----------

def entries_for(ctx, formal):
    if not formal:
        return registry(ctx, include_audited=True)
    if ctx.include_private:
        raise ValueError('正式数据只能使用公开参测登记')
    try:
        confirmed = {m['id'] for m in load_confirmed(ctx)['models']}
    except FileNotFoundError as exc:
        raise SystemExit(f'{ctx.topic.id} 缺少确认快照 publish/confirmed.json，不能正式发布') from exc
    return [m for m in registry(ctx) if m['id'] in confirmed]


def model_rows(ctx, entries, heads, media):
    known = {m.key: m for m in registered_models.identities(include_private=ctx.include_private)}
    joined = registered_models.participants(ctx.topic.id, include_private=ctx.include_private)   # 本专题参测登记可另指立绘
    rows = []
    for m in entries:
        base = public_model(ctx, m)
        rows.append({
            'id': m['id'], 'key': m['key'], 'name': m['name'], 'short': m['short'], 'effort': m['effort'],
            'display_name': f'{m["name"]} ({m["effort"]})' if m['effort'] else m['name'],
            'vendor': m['vendor'], 'logo': m['logo'], 'agent': m['agent'],
            'released': known[m['key']].released, 'tested': base['tested'],
            'portrait': portrait('models', m['id'], joined[m['key']].portrait or known[m['key']].portrait, heads, media),
        })
    return rows


@cache
def refresh_packages():
    """完整导出时先跑 tools/package.py 把下载包做到最新：来源没变的沿用，改了的重打并比对（规则见 docs/downloads.md）。
    一次导出里驱动会为本地、公开、正式数据各调一次 export()，包只需要做一次。"""
    done = subprocess.run([sys.executable, str(PROJECT / 'tools' / 'package.py')])
    if done.returncode:
        warn('下载包有要处理的问题（见上面 package.py 打印的「要处理」），先用现有的包导出')


def load_packages():
    """tools/package.py 写的下载包清单：{(型号键, 题key): 条目}；清单里没有的作品就是没有下载包。"""
    folder = packaging.PACKAGES
    data = read_optional(folder / 'manifest.json', '下载包清单 manifest.json ')
    found = {}
    for row in (data or {}).get('packages', []):
        if (folder / row['file']).is_file():
            found[(row['model'], row['task'])] = row
        else:
            warn(f'下载包清单里的 {row["file"]} 不在 {folder}')
    return found


def build_works(ctx, entries, categories, packages, media, downloads):
    """works[题key][型号id]：有作答记录、作答目录或素材目录的作品都列上。"""
    works, stamps = {}, []
    for c in categories:
        for t in c['tasks']:
            row = {}
            for m in entries:
                record = session(ctx, m['key'], t['_name'])
                assets = layout.assets_dir(ctx.topic.id, m['key'], t['key'])
                answer = layout.answer_dir(ctx.topic.task(t['_name']).ref(m['key']))
                if not (record or answer.is_dir() or assets.is_dir()):
                    continue
                manifest = shots.work(m['key'], m['id'], t['key'])
                images = []
                if manifest:
                    folder = f'works/{m["id"]}/{t["key"]}'
                    images = [image_entry(folder, image, media) | {'cover': n == 0}
                              for n, image in enumerate(manifest['images'])]
                    stamps += [v[1] for v in manifest['sources'].values()]
                download = None
                if t['download'] and (pkg := packages.get((m['key'], t['key']))):
                    downloads.add(pkg['file'])
                    download = {'href': f'downloads/{pkg["file"]}', 'file': pkg['file'], 'bytes': None,
                                'kind': pkg['kind'], 'note': pkg['note']}
                row[m['id']] = {'state': 'answering' if record and not record.get('closed') else 'done',
                                'images': images, 'download': download, 'comment': None}
            works[t['key']] = row
    return works, stamps


def votable(works: dict) -> dict:
    """能投的名单（docs/votes.md 9.2）：{题key: [型号id]}，作答已结束（state 为 done）且网站上挂出了图的作品。works 只含这次导出的型号：
    正式发布时就是确认快照里公开的那些，本地预览照同样的规则列；暂停公示时各题都是空的。票箱的函数按网址读这份名单。"""
    return {key: [mid for mid, w in row.items() if w['state'] == 'done' and w['images']] for key, row in works.items()}


def mirror(source: Path, target: Path, files: set):
    """把 files（相对路径）从 source 拷到 target：大小和修改时间都一样的不重拷，target 里多出来的删掉。"""
    for rel in sorted(files):
        src, dst = source / rel, target / rel
        if dst.is_file():
            a, b = src.stat(), dst.stat()
            if a.st_size == b.st_size and a.st_mtime_ns == b.st_mtime_ns:
                continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    if target.is_dir():
        for path in sorted(target.rglob('*'), key=lambda p: len(p.parts), reverse=True):
            if path.is_file() and path.relative_to(target).as_posix() not in files:
                path.unlink()
            elif path.is_dir() and not any(path.iterdir()):
                path.rmdir()


# ---------- 插件接口 ----------

def export(ctx, out: Path, formal: bool) -> dict:
    topic = ctx.topic
    judges = load_judges()
    categories = build_categories(ctx, judges)
    notice = None
    if formal:
        notice = read_json(ctx.project / 'publish' / 'notice.json')['notice']
        if notice and not (notice.get('zh') and notice.get('en')):
            raise ValueError('notice.json 的 notice 需要 zh 和 en 两句')
    entries = [] if notice else entries_for(ctx, formal)
    heads = read_optional(HEADS, '立绘头部框 heads.json ') or {}
    if not ctx.live:
        refresh_packages()
    packages = load_packages()
    media, downloads = set(), set()
    with shots.lock():
        judge_list = judge_rows(ctx, judges, categories, heads, media)
        model_list = model_rows(ctx, entries, heads, media)
        works, stamps = build_works(ctx, entries, categories, packages, media, downloads)
        mirror(shots.MEDIA, out / 'media', media)
    mirror(packaging.PACKAGES, out / 'downloads', downloads)
    for row in works.values():
        for w in row.values():
            if w['download']:
                w['download']['bytes'] = (out / 'downloads' / w['download']['file']).stat().st_size
    offered = {t['key'] for c in categories for t in c['tasks'] if t['download']}
    for what, lacking in (('还没有图', lambda t, w: not w['images']),
                          ('还没有下载包', lambda t, w: t in offered and not w['download'])):
        if items := [f'{mid}/{t}' for t, row in works.items() for mid, w in row.items() if lacking(t, w)]:
            warn(f'{what}的作品（{len(items)} 件）：' + '、'.join(items))
    tested = [m['tested'] for m in model_list if m['tested']]
    updated = (datetime.fromtimestamp(max(stamps) / 1e9).date().isoformat() if stamps
               else max(tested, default=None) or date.today().isoformat())
    for c in categories:
        for t in c['tasks']:
            del t['_name']
    write_json(out / 'topic.json', {
        'id': topic.id, 'name': topic.name, 'name_en': topic.name_en, 'about': topic.coming_soon,
        'updated': updated, 'notice': notice, 'categories': categories, 'judges': judge_list,
    })
    write_json(out / 'models.json', model_list)
    write_json(out / 'works.json', works)
    write_json(out / 'votable.json', {'updated': updated, 'tasks': votable(works)})
    return {
        'id': topic.id, 'name': topic.name, 'name_en': topic.name_en, 'status': topic.website_status,
        'url': f'/{topic.id}/', 'accent': read_json(ctx.project / 'meta' / 'card.json')['accent'],
        'updated': updated, **({'about': topic.coming_soon} if topic.coming_soon else {}),
        'stats': [
            {'label': {'zh': '题目', 'en': 'Tasks'}, 'value': len(topic.tasks)},
            {'label': {'zh': '型号', 'en': 'Models'}, 'value': len(model_list)},
            {'label': {'zh': '作品', 'en': 'Works'}, 'value': sum(len(row) for row in works.values())},
        ],
    }


def confirm(ctx, model: str) -> None:
    """确认一个型号的作品可以公开：写进 publish/confirmed.json，并解除它在参测登记里的待审核标记。"""
    if ctx.include_private:
        raise ValueError('确认公开只使用公开参测登记')
    entry = next((m for m in registry(ctx, include_audited=True) if m['key'] == model), None)
    if entry is None:
        raise SystemExit(f'{ctx.topic.id} 没有公开登记这个型号：{model}')
    try:
        snapshot = load_confirmed(ctx)
    except FileNotFoundError:
        snapshot = {'models': []}
    snapshot['models'] = [m for m in snapshot['models'] if m['id'] != entry['id']] + [
        {'id': entry['id'], 'key': model, 'confirmed': date.today().isoformat()}]
    participants = ctx.topic.content_dir / '参测.json'
    registration = read_json(participants)
    audit = registration[model].pop('audit', None)
    save_confirmed(ctx, snapshot)
    if audit is not None:
        write_json(participants, registration)


def summary(card: dict, out: Path) -> list[str]:
    model_list = read_json(out / 'models.json')
    works = read_json(out / 'works.json')
    lines = [f'[{card["id"]}] {card["name"]}  更新于 {card["updated"]}，{len(model_list)} 个型号，'
             f'{sum(len(row) for row in works.values())} 件作品']
    for m in model_list:
        mine = [row[m['id']] for row in works.values() if m['id'] in row]
        lines.append(f'  {m["display_name"]}  作品 {len(mine)} 件，有图 {sum(bool(w["images"]) for w in mine)} 件，'
                     f'有下载包 {sum(bool(w["download"]) for w in mine)} 件')
    return lines
