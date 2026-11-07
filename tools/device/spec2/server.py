"""Static server for the Spec 2 bench, at the repository root.

GET serves repository files, /wall/<path> serves Windows wallpapers (local test footage, never
committed). POST /save/<path> writes the request body under output/ only.
Usage: python tools/device/spec2/server.py [port]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
WALL = Path('C:/Windows/Web')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def do_GET(self):
        if self.path.startswith('/wall/'):
            f = (WALL / self.path[6:]).resolve()
            if WALL.resolve() not in f.parents or not f.is_file(): return self.send_error(404)
            b = f.read_bytes(); self.send_response(200); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        super().do_GET()
    def do_POST(self):
        if not self.path.startswith('/save/'): return self.send_error(404)
        out = (ROOT / 'output' / self.path[6:]).resolve()
        if (ROOT / 'output').resolve() not in out.parents: return self.send_error(403)
        out.parent.mkdir(parents=True, exist_ok=True)
        left = int(self.headers.get('Content-Length', 0))
        with open(out, 'wb') as fh:
            while left:
                c = self.rfile.read(min(left, 1 << 20))
                if not c: break
                fh.write(c); left -= len(c)
        self.send_response(200); self.send_header('Content-Length', '2'); self.end_headers(); self.wfile.write(b'ok')

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), Handler).serve_forever()
