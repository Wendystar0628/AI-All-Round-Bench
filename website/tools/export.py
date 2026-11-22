"""Export topic projects and maintain the public and local hub indexes."""
import argparse
from contextlib import contextmanager
from datetime import date
from functools import cache
import importlib.util
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import export_core as core
import common
import layout
from topic import topic, topics

HUB = TOOLS.parent / 'hub'
CACHE = TOOLS.parent / '.build-cache'


def context(topic_id, include_private=False, *, live=False):
    return core.Context(topic(topic_id), layout.site_project(topic_id), include_private, live)


@cache
def _load_plugin(topic_id, project):
    path = project / 'export.py'
    name = f'oneshot_website_{topic_id}'
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
        for entry in ('export', 'confirm', 'summary'):
            if not callable(getattr(module, entry, None)):
                raise ValueError(f'{path} 缺少插件函数 {entry}')
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return module


def plugin(ctx):
    return _load_plugin(ctx.topic.id, ctx.project)


def write_hub(out, cards):
    cards = list(cards)
    updated = max((card['updated'] for card in cards), default=date.today().isoformat())
    core.write_json(out / 'topics.json', {'updated': updated, 'topics': cards})


def update_index(folder, cards, eligible):
    path = folder / 'topics.json'
    existing = core.read_json(path)['topics'] if path.is_file() else []
    by_id = {card['id']: card for card in existing}
    by_id.update(cards)
    write_hub(folder, (by_id[key] for key in eligible if key in by_id))


@contextmanager
def preview_lock():
    CACHE.mkdir(parents=True, exist_ok=True)
    with common.singleton(CACHE / 'preview-data.lock', 1800):
        yield


def refresh_previews(topic_id=None, live=False):
    available = {key: item for key, item in topics().items() if item.website_status != 'none'}
    if topic_id is not None and topic_id not in available:
        return
    selected = [topic_id] if topic_id else available
    local_cards, formal_cards = {}, {}
    with preview_lock():
        for key in selected:
            local = context(key, include_private=True, live=live)
            site = plugin(local)
            if available[key].website_status == 'online':
                public = context(key, live=live)
                site.export(public, public.project / 'data', formal=False)
                if not live:
                    with tempfile.TemporaryDirectory(dir=CACHE) as folder:
                        formal_cards[key] = site.export(public, Path(folder), formal=True)
            local_cards[key] = site.export(local, local.project / 'data-local', formal=False)
        update_index(HUB / 'data-local', local_cards, available)
        if not live:
            online = (key for key, item in available.items() if item.website_status == 'online')
            update_index(HUB / 'data', formal_cards, online)


def main(argv=None):
    ap = argparse.ArgumentParser(description='导出专题网站与总站卡片')
    ap.add_argument('--topic', metavar='ID')
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument('--live', action='store_true', help='更新实时数据和本地卡片，补齐缺少的静态文件')
    mode.add_argument('--formal', action='store_true', help='将一个上线专题的确认数据导出到独立目录')
    ap.add_argument('--out', type=Path)
    args = ap.parse_args(argv)
    if args.formal != (args.out is not None) or (args.formal and not args.topic):
        ap.error('正式导出需要同时指定 --topic、--formal 和 --out')
    if args.topic:
        status = topic(args.topic).website_status
        if status == 'none':
            print(f'{args.topic} 没有站点，跳过导出。')
            return
        if args.formal and status != 'online':
            ap.error('只有上线专题可以正式导出')
    if args.formal:
        out = args.out.resolve()
        projects = [HUB, *(layout.site_project(key) for key in topics())]
        if any(out.is_relative_to((project / folder).resolve())
               for project in projects for folder in ('data', 'data-local')):
            ap.error('--out 须指向独立的正式构建目录')
        ctx = context(args.topic)
        plugin(ctx).export(ctx, out, formal=True)
    else:
        refresh_previews(args.topic, args.live)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
