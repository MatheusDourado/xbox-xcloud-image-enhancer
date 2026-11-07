"""Second gain pass: banding and blocks on the sky clip, sharpening options and candidate paths on the game clip.

Needs tools/device/spec2/server.py on port 8765. Output: docs/medicoes/spec2/ganho-visual-2.json
"""
import json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
os.chdir(ROOT); sys.path.insert(0, str(ROOT / 'tools' / 'eval'))
os.environ['CHROMIUM'] = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
import run_eval as R
OUT = ROOT / 'docs/medicoes/spec2/ganho-visual-2.json'
GAME, SKY = ['caverna', 'rocha', 'noite'], ['ceu']
state = {'scenes': GAME, 'rates': [9]}
def jobs(settings, target='1080', display=False, region_sky=False):
    region = [0, 297 if target == '1080' else 352] if state['scenes'] == SKY else None  # sky rows of the central crop
    return [{'input': f'{s}-{m}-{i}.png', 'ref': f'{s}-ref{target}-{i}.png', 'settings': settings, 'display': display, 'region': region, 'scene': s, 'mbps': m}
            for s in state['scenes'] for m in state['rates'] for i in (60, 120, 180)]
R.jobs, R.SCENES = jobs, GAME
OFF = dict(cleanup=0, deband=0, chroma=0, detail=0, antialias=0, neural=0, temporal=0, sharpness=0, spatialMode='selective')
DEFAULT = dict(cleanup=.5, deband=.3, chroma=.75, detail=.2, antialias=0, neural=0, temporal=0, sharpness=3, sharpening='usm', spatialMode='selective')
def cfg(base, **k): return {'mode': 'filtered', 'output': 'native', **base, **k}

def main():
    ev = R.Evaluator(); page = ev.page
    page.add_script_tag(url='http://127.0.0.1:8765/tools/device/spec2/variants.js')
    page.evaluate("()=>{window.V=BxVariants(BxShaders);window.orig={...engine.programs};window.swap=m=>{engine.programs={...orig};for(const [k,v] of Object.entries(m))engine.programs[k]=engine.compile(V[v]);};}")
    res = {}
    def run(name, settings, target='1080', swap=None):
        page.evaluate('m=>swap(m)', swap or {})
        s, _ = ev.score(settings, target=target)
        res[name] = s; print(name.ljust(34), {k: s[k] for k in ('ssim', 'psnr', 'chroma', 'detail', 'energy', 'halo', 'band')}, flush=True)
        OUT.write_text(json.dumps(res, indent=1) + '\n', encoding='utf-8')
    # Sky clip, per bit rate: what cleanup and debanding do where they are meant to act.
    state['scenes'] = SKY
    for m in (9, 5):
        state['rates'] = [m]; p = f'ceu{m}:'
        run(p + 'semFiltro', cfg(OFF)); run(p + 'so-compressao', cfg(OFF, cleanup=.5)); run(p + 'so-degrades', cfg(OFF, deband=.3))
        run(p + 'degrades60', cfg(OFF, deband=.6)); run(p + 'degrades100', cfg(OFF, deband=1)); run(p + 'compressao100', cfg(OFF, cleanup=1))
        run(p + 'degradesV2', cfg(OFF, deband=.3), swap={'spatial': 'spatialDb2'}); run(p + 'padrao', cfg(DEFAULT)); run(p + 'sem-degrades', cfg(DEFAULT, deband=0)); run(p + 'sem-compressao', cfg(DEFAULT, cleanup=0))
    # Game clip: sharpening strength and the candidate paths at the Poco output.
    state['scenes'], state['rates'] = GAME, [9]
    for n, k in (('usm2', dict(sharpness=2)), ('usm15', dict(sharpness=1.5)), ('rcas3', dict(sharpening='rcas')), ('rcas5', dict(sharpening='rcas', sharpness=5)), ('rcas7', dict(sharpening='rcas', sharpness=7)),
                 ('semDetalhe-usm2', dict(detail=0, sharpness=2)), ('semDetalhe-rcas5', dict(detail=0, sharpening='rcas', sharpness=5))):
        run('1280:' + n, cfg(DEFAULT, output='1280', **k), '1280'); run('1080:' + n, cfg(DEFAULT, **k))
    for name in ('sgsr20s1', 'sgsr30s12'):
        run('1280:cand-' + name + '-semDetalhe', cfg(DEFAULT, output='1280', detail=0, sharpness=0), '1280', swap={'easu': name})
    page.evaluate('m=>swap(m)', {})
    seq = {}
    for name, s in (('usm2', cfg(DEFAULT, sharpness=2)), ('rcas3', cfg(DEFAULT, sharpening='rcas')), ('rcas5', cfg(DEFAULT, sharpening='rcas', sharpness=5)), ('semDetalhe-usm2', cfg(DEFAULT, detail=0, sharpness=2))):
        seq[name] = ev.sequence(s, scenes=GAME, start=150, end=168, measure_from=8)[0]; print(name, seq[name], flush=True)
    res['sequencia'] = seq; OUT.write_text(json.dumps(res, indent=1) + '\n', encoding='utf-8')
    ev.close()

main()
