"""Run the existing WebGL/DOM and pixel harnesses; any failure exits nonzero.

Install: python3 -m pip install playwright && python3 -m playwright install chromium
Run: python3 tools/run-browser-tests.py [--channel chrome | --executable PATH]
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SUITES = [
    ('browser-harness.py', 'filter-harness.html'),
    ('regression-harness.py', 'regressions-v7.html'),
    ('quality-harness.py', 'motion-quality.html'),
    ('capture-harness.py', 'capture-harness.html'),
]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--channel', help='Use an installed browser, e.g. chrome')
    parser.add_argument('--executable', help="Browser binary, e.g. the CI's Chromium from another Playwright version")
    args = parser.parse_args()
    for script, _ in SUITES:
        subprocess.run([sys.executable, str(ROOT / 'tools' / script)], cwd=ROOT, check=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel=args.channel, executable_path=args.executable)
            for _, page_name in SUITES:
                page = browser.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    page.goto(f'http://127.0.0.1:{server.server_port}/output/playwright/{page_name}')
                    page.wait_for_function("""() => {
                        try { return !!JSON.parse(document.querySelector('#result').textContent); }
                        catch { return false; }
                    }""", timeout=60000)
                    result = json.loads(page.locator('#result').inner_text())
                    passed = result.get('passed')
                    ok = bool(passed) and not result.get('error') and not result.get('failures') and not errors
                    count = len(passed) if isinstance(passed, list) else len(result.get('cases', []))
                    results.append(dict(suite=page_name, ok=ok, checks=count, result=result, errors=errors))
                except Exception as error:
                    results.append(dict(suite=page_name, ok=False, error=str(error), errors=errors))
                finally:
                    page.close()
                row = results[-1]
                print(f"{page_name}: {'PASS' if row['ok'] else 'FAIL'} ({row.get('checks', 0)} checks)")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    (ROOT / 'output/playwright/results.json').write_text(json.dumps(results, indent=2))
    if not all(row['ok'] for row in results):
        for row in results:
            if not row['ok']:
                print(json.dumps(row, indent=2))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
