"""Spec 3 item 5: visual gain of the shipped SGSR option against EASU + USM, same method as the Spec 2 study.

Same frames, crop and metrics as tools/device/spec2/eval_gain2.py (game30 clip, 3 scenes x 3 frames, 1280p,
SwiftShader, so mediump does not show here), but through the production engine (scaler 'sgsr'), with no
shader swap. Index: 100*SSIM + 10*detail - 5*|energy - 1| - 2*halo.
Needs tools/device/spec2/server.py on port 8765. Output: docs/medicoes/spec3/ganho-visual-item5.json
"""
import json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
os.chdir(ROOT); sys.path.insert(0, str(ROOT / 'tools' / 'eval'))
os.environ['CHROMIUM'] = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
import run_eval as R
OUT = ROOT / 'docs/medicoes/spec3/ganho-visual-item5.json'
GAME = ['caverna', 'rocha', 'noite']
def jobs(settings, target='1080', display=False, region_sky=False):
    return [{'input': f'{s}-9-{i}.png', 'ref': f'{s}-ref{target}-{i}.png', 'settings': settings, 'display': display, 'region': None, 'scene': s, 'mbps': 9}
            for s in GAME for i in (60, 120, 180)]
R.jobs, R.SCENES = jobs, GAME
V9 = dict(cleanup=.5, deband=.3, chroma=.75, detail=.2, antialias=0, neural=0, temporal=0, sharpness=3, sharpening='usm', spatialMode='selective')
SPEC3 = dict(V9, cleanup=0, deband=.6, detail=0, sharpness=2)
def cfg(base, **k): return {'mode': 'filtered', 'output': '1280', **base, **k}
index = lambda s: 100 * s['ssim'] + 10 * s['detail'] - 5 * abs(s['energy'] - 1) - 2 * s['halo']

def main():
    ev = R.Evaluator(); res = {}
    runs = [
        # Spec 2 study pair (v9 filters): item 1 (USM 2) against SGSR 20/1.0, expected -0.64.
        ('v9-usm2', cfg(V9, sharpness=2)), ('v9-sgsr-nitidez2', cfg(V9, sharpness=2, scaler='sgsr')), ('v9-usm3', cfg(V9)),
        # Spec 3 defaults (items 1, 3, 4, 10): the pair the panel option chooses between.
        ('spec3-usm2', cfg(SPEC3)), ('spec3-sgsr-nitidez2', cfg(SPEC3, scaler='sgsr')),
        # The slider with SGSR: 0 (bilinear), 3 (1.4), 4.5 (2.0, upstream strength).
        ('spec3-sgsr-nitidez0', cfg(SPEC3, scaler='sgsr', sharpness=0)), ('spec3-sgsr-nitidez3', cfg(SPEC3, scaler='sgsr', sharpness=3)), ('spec3-sgsr-nitidez4.5', cfg(SPEC3, scaler='sgsr', sharpness=4.5)),
    ]
    for name, s in runs:
        r, _ = ev.score(s, target='1280'); r['index'] = index(r); res[name] = r
        print(name.ljust(26), {k: round(r[k], 4) for k in ('ssim', 'psnr', 'detail', 'energy', 'halo', 'index')}, flush=True)
        OUT.write_text(json.dumps(res, indent=1) + '\n', encoding='utf-8')
    ev.close()

main()
