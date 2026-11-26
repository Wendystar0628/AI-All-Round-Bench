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
import urllib.request
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True
TOOLS = Path(__file__).resolve().parent
HUB = TOOLS.parent / 'hub'
DIST = TOOLS.parent / 'dist'
CACHE = TOOLS.parent / '.build-cache'
REPO = TOOLS.parent.parent
CONFIG = TOOLS / 'publish.json'
SITE_CONFIG = TOOLS / 'site.json'
sys.path.insert(0, str(REPO / 'orchestrator'))
sys.path.insert(0, str(TOOLS))

from topic import topics
import common


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
    import export
    return export


def build_project(project, data, work, base):
    """Run the project's native build and require a freshly generated dist/index.html and dist/en/index.html."""
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
        # ONESHOT_VOTES_API: origin of the audience ballot box (publish.json votes_api); sites without votes ignore it
        env = os.environ | {'ONESHOT_SITE_DATA_DIR': str(data.resolve()), 'ONESHOT_SITE_BASE': base,
                            'ONESHOT_VOTES_API': config().get('votes_api', '')}
        run([npm, 'run', 'build'], cwd=project, env=env)
        for entry in ('index.html', 'en/index.html'):
            if not (dist / entry).is_file():
                raise ValueError(f'构建没有产出 {dist / entry}')
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


def snapshot_votes(topic, data):
    """Topics that export votable.json get the ballot box's tally at publish time as data/votes.json (the
    fallback and archive in website/topics/aesthetics/docs/votes.md 9.3), from publish.json votes_api. An
    unreachable box never fails the publish: the last published snapshot is kept when there is one,
    otherwise the site ships without it."""
    if not (data / 'votable.json').is_file():
        return
    url = f'{config().get("votes_api", "").rstrip("/")}/api/votes/v1/{topic}/tally'
    try:
        if not url.startswith('http'):
            raise ValueError('publish.json 没有 votes_api')
        request = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'octathlon-publish'})
        with urllib.request.urlopen(request, timeout=10) as response:
            tally = json.loads(response.read().decode('utf-8'))
        if not isinstance(tally, dict) or not isinstance(tally.get('tasks'), dict):
            raise ValueError('返回的不是计票')
    except Exception as exc:
        previous = CACHE / 'topics' / topic / 'site' / 'data' / 'votes.json'
        if previous.is_file():
            shutil.copy2(previous, data / 'votes.json')
        print(f'[{topic}] 票数接口取不到（{exc}），{"沿用上次发布的票数快照" if previous.is_file() else "这次不带票数快照"}', flush=True)
        return
    (data / 'votes.json').write_text(json.dumps(tally, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'[{topic}] 票数快照取自 {url}', flush=True)


def build_topic(topic, work):
    data = work / 'data'
    site = exporter()
    ctx = site.context(topic)
    plugin = site.plugin(ctx)
    card = plugin.export(ctx, data, formal=True)
    snapshot_votes(topic, data)
    base = f'/{topic}/'
    if card['id'] != topic or card['url'] != base:
        raise ValueError(f'专题 {topic} 的卡片与挂载路径 {base} 不一致')
    dist = build_project(ctx.project, data, work, base)
    artifact = work / 'artifact'
    shutil.copytree(dist, artifact / 'site')
    declaration = ctx.project / 'publish' / 'legacy-routes.json'
    metadata = {
        'card': card, 'summary': plugin.summary(card, data),
        'legacy': json.loads(declaration.read_text(encoding='utf-8')) if declaration.is_file() else None,
    }
    (artifact / 'result.json').write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
    return artifact


def redirect_page(target, domain, title, link_text):
    canonical = html.escape(f'https://{domain}{target}', quote=True)
    link = html.escape(target, quote=True)
    return f'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>{html.escape(title)}</title>
<link rel="canonical" href="{canonical}">
<script>location.replace({json.dumps(target)} + location.search + location.hash);</script>
<a href="{link}">{html.escape(link_text)}</a>
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


def assemble(hub_dist, packages, out, domain):
    """Mount online projects and emit the old paths frozen in their declarations."""
    shutil.copytree(hub_dist, out)
    mounts = []
    for topic, source, declaration in packages:
        mount = out / topic
        if mount.exists():
            raise ValueError(f'专题路径与总站或其他专题冲突：/{topic}/')
        shutil.copytree(source, mount)
        mounts.append(f'/{topic}/')

    legacy = None
    count = 0
    for topic, source, declaration in packages:
        if declaration is None:
            continue
        base = f'/{topic}/'
        if declaration['fallback']:
            if legacy is not None:
                raise ValueError(f'多个专题声明了 404 兜底：{legacy}、{base}')
            legacy = base
        for relative in declaration['routes']:
            parts = relative.split('/')
            if (not relative.endswith('.html') or any(part in ('', '.', '..') for part in parts)
                    or re.search(r'[\\:?#<>|"*%\x00-\x1f]', relative)):
                raise ValueError(f'专题 {topic} 的旧网址无效：{relative}')
            dest = out / relative
            if (dest.exists() or dest == out / '404.html'
                    or any(dest.is_relative_to(out / name) for name, _, _ in packages)
                    or any(parent.is_file() for parent in dest.parents if parent.is_relative_to(out))):
                raise ValueError(f'旧网址与总站、专题或其他旧网址冲突：/{relative}')
            route = relative.removesuffix('index.html') if parts[-1] == 'index.html' else relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(redirect_page(base + route, domain, declaration['title'], declaration['link_text']),
                            encoding='utf-8')
            count += 1
    (out / '404.html').write_text(not_found_page(legacy, mounts, domain), encoding='utf-8')
    (out / 'CNAME').write_text(domain + '\n', encoding='utf-8')
    (out / '.nojekyll').touch()
    return count


def build():
    site = exporter()
    CACHE.mkdir(parents=True, exist_ok=True)
    cards, packages, lines = [], [], []
    online = [topic.id for topic in topics().values() if topic.website_status == 'online']
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
            except (Exception, SystemExit) as exc:
                if not cache.exists() and cache.with_name(topic + '.previous').exists():
                    cache.with_name(topic + '.previous').rename(cache)
                if not (cache / 'site/index.html').is_file():
                    print(f'[{topic}] 构建失败且没有成功缓存，本次跳过：{exc}', flush=True)
                    continue
                print(f'[{topic}] 构建失败，沿用上次成功的成品：{exc}', flush=True)
            saved = json.loads((cache / 'result.json').read_text(encoding='utf-8'))
            cards.append(saved['card'])
            packages.append((topic, cache / 'site', saved['legacy']))
            lines.extend(saved['summary'])
        if online and not packages:
            raise SystemExit('所有上线专题均构建失败且没有缓存，保留原整站成品')
        hub_work = work / 'hub'
        hub_work.mkdir()
        hub_data = hub_work / 'data'
        site.write_hub(hub_data, cards)
        hub_dist = build_project(HUB, hub_data, hub_work, '/')
        count = assemble(hub_dist, packages, work / 'site', config()['domain'])
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


def main(argv=()):
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description='只发布已确认成绩；新成绩须用户明确确认')
    ap.add_argument('--no-upload', action='store_true')
    ap.add_argument('--confirm', nargs=2, metavar=('专题', '厂商/型号'))
    args = ap.parse_args(argv)
    CACHE.mkdir(parents=True, exist_ok=True)
    with common.singleton(CACHE / 'publish.lock', 600):
        if args.confirm:
            topic, model = args.confirm
            registry = topics()
            if topic not in registry:
                ap.error(f'没有登记这个专题：{topic}')
            if registry[topic].website_status == 'none':
                ap.error(f'专题 {topic} 没有站点，无法确认发布')
            site = exporter()
            ctx = site.context(topic)
            site.plugin(ctx).confirm(ctx, model)
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
