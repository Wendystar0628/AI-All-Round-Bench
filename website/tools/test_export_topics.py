"""Public snapshots, topic registrations and local previews have independent visibility."""
from contextlib import ExitStack, redirect_stdout
from io import StringIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from website.tools import export_data as site


def model(mid, **fields):
    return {'id': mid, 'key': f'Test/{mid}', 'name': mid, 'short': mid,
            'vendor': 'Test', 'region': 'test', 'logo': 'test', **fields}


def scores(rows, totals):
    order = sorted((row['id'] for row in rows), key=totals.__getitem__, reverse=True)
    records = {mid: {'rank': i, 'total': totals[mid], 'tasks': {}} for i, mid in enumerate(order, 1)}
    return {'updated': '2026-01-02', 'order': order, 'scores': records}


class TopicExports(unittest.TestCase):
    def setUp(self):
        stack = self.enterContext(ExitStack())
        self.root = Path(stack.enter_context(tempfile.TemporaryDirectory()))
        self.hub = self.root / 'hub'
        self.online = site.DEFAULT_TOPIC
        self.draft = 'draft-fixture'
        topics = {key: {'name': key, 'name_en': key, 'website_status': status, 'tasks': ['t'],
                        'categories': ['c'], 'paths': {'url': f'/{key}/', 'website': key}}
                  for key, status in [(self.online, 'online'), (self.draft, 'draft')]}
        stack.enter_context(patch.multiple(site, TOPICS=topics, BENCH=self.root, HUB=self.hub,
                                           LOGOS=self.root, TOOLS=self.root / 'tools',
                                           PRIVATE=self.root / 'private.json'))
        stack.enter_context(redirect_stdout(StringIO()))
        (self.root / 'test.svg').touch()
        site.write_json(site.TOOLS / 'models.json', [model('shared', tested='2000-01-01',
                                                          agent='old', effort='old', audit=True)])
        for key in topics:
            site.write_json(site.topic_dir(key) / 'participants.json',
                            {'Test/shared': {'agent': 'agent-' + key, 'effort': key}})
        site.write_json(site.PRIVATE, [model('local', tested='2000-01-02', topics={
            self.draft: {'agent': 'local', 'effort': 'local'}
        })])

    def test_only_this_topics_registration_supplies_participation_fields(self):
        for topic in (self.online, self.draft):
            rows = site.load_registry(topic=topic)
            self.assertEqual([m['id'] for m in rows], ['shared'])
            self.assertEqual(rows[0]['effort'], topic)
            self.assertEqual(rows[0]['agent'], 'agent-' + topic)
            self.assertNotIn('tested', rows[0])
            self.assertNotIn('audit', rows[0])
        public_preview = site.load_registry(topic=self.online, unpublished=True)
        draft_preview = site.load_registry(topic=self.draft, unpublished=True)
        self.assertEqual([m['id'] for m in public_preview], ['shared'])
        self.assertEqual([m['id'] for m in draft_preview], ['shared', 'local'])
        self.assertNotIn('tested', draft_preview[1])

    def test_hub_uses_confirmed_online_scores_and_keeps_unmodified_drafts_in_preview(self):
        totals = {'shared': 42, 'local': 60}
        def live(rows, categories, complete_only, *, topic):
            return scores(rows, totals)
        def confirmed(categories, *, topic):
            self.assertEqual(topic, self.online)
            rows = site.load_registry(topic=topic)
            return rows, scores(rows, {'shared': 20})

        with patch.object(site, 'load_tasks', return_value=([], [])), \
                patch.object(site, 'latest_session_date', return_value=None), \
                patch.object(site, 'build_scores', side_effect=live) as build, \
                patch.object(site, 'confirmed_data', side_effect=confirmed):
            site.refresh_previews(site.TOPICS, False)
            self.assertFalse((site.project_dir(self.draft) / 'data').exists())
            public_hub = self.hub / 'data' / 'topics.json'
            public = site.read_json(public_hub)['topics']
            self.assertEqual([(row['id'], row['top'][0]['total']) for row in public], [(self.online, 20)])
            local_hub = self.hub / 'data-local' / 'topics.json'
            before = site.read_json(local_hub)['topics']
            self.assertEqual([(row['id'], row['ranked']) for row in before],
                             [(self.online, 1), (self.draft, 2)])
            self.assertEqual(before[1]['top'][0]['id'], 'local')
            build.reset_mock()
            totals['shared'] = 90
            site.refresh_previews([self.online], True)
            build.assert_called_once()
            after = site.read_json(local_hub)['topics']
            self.assertEqual(after[0]['top'][0]['total'], 90)
            self.assertEqual(after[1], before[1])
            self.assertEqual(site.read_json(public_hub)['topics'], public)


if __name__ == '__main__':
    unittest.main()
