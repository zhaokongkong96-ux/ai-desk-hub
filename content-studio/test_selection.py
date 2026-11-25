"""Isolated protocol regressions. Fixtures are not collection results or production jobs."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

test_data=tempfile.TemporaryDirectory()
os.environ["STUDIO_DATA"]=test_data.name
from fastapi.testclient import TestClient
import server
from store import db
from selection import version
from workflow import now

class SelectionProtocol(unittest.TestCase):
    def setUp(self):
        with db() as conn:
            conn.execute("DELETE FROM jobs")
            conn.execute("DELETE FROM topics")
            conn.execute("DELETE FROM sources")
            conn.execute("DELETE FROM runs")
            conn.execute("INSERT INTO runs VALUES('test-run',?,'test','{}')",(now(),))
            conn.execute("INSERT INTO sources VALUES('test-source','A','Protocol fixture','https://example.com/protocol','Protocol-only fixture',?,?, 'test','{}')",(now(),now()))
            conn.execute("INSERT INTO topics(id,run_id,source_id,score,recommended,plan) VALUES('test-topic','test-run','test-source',0,0,'{}')")
        self.http=TestClient(server.app)
        self.headers={"Authorization":"Bearer "+server.TOKEN}
    def request(self,path,method="POST",body=None):
        return self.http.request(method,"/api/topics/test-topic/"+path,headers=self.headers,json=body)
    def row(self):
        return self.http.get("/api/topics",headers=self.headers).json()[0]
    def choose(self,confirmed=True,expected=None):
        return self.request("selection","PUT",{"angle_id":"a","note":"protocol test",
          "confirmed":confirmed,"expected_version":expected or self.row()["plan_version"]})
    def script(self):
        return self.request("script","PUT",{"expected_version":self.row()["plan_version"],
          "script":[{"title":"Test scene","narration":"Test fixture only","visual":"test"}]})
    def test_no_selection_blocks_research_and_production(self):
        with patch.object(server,"plan_topic",wraps=server.plan_topic), patch.object(server.pool,"submit") as submit:
            self.assertEqual(self.request("plan").status_code,409)
            self.assertEqual(self.request("produce").status_code,409)
            submit.assert_not_called()
    def test_discussion_is_not_confirmation(self):
        self.assertEqual(self.choose(False).status_code,200)
        self.assertEqual(self.request("plan").status_code,409)
        self.assertEqual(self.script().status_code,409)
    def test_confirmed_script_is_required_and_snapshotted(self):
        self.assertEqual(self.choose().status_code,200)
        self.assertEqual(self.script().status_code,200)
        self.assertEqual(self.request("produce").status_code,409)
        stale=self.row()["plan_version"]
        approval=self.request("approve-script",body={"expected_version":stale})
        self.assertEqual(approval.status_code,200)
        with patch.object(server.pool,"submit") as submit:
            queued=self.request("produce")
            self.assertEqual(queued.status_code,200)
            duplicate=self.request("produce")
            self.assertEqual(queued.json(),duplicate.json())
            self.assertEqual(submit.call_count,1)
        with db() as conn:
            snapshot=json.loads(conn.execute("SELECT snapshot FROM jobs").fetchone()[0])
        self.assertTrue(snapshot["selection"]["confirmed_at"])
        self.assertTrue(snapshot["script_approval"]["digest"])
    def test_edit_invalidates_approval_and_stale_version(self):
        self.choose()
        self.script()
        old=self.row()["plan_version"]
        self.request("approve-script",body={"expected_version":old})
        self.assertEqual(self.request("approve-script",body={"expected_version":old}).status_code,409)
        self.assertEqual(self.script().status_code,200)
        self.assertNotIn("script_approval",self.row()["plan"])
        self.assertEqual(self.request("produce").status_code,409)
    def test_changed_direction_clears_old_script(self):
        self.choose();self.script()
        old=self.row()["plan_version"]
        self.assertEqual(self.choose(False,old).status_code,200)
        self.assertNotIn("script",self.row()["plan"])
        self.assertEqual(self.choose(True,old).status_code,409)
    def test_custom_direction_must_be_complete(self):
        r=self.request("selection","PUT",{"angle_id":"custom","confirmed":True,
                                        "expected_version":self.row()["plan_version"]})
        self.assertEqual(r.status_code,422)

if __name__=="__main__":
    unittest.main()
