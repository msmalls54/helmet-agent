"""HTTP contract checks on an ephemeral loopback port; never creates a real hit."""
import http.client
import json
import threading
import unittest
from hit_listener import HitServer


class ListenerTests(unittest.TestCase):
    def setUp(self):
        self.records = []
        self.server = HitServer(('127.0.0.1', 0), self.records.append)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()

    def send(self, path, body, content_type='application/json'):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        conn.request('POST', path, body, {'Content-Type': content_type})
        response = conn.getresponse()
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def payload(self, kind):
        return {'type': kind, 'helmet_id': 'synthetic-test-only', 'player': 'test',
                'boot_id': 'test-boot', 'id': 1, 'peak_g': 12.5, 'uptime_ms': 1000}

    def test_impact_ack_and_retry_duplicate(self):
        body = json.dumps(self.payload('impact'))
        self.assertEqual(self.send('/impact', body), (200, {'ok': True, 'duplicate': False}))
        self.assertEqual(self.send('/impact', body), (200, {'ok': True, 'duplicate': True}))
        self.assertEqual([r['duplicate'] for r in self.records], [False, True])

    def test_heartbeat_received_without_becoming_an_impact(self):
        self.assertEqual(self.send('/heartbeat', json.dumps(self.payload('heartbeat')))[0], 200)
        self.assertEqual(self.records[0]['path'], '/heartbeat')
        self.assertEqual(len(self.server.seen), 0)

    def test_invalid_or_nonfinite_json_not_logged(self):
        for body in ('{broken', '[]', '{"type":"impact","peak_g":NaN}',
                     '{"type":"impact","peak_g":1e999}'):
            self.assertEqual(self.send('/impact', body)[0], 400)
        self.assertFalse(self.records)

    def test_identity_type_path_and_size_checks(self):
        self.assertEqual(self.send('/unknown', '{}')[0], 404)
        self.assertEqual(self.send('/impact', '{}', 'text/plain')[0], 415)
        self.assertEqual(self.send('/impact', 'x'*4097)[0], 413)
        self.assertEqual(self.send('/impact', json.dumps(self.payload('heartbeat')))[0], 400)
        body = self.payload('impact')
        body['id'] = []
        self.assertEqual(self.send('/impact', json.dumps(body))[0], 400)
        self.assertFalse(self.records)


if __name__ == '__main__':
    unittest.main()
