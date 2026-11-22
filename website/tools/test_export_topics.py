"""Topic isolation, public snapshots, local registrations and live refreshes."""
from contextlib import ExitStack, redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export as site
import export_core as core


class TopicExports(unittest.TestCase):
    def setUp(self):
        stack = self.enterContext(ExitStack())
        self.root = Path(stack.enter_context(TemporaryDirectory()))
        self.hub = self.root / 'hub'
        self.topics = {key: SimpleNamespace(id=key, name=key, name_en=key, website_status=status, coming_soon=None)
                       for key, status in [('first', 'online'), ('second', 'draft'), ('hidden', 'none')]}
        stack.enter_context(patch.multiple(site, HUB=self.hub, CACHE=self.root / 'cache',
                                           topics=lambda: self.topics, topic=self.topics.__getitem__))
        stack.enter_context(patch.object(site.layout, 'site_project', side_effect=lambda key: self.root / key))
        stack.enter_context(redirect_stdout(StringIO()))
        self.calls = []
        self.value = 40

        def export(ctx, out, formal):
            key = ctx.topic.id
            self.calls.append((key, ctx.include_private, ctx.live, formal))
            value = 20 if formal else self.value
            card = {'id': key, 'updated': '2026-01-02', 'stats': [{'value': value}]}
            core.write_json(out / 'fixture.json', card)
            return card

        stack.enter_context(patch.object(site, 'plugin', return_value=SimpleNamespace(export=export)))

    def index(self, name):
        return core.read_json(self.hub / name / 'topics.json')['topics']

    def test_refresh_preserves_other_cards_and_skips_no_site(self):
        site.refresh_previews()
        public = self.index('data')
        local = self.index('data-local')
        self.assertEqual([r['id'] for r in public], ['first'])
        self.assertEqual(public[0]['stats'][0]['value'], 20)
        self.assertEqual([r['id'] for r in local], ['first', 'second'])
        self.assertTrue((self.root / 'first/data-local/fixture.json').is_file())
        self.assertFalse((self.root / 'second/data').exists())
        self.assertFalse((self.root / 'hidden').exists())
        self.calls.clear()
        self.value = 72
        site.main(['--topic', 'first', '--live'])
        self.assertEqual(self.calls, [('first', False, True, False), ('first', True, True, False)])
        after = self.index('data-local')
        self.assertEqual(after[0]['stats'][0]['value'], 72)
        self.assertEqual(after[1], local[1])
        self.assertEqual(self.index('data'), public)
        self.calls.clear()
        site.main(['--topic', 'hidden'])
        self.assertEqual(self.calls, [])

    def test_coming_soon_topics_get_a_card_until_they_have_one(self):
        line = {'zh': '一句', 'en': 'One line'}
        self.topics['hidden'].coming_soon = self.topics['second'].coming_soon = line
        site.refresh_previews()
        soon = {'id': 'hidden', 'name': 'hidden', 'name_en': 'hidden', 'status': 'soon', 'about': line}
        self.assertEqual(self.index('data'), [self.index('data')[0], soon | {'id': 'second', 'name': 'second', 'name_en': 'second'}, soon])
        self.assertEqual([r['id'] for r in self.index('data-local')], ['first', 'second', 'hidden'])
        self.assertNotIn('status', self.index('data-local')[1])

    def test_formal_requires_an_online_topic_and_separate_out(self):
        out = self.root / 'formal'
        site.main(['--topic', 'first', '--formal', '--out', str(out)])
        self.assertEqual(self.calls, [('first', False, False, True)])
        self.assertTrue((out / 'fixture.json').is_file())
        for args in (['--out', str(out)], ['--formal'], ['--formal', '--out', str(out)],
                     ['--topic', 'second', '--formal', '--out', str(out)],
                     ['--topic', 'first', '--live', '--formal', '--out', str(out)],
                     ['--topic', 'first', '--formal', '--out', str(self.root / 'first/data/nested')]):
            with self.subTest(args=args), redirect_stderr(StringIO()), self.assertRaises(SystemExit):
                site.main(args)

    def test_registration_visibility_and_topic_fields(self):
        icon = self.root / 'mark/test.svg'
        icon.parent.mkdir()
        icon.touch()

        def identity(key, private=False):
            return SimpleNamespace(key='Test/' + key, id=key, name=key, short=key, aliases=[],
                                   vendor='Test', region='test', logo='test', private=private)

        def participant(key, audit=False):
            return SimpleNamespace(agent='agent-' + key, effort='medium', tested=None, audit=audit)

        identities = [identity('shared'), identity('held'), identity('local', private=True)]
        first = self.topics['first']
        first.participants = lambda include_private: ({
            'Test/shared': participant('first'), 'Test/held': participant('held', audit=True),
        } | ({'Test/local': participant('local')} if include_private else {}))
        second = self.topics['second']
        second.participants = lambda include_private: {'Test/shared': participant('second')}
        with patch.object(core.models, 'identities', side_effect=lambda include_private: identities if include_private else identities[:2]), \
                patch.object(core.layout, 'vendor_icons', return_value=self.root):
            public = core.registry(site.context('first'))
            audited = core.registry(site.context('first'), include_audited=True)
            local = core.registry(site.context('first', include_private=True), include_audited=True)
            other = core.registry(site.context('second', include_private=True))
        self.assertEqual([m['id'] for m in public], ['shared'])
        self.assertEqual([m['id'] for m in audited], ['shared', 'held'])
        self.assertEqual([m['id'] for m in local], ['shared', 'held', 'local'])
        self.assertEqual([(m['key'], m['agent']) for m in other], [('Test/shared', 'agent-second')])


if __name__ == '__main__':
    unittest.main()
