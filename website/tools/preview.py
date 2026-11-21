"""Serve the assembled Pages site on localhost, including its custom 404 response."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

DIST = Path(__file__).resolve().parents[1] / 'dist'


class PagesHandler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        page = Path(self.directory) / '404.html'
        if code != 404 or not page.is_file():
            return super().send_error(code, message, explain)
        body = page.read_bytes()
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def list_directory(self, path):
        self.send_error(404)


def main():
    parser = argparse.ArgumentParser(description='预览拼好的总站和专题')
    parser.add_argument('--port', type=int, default=5181)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    if not (DIST / 'index.html').is_file():
        raise SystemExit('先运行 python website/tools/publish.py --no-upload 构建整站')
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(PagesHandler, directory=str(DIST))) as server:
        url = f'http://127.0.0.1:{server.server_port}/'
        print(f'成绩网站预览 {url}', flush=True)
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
