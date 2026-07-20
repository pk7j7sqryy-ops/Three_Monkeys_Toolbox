#!/usr/bin/env python3
"""本地静态服务器（开发用）：禁用缓存，使改动即时生效。默认入口 Ailearn.html。"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        if self.path == "/":
            self.path = "/Ailearn.html"
        return super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4180
    HTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
