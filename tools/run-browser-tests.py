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
    ('play-harness.py', 'play-harness.html'),
]
# Spec 4: WebGPU against WebGL2. Its own browser: headless Chromium exposes WebGPU only with these flags,
# first the real GPU, then the SwiftShader adapter. Without any adapter the page reports itself skipped.
# SwiftShader WebGPU imports a video (importExternalTexture) only when ANGLE and Vulkan run on SwiftShader too
# (otherwise the import fails, or the device is destroyed right after it), so the first set moves on to the
# second when it gets the SwiftShader adapter instead of a GPU (CI runners).
WEBGPU = [('webgpu-harness.py', 'webgpu-equivalence.html'), ('renderer-harness.py', 'renderer-harness.html')]
WEBGPU_FLAGS = [['--enable-gpu', '--enable-unsafe-webgpu'],
                ['--enable-gpu', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader',
                 '--enable-features=Vulkan', '--use-vulkan=swiftshader']]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run_page(browser, port, page_name):
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(f'http://127.0.0.1:{port}/output/playwright/{page_name}')
        page.wait_for_function("""() => {
            try { return !!JSON.parse(document.querySelector('#result').textContent); }
            catch { return false; }
        }""", timeout=120000)
        result = json.loads(page.locator('#result').inner_text())
        passed = result.get('passed')
        ok = bool(passed) and not result.get('error') and not result.get('failures') and not errors
        count = len(passed) if isinstance(passed, list) else len(result.get('cases', []))
        row = dict(suite=page_name, ok=ok, checks=count, result=result, errors=errors)
    except Exception as error:
        row = dict(suite=page_name, ok=False, error=str(error), errors=errors)
    finally:
        page.close()
    state = 'SKIP' if row['ok'] and (row.get('result') or {}).get('skipped') else 'PASS' if row['ok'] else 'FAIL'
    print(f"{page_name}: {state} ({row.get('checks', 0)} checks)")
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--channel', help='Use an installed browser, e.g. chrome')
    parser.add_argument('--executable', help="Browser binary, e.g. the CI's Chromium from another Playwright version")
    args = parser.parse_args()
    for script, _ in SUITES + WEBGPU:
        subprocess.run([sys.executable, str(ROOT / 'tools' / script)], cwd=ROOT, check=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel=args.channel, executable_path=args.executable)
            for _, page_name in SUITES:
                results.append(run_page(browser, server.server_port, page_name))
            browser.close()
            for flags in WEBGPU_FLAGS:
                browser = p.chromium.launch(channel=args.channel, executable_path=args.executable, args=flags)
                rows = [run_page(browser, server.server_port, WEBGPU[0][1])]
                first = rows[0].get('result') or {}
                software = ((first.get('report') or {}).get('adapter') or {}).get('architecture') == 'swiftshader'
                skipped = first.get('skipped') or (software and flags is not WEBGPU_FLAGS[-1])
                if not skipped:
                    rows += [run_page(browser, server.server_port, page) for _, page in WEBGPU[1:]]
                browser.close()
                if not skipped:
                    break
                print(f"  WebGPU flags {' '.join(flags)}: {first.get('reason') or 'SwiftShader adapter, trying the next flags'}")
            results.extend(rows)
            report = (rows[0].get('result') or {}).get('report') or {}
            print(f"  WebGPU flags {' '.join(flags)}: adapter {report.get('adapter')}, WebGL2 {report.get('gl')}, same device {report.get('sameDevice')}")
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
