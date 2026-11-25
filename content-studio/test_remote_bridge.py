"""Failure recovery must resend receipts, never repeat an uncertain production action."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

sandbox=tempfile.TemporaryDirectory()
os.environ['STUDIO_DATA']=sandbox.name
from remote_bridge import Bridge, DATA

class ReceiptRecovery(unittest.TestCase):
    def bridge(self):
        (DATA/'access-token').write_text('local-test-token')
        (DATA/'remote').mkdir(exist_ok=True)
        b=Bridge({'url':'https://test.invalid','machine_token':'test-only'})
        b.local.close();b.remote.close();b.local=Mock();b.send=Mock(return_value={'ok':True});return b
    def test_failed_snapshot_retries_receipt_without_repeating_action(self):
        b=self.bridge();ident='a'*32
        b.local.request.return_value.status_code=200
        b.local.request.return_value.json.return_value={'id':'original-video-job'}
        b.snapshot=Mock(side_effect=[ConnectionError('temporary snapshot upload failure'),None])
        with self.assertRaises(ConnectionError):b.process({'id':ident,'method':'POST','path':'/api/topics/'+'b'*32+'/produce','body':{}})
        self.assertEqual(b.local.request.call_count,1)
        b.publish_receipts()
        self.assertEqual(b.local.request.call_count,1)
        self.assertTrue(json.loads((b.receipts/(ident+'.json')).read_text())['acked'])
    def test_crash_with_uncertain_action_is_reported_without_replay(self):
        b=self.bridge();ident='c'*32;path=b.receipts/(ident+'.json');path.write_text('{"started_at":1}')
        b.pending_receipts={ident:path};b.snapshot=Mock();b.publish_receipts()
        b.local.request.assert_not_called()
        result=b.send.call_args.kwargs['json'];self.assertEqual(result['status'],409)
        self.assertTrue(json.loads(path.read_text())['acked'])

if __name__=='__main__':unittest.main()
