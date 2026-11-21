"""Exercise assembly, independent build failures, and Pages redirects using temporary projects."""
from contextlib import ExitStack, redirect_stdout
from io import StringIO
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from website.tools import publish


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')


def script_result(file, path):
    html = file.read_text(encoding='utf-8')
    script = re.search(r'<script>(.*?)</script>', html, re.S).group(1)
    # Run the exact inline script shipped to the browser, including its 404 loop guard.
    code = """
const [script, pathname] = process.argv.slice(1);
const result = {url: null, canonical: null};
const location = {pathname, search:'?w=3%2F2', hash:'#rubric', replace:url => result.url = url};
const document = {createElement:() => ({}), head:{append:el => result.canonical = el.href}};
eval(script);
console.log(JSON.stringify(result));
"""
    return json.loads(subprocess.check_output(['node', '-e', code, script, path], text=True))


class PublishTests(unittest.TestCase):
    def setUp(self):
        stack = self.enterContext(ExitStack())
        self.root = Path(stack.enter_context(tempfile.TemporaryDirectory()))
        self.hub = self.root / 'hub'
        self.dist = self.root / 'dist'
        self.version = 1
        self.failed = set()
        self.missing_output = set()
        states = {'decathlon': 'online', 'second': 'online', 'draft': 'draft'}
        self.topics = {k: {'website_status': s} for k, s in states.items()}
        self.projects = {k: self.root / k for k in states}
        for project in [self.hub, *self.projects.values()]:
            project.mkdir()
            write(project / 'package.json', '{}')
        def card(topic, models, scores):
            return {'id': topic, 'name': topic.title(), 'url': f'/{topic}/', 'updated': scores['updated']}
        def hub_data(directory, cards):
            write(directory / 'topics.json', json.dumps({'topics': cards}))
        api = SimpleNamespace(TOPICS=self.topics, project_dir=self.projects.__getitem__,
                              topic_summary=card, write_hub=hub_data)
        stack.enter_context(patch.multiple(publish, CACHE=self.root / 'cache', HUB=self.hub, DIST=self.dist))
        stack.enter_context(patch.object(publish, 'exporter', return_value=api))
        stack.enter_context(patch.object(publish, 'run', side_effect=self.run_command))
        stack.enter_context(redirect_stdout(StringIO()))

    def run_command(self, cmd, cwd=None, env=None):
        if '--confirmed' in cmd:
            dest = Path(cmd[cmd.index('--out') + 1])
            topic = cmd[cmd.index('--topic') + 1]
            self.assertEqual(self.topics[topic]['website_status'], 'online')
            write(dest / 'models.json', '[]')
            write(dest / 'scores.json', json.dumps({'order': [], 'scores': {}, 'updated': self.version}))
            return
        self.assertEqual(cmd[1:], ['run', 'build'])
        self.assertFalse((cwd / 'dist').exists())
        source = Path(env['ONESHOT_SITE_DATA_DIR'])
        self.assertTrue(source.is_absolute())
        dist = cwd / 'dist'
        shutil.copytree(source, dist / 'data')
        if cwd.name in self.failed:
            raise subprocess.CalledProcessError(2, cmd)
        if cwd.name in self.missing_output:
            return
        write(dist / 'index.html', f'{cwd.name} {self.version}')
        write(dist / 'en/index.html', f'{cwd.name} English {self.version}')
        if cwd != self.hub:
            write(dist / 'en/models/sample/index.html', 'topic model')
            write(dist / 'about/index.html', 'topic about')
            write(dist / 'custom.html', 'topic standalone route')

    def cards(self):
        data = json.loads((self.dist / 'data/topics.json').read_text(encoding='utf-8'))
        return {c['id']: c['updated'] for c in data['topics']}

    def test_served_routes_canonical_and_404(self):
        lines = publish.build()
        self.assertTrue(any('[second]' in line for line in lines))
        self.assertIn('3 个旧网址跳转页', lines[-1])
        self.assertEqual((self.dist / 'index.html').read_text(), 'hub 1')
        self.assertEqual((self.dist / 'en/index.html').read_text(), 'hub English 1')
        self.assertEqual((self.dist / 'decathlon/index.html').read_text(), 'decathlon 1')
        self.assertEqual((self.dist / 'decathlon/en/index.html').read_text(), 'decathlon English 1')
        self.assertTrue((self.dist / '.nojekyll').is_file())
        domain = (self.dist / 'CNAME').read_text().strip()
        self.assertEqual(self.cards(), {'decathlon': 1, 'second': 1})
        self.assertFalse((self.dist / 'draft').exists())
        self.assertFalse((self.projects['draft'] / 'dist').exists())
        for name, target in [('en/models/sample/index.html', '/decathlon/en/models/sample/'),
                             ('custom.html', '/decathlon/custom.html')]:
            page = self.dist / name
            self.assertIn(f'<link rel="canonical" href="https://{domain}{target}">', page.read_text(encoding='utf-8'))
            self.assertEqual(script_result(page, '/' + name)['url'], target + '?w=3%2F2#rubric')
        missing = self.dist / '404.html'
        self.assertEqual(script_result(missing, '/retired/item'), {
            'url': '/decathlon/retired/item?w=3%2F2#rubric', 'canonical': f'https://{domain}/decathlon/retired/item'})
        self.assertEqual(script_result(missing, '/en/retired/item/'), {
            'url': '/decathlon/en/retired/item/?w=3%2F2#rubric', 'canonical': f'https://{domain}/decathlon/en/retired/item/'})
        for current in ('/', '/index.html', '/en', '/en/', '/en/index.html', '/decathlon', '/decathlon/retired/item', '/second/dead/'):
            self.assertIsNone(script_result(missing, current)['url'])

    def test_one_topic_falls_back_including_its_hub_card(self):
        publish.build()
        self.version = 2
        self.failed.add('decathlon')
        publish.build()
        self.assertEqual(self.cards(), {'decathlon': 1, 'second': 2})
        self.assertEqual((self.dist / 'decathlon/index.html').read_text(), 'decathlon 1')
        self.assertEqual((self.dist / 'second/index.html').read_text(), 'second 2')
        self.assertEqual((self.dist / 'index.html').read_text(), 'hub 2')

    def test_first_failure_without_cache_cannot_publish_an_empty_site(self):
        self.failed.add('second')
        publish.build()
        self.assertEqual(self.cards(), {'decathlon': 1})
        self.topics['decathlon']['website_status'] = 'draft'
        with self.assertRaises(SystemExit):
            publish.build()
        self.assertEqual(self.cards(), {'decathlon': 1})

    def test_failed_hub_build_keeps_previous_assembled_site(self):
        publish.build()
        self.version = 2
        self.missing_output.add('hub')
        with self.assertRaisesRegex(ValueError, 'index.html'):
            publish.build()
        self.assertEqual((self.hub / 'dist/index.html').read_text(), 'hub 1')
        self.assertEqual(self.cards(), {'decathlon': 1, 'second': 1})


if __name__ == '__main__':
    unittest.main()
