"""Build each online topic from its confirmed snapshot, assemble website/dist and publish it."""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
HUB = TOOLS.parent / 'hub'
DIST = TOOLS.parent / 'dist'
CACHE = TOOLS.parent / '.build-cache'
REPO = TOOLS.parent.parent
CONFIG = TOOLS / 'publish.json'
SITE_CONFIG = TOOLS / 'site.json'


def config():
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def held():
    """site.json "hold": true pauses every push (manual or automatic): publish only builds until the user lifts it."""
    try:
        return bool(json.loads(SITE_CONFIG.read_text(encoding='utf-8')).get('hold'))
    except FileNotFoundError:
        return False


def run(cmd, cwd=None, env=None):
    print('>', ' '.join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], cwd=cwd, env=env, check=True)


def exporter():
    if str(TOOLS) not in sys.path:
        sys.path.insert(0, str(TOOLS))
    import export_data
    return export_data


def build_project(project, data, work):
    """Run the project's native build and require a freshly generated dist/index.html."""
    if not (project / 'package.json').is_file():
        raise FileNotFoundError(f'没有找到网页项目 {project / "package.json"}')
    npm = shutil.which('npm') or 'npm'
    if not (project / 'node_modules').is_dir() and (project / 'package-lock.json').is_file():
        run([npm, 'ci'], cwd=project)
    dist = project / 'dist'
    previous = work / 'previous-project-dist'
    if dist.exists():
        dist.rename(previous)
    try:
        env = os.environ | {'ONESHOT_SITE_DATA_DIR': str(data.resolve())}
        if project == HUB:
            env['ONESHOT_HUB_DATA_DIR'] = str(data.resolve())
        run([npm, 'run', 'build'], cwd=project, env=env)
        if not (dist / 'index.html').is_file():
            raise ValueError(f'构建没有产出 {dist / "index.html"}')
    except BaseException:
        if dist.exists():
            dist.rename(work / 'failed-project-dist')
        if previous.exists():
            previous.rename(dist)
        raise
    return dist


def replace_tree(source, destination):
    """Install a fully staged directory on the same volume, restoring the prior tree on failure."""
    previous = destination.with_name(destination.name + '.previous')
    if previous.exists():
        if destination.exists():
            shutil.rmtree(previous)
        else:
            previous.rename(destination)
    if destination.exists():
        destination.rename(previous)
    try:
        source.rename(destination)
    except BaseException:
        if previous.exists():
            previous.rename(destination)
        raise
    if previous.exists():
        shutil.rmtree(previous)


def build_topic(topic, work):
    data = work / 'data'
    site = exporter()
    run([sys.executable, '-B', TOOLS / 'export_data.py', '--topic', topic, '--confirmed', '--out', data])
    models = json.loads((data / 'models.json').read_text(encoding='utf-8'))
    scores = json.loads((data / 'scores.json').read_text(encoding='utf-8'))
    card = site.topic_summary(topic, models, scores)
    dist = build_project(site.project_dir(topic), data, work)
    artifact = work / 'artifact'
    shutil.copytree(dist, artifact / 'site')
    metadata = {'card': card, 'summary': summary(card, models, scores)}
    (artifact / 'result.json').write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
    return artifact


def redirect_page(target, domain):
    canonical = html.escape(f'https://{domain}{target}', quote=True)
    link = html.escape(target, quote=True)
    return f'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>十项全能 · 页面已迁移</title>
<link rel="canonical" href="{canonical}">
<script>location.replace({json.dumps(target)} + location.search + location.hash);</script>
<a href="{link}">前往十项全能新地址</a>
</html>
'''


def not_found_page(legacy, mounts, domain):
    script = ''
    if legacy:
        script = f'''<script>
const path = location.pathname;
const mounts = {json.dumps(mounts)};
const hubHome = ['/', '/index.html', '/en', '/en/', '/en/index.html'].includes(path);
if (!hubHome && !mounts.some(base => path === base.slice(0, -1) || path.startsWith(base))) {{
  const target = {json.dumps(legacy.rstrip('/'))} + path;
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = {json.dumps('https://' + domain)} + target;
  document.head.append(canonical);
  location.replace(target + location.search + location.hash);
}}
</script>'''
    return f'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>页面未找到</title>
{script}
<p>没有找到此页面。<a href="/">返回总站首页</a></p>
</html>
'''


def assemble(hub_dist, topics, out, domain):
    """Mount complete artifacts first, then generate old URLs from the shipped Decathlon pages."""
    shutil.copytree(hub_dist, out)
    legacy = None
    legacy_source = None
    mounts = []
    for topic, url, source in topics:
        if not re.fullmatch(r'/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)+', url):
            raise ValueError(f'专题 {topic} 的站内路径无效：{url}')
        shutil.copytree(source, out / url.strip('/'))
        mounts.append(url)
        if topic == 'decathlon':
            legacy = url
            legacy_source = source
    count = 0
    if legacy_source:
        for page in sorted(legacy_source.rglob('*.html')):
            relative = page.relative_to(legacy_source).as_posix()
            if relative in ('index.html', 'en/index.html', '404.html'):
                continue
            dest = out / relative
            if dest.exists():
                raise ValueError(f'十项全能旧网址与总站或专题冲突：/{relative}')
            route = relative.removesuffix('index.html') if page.name == 'index.html' else relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(redirect_page(legacy + route, domain), encoding='utf-8')
            count += 1
    (out / '404.html').write_text(not_found_page(legacy, mounts, domain), encoding='utf-8')
    (out / 'CNAME').write_text(domain + '\n', encoding='utf-8')
    (out / '.nojekyll').touch()
    return count


def build():
    site = exporter()
    CACHE.mkdir(parents=True, exist_ok=True)
    cards, topics, lines = [], [], []
    online = [key for key, manifest in site.TOPICS.items() if manifest['website_status'] == 'online']
    with tempfile.TemporaryDirectory(prefix='build-', dir=CACHE) as folder:
        work = Path(folder)
        for topic in online:
            topic_work = work / 'topics' / topic
            topic_work.mkdir(parents=True)
            cache = CACHE / 'topics' / topic
            cache.parent.mkdir(exist_ok=True)
            try:
                artifact = build_topic(topic, topic_work)
                replace_tree(artifact, cache)
            except (OSError, KeyError, ValueError, subprocess.CalledProcessError) as exc:
                if not cache.exists() and cache.with_name(topic + '.previous').exists():
                    cache.with_name(topic + '.previous').rename(cache)
                if not (cache / 'site/index.html').is_file():
                    print(f'[{topic}] 构建失败且没有成功缓存，本次跳过：{exc}', flush=True)
                    continue
                print(f'[{topic}] 构建失败，沿用上次成功的成品：{exc}', flush=True)
            saved = json.loads((cache / 'result.json').read_text(encoding='utf-8'))
            cards.append(saved['card'])
            topics.append((topic, saved['card']['url'], cache / 'site'))
            lines.extend(saved['summary'])
        if online and not topics:
            raise SystemExit('所有上线专题均构建失败且没有缓存，保留原整站成品')
        hub_work = work / 'hub'
        hub_work.mkdir()
        hub_data = hub_work / 'data'
        site.write_hub(hub_data, cards)
        hub_dist = build_project(HUB, hub_data, hub_work)
        count = assemble(hub_dist, topics, work / 'site', config()['domain'])
        replace_tree(work / 'site', DIST)
        site.write_hub(HUB / 'data', cards)
    return lines + [f'整站已生成至 {DIST}，含 {count} 个旧网址跳转页。']


def pushed_note(cfg):
    return f'已推送到 {cfg["branch"]} 分支；https://{cfg["domain"]}/ 在 DCDN 网页缓存到期后更新'


def deploy(cfg):
    """Copy dist into a throwaway repo with CNAME and .nojekyll, commit once, force-push it as the Pages branch."""
    remote = subprocess.run(['git', '-C', str(REPO), 'remote', 'get-url', 'origin'],
                            capture_output=True, text=True, check=True).stdout.strip()
    with tempfile.TemporaryDirectory(prefix='octathlon-pages-') as tmp:
        out = Path(tmp) / 'site'
        shutil.copytree(DIST, out)
        git = ['git', '-C', str(out), '-c', 'core.autocrlf=false']
        run(git + ['init', '-q', '-b', cfg['branch']])
        run(git + ['add', '-A'])
        stamp = datetime.now().strftime('%Y-%m-%d %H:%M')
        run(git + ['-c', 'user.name=Wendystar', '-c', 'user.email=wendystar1145@gmail.com',
                   'commit', '-q', '-m', f'发布成绩网站 {stamp}'])
        run(git + ['push', '-q', '--force', remote, f'HEAD:{cfg["branch"]}'])
    print(pushed_note(cfg) + '。', flush=True)


def summary(card, models, scores):
    """Print the actual built ranking under this topic's name."""
    models = {m['id']: m['name'] for m in models}
    lines = [f'[{card["id"]}] {card["name"]}  成绩日期 {scores["updated"]}，{len(models)} 个模型']
    for mid in scores['order']:
        s = scores['scores'][mid]
        lines.append(f'  {s["rank"] or "评测中"}  {models[mid]}  {"—" if s["total"] is None else s["total"]}'
                     + ('' if s['rank'] else f'（已出 {s["done"]} 题）'))
    return lines


def main(argv=()):
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='只发布已确认成绩；新成绩须用户明确确认')
    ap.add_argument('--no-upload', action='store_true')
    ap.add_argument('--confirm', nargs=2, metavar=('专题', '厂商/型号'))
    args = ap.parse_args(argv)
    sys.path.insert(0, str(REPO / 'orchestrator'))
    import common
    CACHE.mkdir(parents=True, exist_ok=True)
    with common.singleton(CACHE / 'publish.lock', 600):
        if args.confirm:
            if args.confirm[0] not in exporter().TOPICS:
                ap.error(f'没有登记这个专题：{args.confirm[0]}')
            with common.locked():
                exporter().confirm_model(*args.confirm)
        print('\n'.join(build()), flush=True)
        if args.no_upload:
            print('按 --no-upload 仅构建已确认正式成绩，没有推送。', flush=True)
            return
        if held():
            print('site.json 的 hold 打开：推送暂停，只构建，没有推送。', flush=True)
            return
        deploy(config())


if __name__ == '__main__':
    main(sys.argv[1:])
