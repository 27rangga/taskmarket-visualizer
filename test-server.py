#!/usr/bin/env python3
"""Local test server for the TaskMarket visualizer frontend.

Serves public/ as static files and answers /api/data from mock-data.json,
mimicking the Worker's same-origin endpoint. Run from brk611an/:
    python3 test-server.py [port]
Then open http://localhost:8000/ — no build step, no deploy.
"""
import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC = HERE / "public"
MOCK = HERE / "mock-data.json"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def do_GET(self):
        if self.path == "/api/data" or self.path.startswith("/api/data?"):
            data = MOCK.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "public, max-age=60")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[test-server] " + fmt % args + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving {PUBLIC} at http://localhost:{port}/  (/api/data -> mock-data.json)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
