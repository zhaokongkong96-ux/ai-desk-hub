"""Meaningful safety tests for unattended publishing; stdlib only, no network."""
import importlib.util,json,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('refresh',Path(__file__).with_name('refresh-feeds.py'));refresh=importlib.util.module_from_spec(spec);spec.loader.exec_module(refresh)
PROJECT=dict(id='existing',name='Existing',repo_url='https://github.com/example/hardware',origin='awesome-directory')
DISCOVERY=dict(id='github-4',name='example/assistant',repo_url='https://github.com/example/assistant',origin='github-discovery')
PREVIOUS=dict(schemaVersion=1,generatedAt='2026-10-26T08:17:00+08:00',projects=[PROJECT,DISCOVERY],sources=[])
class Feeds(unittest.TestCase):
    def test_radar_all_fail_keeps_old_timestamp_and_ids(self):
        with patch.object(refresh,'fetch_json',side_effect=OSError('offline')):data,fresh=refresh.refresh_radar(PREVIOUS)
        self.assertFalse(fresh);self.assertEqual(data['generatedAt'],PREVIOUS['generatedAt']);self.assertTrue(data['refreshError']);self.assertEqual({p['id'] for p in data['projects']},{'existing','github-4'})
    def test_partial_failure_does_not_lose_directory(self):
        def get(url):
            if url==refresh.UPSTREAM:raise OSError()
            return {'items':[dict(id=4,full_name='example/assistant',name='assistant',html_url='https://github.com/example/assistant',description='AI voice ESP32 hardware',topics=[],license=None)]}
        with patch.object(refresh,'fetch_json',side_effect=get):data,fresh=refresh.refresh_radar(PREVIOUS)
        self.assertTrue(fresh);self.assertFalse(data['sources'][0]['ok']);self.assertEqual(len(data['projects']),2)
    def test_bad_links_and_job_lists_not_published(self):
        def get(url):return {'items':[dict(id=1,name='AI-jobs',full_name='a/AI-jobs',html_url='https://github.com/a/jobs'),dict(id=2,name='assistant',full_name='a/assistant',html_url='javascript:alert(1)')]}
        with patch.object(refresh,'fetch_json',side_effect=get):items,status=refresh.search(refresh.QUERIES[0])
        self.assertTrue(status['ok']);self.assertEqual(items,[])
    def test_topic_outage_preserves_date_not_fake_today(self):
        old=dict(schemaVersion=1,generatedAt='2026-10-26T08:17:00+08:00',items=[dict(id='old',title='Old',publishedAt='2026-10-26T08:00:00+08:00')],sources=[])
        with patch('urllib.request.urlopen',side_effect=OSError('offline')):data,fresh=refresh.refresh_topics(old)
        self.assertFalse(fresh);self.assertTrue(data['refreshError']);self.assertEqual(data['generatedAt'],old['generatedAt']);self.assertEqual(data['items'],old['items'])
    def test_config_has_one_daily_schedule_and_no_content_write(self):
        text=(refresh.ROOT/'.github/workflows/deploy.yml').read_text();self.assertIn('17 0 * * *',text);self.assertIn('contents: read',text);self.assertIn('scripts/refresh-feeds.py --restore-published',text)
if __name__=='__main__':unittest.main()
