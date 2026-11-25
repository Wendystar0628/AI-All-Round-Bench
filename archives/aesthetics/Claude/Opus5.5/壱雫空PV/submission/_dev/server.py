# Dev-only static server with a tiny POST /save endpoint (writes into _dev/out).
import http.server, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '_dev', 'out')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18101


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        name = os.path.basename(q.get('name', ['blob.bin'])[0])
        n = int(self.headers.get('Content-Length', '0'))
        data = self.rfile.read(n)
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(('saved %d bytes' % len(data)).encode())

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
