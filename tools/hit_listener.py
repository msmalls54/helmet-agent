"""Temporary local Wi-Fi receiver; no database, MCP, agent or message sending."""
import argparse
import datetime
import json
import math
import pathlib
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 4096


class HitServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, emit):
        super().__init__(address, HitHandler)
        self.emit = emit
        self.guard = threading.Lock()
        self.seen = set()
        self.recent = deque()

    def record(self, path, peer, payload):
        with self.guard:
            key = (payload.get('helmet_id'), payload.get('boot_id'), payload.get('id'))
            duplicate = path == '/impact' and key in self.seen
            if path == '/impact' and not duplicate:
                self.seen.add(key)
                self.recent.append(key)
                if len(self.recent) > 500:
                    self.seen.remove(self.recent.popleft())
            record = {'received_at': datetime.datetime.now().astimezone().isoformat(timespec='milliseconds'),
                      'path': path, 'source_ip': peer, 'duplicate': duplicate, 'payload': payload}
            self.emit(record)
            return duplicate


class HitHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def setup(self):
        super().setup()
        self.connection.settimeout(2)

    def log_message(self, *_):
        pass

    def reply(self, status, body):
        data = json.dumps(body, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200 if self.path == '/health' else 404,
                   {'ok': self.path == '/health', 'service': 'temporary-helmet-listener'})

    def do_POST(self):
        if self.path not in ('/impact', '/heartbeat'):
            self.reply(404, {'error': 'unknown_path'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if self.headers.get('Transfer-Encoding') or not 0 < size <= MAX_BODY:
            self.reply(413, {'error': 'body_must_be_1_to_4096_bytes'})
            return
        if self.headers.get_content_type() != 'application/json':
            self.reply(415, {'error': 'application/json_required'})
            return
        try:
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise ValueError('incomplete body')
            def reject_constant(value):
                raise ValueError(value)
            def finite_float(value):
                number = float(value)
                if not math.isfinite(number):
                    raise ValueError('non-finite number')
                return number
            payload = json.loads(raw, parse_constant=reject_constant, parse_float=finite_float)
            if not isinstance(payload, dict) or payload.get('type') != self.path[1:]:
                raise ValueError('payload type does not match path')
            for field in ('helmet_id', 'player', 'boot_id'):
                if not isinstance(payload.get(field), str) or not 0 < len(payload[field]) <= 64:
                    raise ValueError('missing or invalid identity')
            if self.path == '/impact' and type(payload.get('id')) is not int:
                raise ValueError('impact id must be an integer')
        except (ValueError, UnicodeError, TimeoutError, OSError, RecursionError):
            self.reply(400, {'error': 'invalid_json_or_payload'})
            return
        duplicate = self.server.record(self.path, self.client_address[0], payload)
        self.reply(200, {'ok': True, 'duplicate': duplicate})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=3000)
    parser.add_argument('--log', default='evidence/wifi-listener-live.log')
    args = parser.parse_args()
    path = pathlib.Path(args.log)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8', buffering=1) as log:
        def emit(record):
            line = json.dumps(record, ensure_ascii=False, allow_nan=False)
            print(line, flush=True)
            log.write(line + '\n')
        with HitServer((args.host, args.port), emit) as server:
            print(f'Helmet Wi-Fi listener on {args.host}:{args.port}; log: {path.resolve()}', flush=True)
            try:
                server.serve_forever(poll_interval=0.2)
            except KeyboardInterrupt:
                print('Listener stopped.', flush=True)


if __name__ == '__main__':
    main()
