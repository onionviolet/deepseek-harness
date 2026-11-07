"""Synthetic protocol and evidence tests; no LMS or model calls."""
import copy
import http.client
import json
import socket
import threading
import unittest
from bridge import AssistantError, Engine, Handler, MAX_BODY, ThreadingHTTPServer, known_passages

SOURCE = {"id": "page-1-part-0", "page": "1", "title": "Fictional library",
          "text": "Green cards identify available books. Blue cards identify borrowed books."}
QUESTION = {"id": "q0", "type": "single", "stem": "Which cards identify borrowed books?",
            "choices": [{"id": "c0", "text": "Green"}, {"id": "c1", "text": "Blue"}]}
GOOD = {"id": "q0", "choices": ["c1"], "response": "", "uncertain": False,
        "reason": "The rule names blue cards.", "citations": [
            {"sourceId": SOURCE["id"], "quote": "Blue cards identify borrowed books."}]}


def payload(mode="auto", initial=True):
    packet = {"questions": [QUESTION], "referenceOnly": True,
              "lessonReferences": {"passages": [SOURCE] if initial else []}}
    return {"model": "local:test", "format": {"type": "object"},
            "messages": [{"role": "system", "content": "Use lesson evidence."},
                         {"role": "user", "content": json.dumps(packet)}],
            "assistant": {"mode": mode, "course": "synthetic", "references": [SOURCE]}}


class FakeEngine(Engine):
    def __init__(self, replies):
        super().__init__()
        self.replies = copy.deepcopy(replies)
        self.generated = []
        self.lookups = []

    def models(self, cancel):
        return {"models": [{"name": "local:test", "size": 1}]}

    def generate(self, body, cancel):
        self.generated.append(body)
        return self.replies.pop(0)

    def lookup(self, questions, sources, model, cancel):
        self.lookups.append(questions)
        return list(sources.values()), ["mcp__lesson__search_references"]


SUPPORTED = {"reviews": [{"id": "q0", "verdict": "supported", "reason": "The quote states blue."}]}


class EvidenceTests(unittest.TestCase):
    def test_grounded_batch_skips_agent(self):
        engine = FakeEngine([{"answers": [GOOD]}, SUPPORTED])
        result = engine.answer(payload(), threading.Event())
        self.assertFalse(engine.lookups)
        self.assertEqual(json.loads(result["message"]["content"])["answers"][0]["choices"], ["c1"])
        self.assertEqual(len(engine.generated), 2)

    def test_existing_quote_does_not_make_wrong_choice_supported(self):
        wrong = {**GOOD, "choices": ["c0"]}
        engine = FakeEngine([{"answers": [wrong]}, {"reviews": [
            {"id": "q0", "verdict": "contradicted", "reason": "Green is available, not borrowed."}]}])
        result = engine.answer(payload(), threading.Event())
        answer = json.loads(result["message"]["content"])["answers"][0]
        self.assertTrue(answer["uncertain"])
        self.assertEqual(answer["choices"], [])

    def test_missing_evidence_triggers_one_lookup_then_reanswer(self):
        unknown = {**GOOD, "choices": [], "citations": [], "uncertain": True}
        engine = FakeEngine([{"answers": [unknown]}, {"answers": [GOOD]}, SUPPORTED])
        result = engine.answer(payload(initial=False), threading.Event())
        self.assertEqual(len(engine.lookups), 1)
        self.assertEqual(result["referencePassages"], [SOURCE])
        self.assertEqual(json.loads(result["message"]["content"])["answers"][0]["choices"], ["c1"])

    def test_always_mode_looks_up_before_answering(self):
        engine = FakeEngine([{"answers": [GOOD]}, SUPPORTED])
        engine.answer(payload("always", initial=False), threading.Event())
        self.assertEqual(len(engine.lookups), 1)
        self.assertEqual(len(engine.generated), 2)

    def test_invented_quote_is_not_sent_for_review(self):
        bad = {**GOOD, "citations": [{"sourceId": SOURCE["id"], "quote": "Red cards identify borrowed books."}]}
        engine = FakeEngine([{"answers": [bad]}])
        result = engine.answer(payload(), threading.Event())
        self.assertEqual(len(engine.generated), 1)
        self.assertTrue(json.loads(result["message"]["content"])["answers"][0]["uncertain"])

    def test_duplicate_source_and_foreign_initial_packet_are_rejected(self):
        with self.assertRaisesRegex(AssistantError, "Duplicate"):
            known_passages([SOURCE, SOURCE])
        request = payload()
        request["assistant"]["references"] = []
        with self.assertRaisesRegex(AssistantError, "does not match"):
            FakeEngine([]).answer(request, threading.Event())

    def test_incomplete_review_does_not_release_a_batch(self):
        engine = FakeEngine([{"answers": [GOOD]}, {"reviews": []}])
        with self.assertRaisesRegex(AssistantError, "Incomplete evidence review"):
            engine.answer(payload(), threading.Event())

    def test_unknown_answer_id_is_rejected(self):
        engine = FakeEngine([{"answers": [{**GOOD, "id": "q9"}]}])
        with self.assertRaisesRegex(AssistantError, "Unknown or duplicate"):
            engine.answer(payload(), threading.Event())


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.server.engine = FakeEngine([])
        self.server.inference = threading.Lock()
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, path, body, headers or {})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def test_bad_browser_origin_and_host_are_rejected(self):
        self.assertEqual(self.request("GET", "/api/tags",
            headers={"Origin": "https://unrelated.example"})[0], 403)
        self.assertEqual(self.request("GET", "/health", headers={"Host": "evil.example"})[0], 403)

    def test_supported_origin_and_native_client_can_discover(self):
        self.assertEqual(self.request("GET", "/api/tags",
            headers={"Origin": "https://learning.cebroker.com"})[0], 200)
        self.assertEqual(self.request("GET", "/health")[0], 200)

    def test_invalid_content_type_oversize_and_unknown_paths(self):
        self.assertEqual(self.request("POST", "/api/chat", "{}")[0], 415)
        self.assertEqual(self.request("POST", "/api/chat", "{}",
            {"Content-Type": "application/json", "Content-Length": str(MAX_BODY + 1)})[0], 413)
        self.assertEqual(self.request("POST", "/not-a-tool", "{}", {"Content-Type": "application/json"})[0], 404)

    def test_busy_is_visible_instead_of_overlapping_model_requests(self):
        self.server.inference.acquire()
        try:
            status, body = self.request("POST", "/api/chat", "{}", {"Content-Type": "application/json"})
            self.assertEqual(status, 429)
            self.assertIn(b"busy", body)
        finally:
            self.server.inference.release()

    def test_client_disconnect_cancels_work_and_releases_slot(self):
        entered, stopped = threading.Event(), threading.Event()
        def answer(body, cancel):
            entered.set()
            if cancel.wait(3):
                stopped.set()
            return {}
        self.server.engine.answer = answer
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        connection.request("POST", "/api/chat", "{}", {"Content-Type": "application/json"})
        self.assertTrue(entered.wait(3))
        connection.close()
        self.assertTrue(stopped.wait(3))
        acquired = self.server.inference.acquire(timeout=3)
        self.assertTrue(acquired)
        if acquired:
            self.server.inference.release()


if __name__ == "__main__":
    unittest.main()
