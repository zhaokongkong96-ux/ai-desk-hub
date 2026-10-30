import copy,datetime as dt,unittest
from unittest.mock import patch
import hotlist
NOW=dt.datetime(2026,10,30,8,17,tzinfo=hotlist.ZONE)
def repo(name,stars=100,daily=None,threads=0,release=None):return dict(name=name,url='https://github.com/'+name,stars=stars,dailyStars=daily,activeThreads=threads,release=release)
class Hotlist(unittest.TestCase):
    def test_cumulative_stars_never_outrank_momentum(self):
        items,_=hotlist.rank([repo('a/old',1000000,1),repo('a/new',100,200)],[],NOW)
        self.assertEqual(items[0]['name'],'a/new')
    def test_repeat_penalty_and_labels(self):
        history=[dict(date='2026-10-29',collectedAt='2026-10-29T08:17:00+08:00',shown=['a/repeat'],metrics={})]
        items,h=hotlist.rank([repo('a/repeat',daily=100),repo('a/new',daily=100)],history,NOW)
        self.assertEqual(items[0]['label'],'今日新上榜');self.assertEqual(items[1]['label'],'持续热门');self.assertLess(items[1]['score'],items[0]['score'])
        self.assertEqual(items[1]['shownDays7'],1)
    def test_actual_window_and_no_initial_estimate(self):
        history=[dict(date='2026-10-28',collectedAt='2026-10-28T08:17:00+08:00',shown=[],metrics={'a/new':{'stars':20}})]
        items,_=hotlist.rank([repo('a/new',100)],history,NOW)
        self.assertEqual(items[0]['growth']['count'],80);self.assertEqual(items[0]['growth']['hours'],48)
        items,_=hotlist.rank([repo('a/new',100000)],[],NOW);self.assertEqual(items,[])
    def test_major_release_not_push_or_patch_or_prerelease(self):
        release=dict(tag='v2.0.0',publishedAt=NOW.isoformat(),url='https://github.com/a/new/releases/tag/v2.0.0')
        items,_=hotlist.rank([repo('a/new',release=release)],[],NOW);self.assertEqual(items[0]['label'],'重大更新')
        release['tag']='v2.0.1';items,_=hotlist.rank([repo('a/new',release=release)],[],NOW);self.assertEqual(items,[])
    def test_history_prunes_and_same_day_does_not_count_as_repeat(self):
        history=[dict(date=d,collectedAt=d+'T08:17:00+08:00',shown=['a/new'],metrics={}) for d in ['2026-10-22','2026-10-30']]
        items,h=hotlist.rank([repo('a/new',daily=1)],history,NOW)
        self.assertEqual(items[0]['label'],'今日新上榜');self.assertEqual(len(h),1)
    def test_outage_preserves_timestamp_items_and_history(self):
        previous=dict(generatedAt='2026-10-29T08:17:00+08:00',items=[repo('a/new')],history=[dict(date='2026-10-29')])
        with patch.object(hotlist,'trending',side_effect=OSError()):data,ok=hotlist.collect(previous,lambda u:(_ for _ in ()).throw(OSError()),NOW)
        self.assertFalse(ok);self.assertEqual(data['generatedAt'],previous['generatedAt']);self.assertEqual(data['history'],previous['history']);self.assertEqual(data['items'],previous['items']);self.assertTrue(data['refreshError'])
if __name__=='__main__':unittest.main()
