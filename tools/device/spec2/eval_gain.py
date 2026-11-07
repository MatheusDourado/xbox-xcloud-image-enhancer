"""Visual gain per filter and per prototype, against the clean references from gen-video.js.

Same metrics as tools/eval (SSIM, PSNR, chroma, detail, halo, banding, flicker), on H.264 frames encoded
in Chrome because this machine has no ffmpeg. Needs tools/device/spec2/server.py on port 8765.
Usage: python tools/device/spec2/eval_gain.py  ->  docs/medicoes/spec2/ganho-visual.json
"""
import json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
os.chdir(ROOT); sys.path.insert(0, str(ROOT / 'tools' / 'eval'))
os.environ['CHROMIUM'] = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
import run_eval as R
R.SCENES, R.BITRATES, R.SAMPLES = ['caverna', 'rocha', 'noite'], [9], [60, 120, 180]
def jobs(settings, target='1080', display=False, region_sky=False):
    out = []
    for scene in R.SCENES:
        for i in R.SAMPLES:
            if region_sky and scene != 'noite': continue
            out.append({'input': f'{scene}-9-{i}.png', 'ref': f'{scene}-ref{target}-{i}.png', 'settings': settings, 'display': display, 'region': [0, 486 if target == '1080' else 576] if region_sky else None, 'scene': scene, 'mbps': 9})
    return out
R.jobs = jobs

OFF = dict(cleanup=0, deband=0, chroma=0, detail=0, antialias=0, neural=0, temporal=0, sharpness=0, spatialMode='selective')
DEFAULT = dict(cleanup=.5, deband=.3, chroma=.75, detail=.2, antialias=0, neural=0, temporal=0, sharpness=3, sharpening='usm', spatialMode='selective')
def cfg(base, **k): return {'mode': 'filtered', 'output': 'native', **base, **k}

def main():
    ev = R.Evaluator()
    page = ev.page
    page.add_script_tag(url='http://127.0.0.1:8765/tools/device/spec2/variants.js')
    page.evaluate("()=>{window.V=BxVariants(BxShaders);window.orig={...engine.programs};window.swap=m=>{engine.programs={...orig};for(const [k,v] of Object.entries(m))engine.programs[k]=engine.compile(V[v]);};}")
    res = {}
    def run(name, settings, target='1080', display=False, swap=None):
        page.evaluate('m=>swap(m)', swap or {})
        s, _ = ev.score(settings, target=target, display=display)
        s['band'] = ev.banding(settings, target=target) if not display else None
        res[name] = s; print(name.ljust(34), {k: s[k] for k in ('ssim', 'psnr', 'chroma', 'detail', 'energy', 'halo', 'band')}, flush=True)
    for t, out in (('1080', 'native'), ('1280', '1280')):
        p = f'{t}:'
        run(p + 'padrao', cfg(DEFAULT, output=out), t)
        run(p + 'semFiltro', cfg(OFF, output=out), t)
        for k in ('cleanup', 'deband', 'chroma', 'detail'):
            run(p + 'sem-' + k, cfg(DEFAULT, output=out, **{k: 0}), t)
            run(p + 'so-' + k, cfg(OFF, output=out, **{k: DEFAULT[k]}), t)
        run(p + 'semNitidez', cfg(DEFAULT, output=out, sharpness=0), t)
        run(p + 'aa50', cfg(DEFAULT, output=out, antialias=.5), t)
        run(p + 'neural50', cfg(DEFAULT, output=out, neural=.5), t)
        run(p + 'rcas3', cfg(DEFAULT, output=out, sharpening='rcas'), t)
        run(p + 'cas3', cfg(DEFAULT, output=out, sharpening='cas'), t)
        run(p + 'quality16F', cfg(DEFAULT, output=out, processingMode='quality'), t)
        run(p + 'spatialMp', cfg(DEFAULT, output=out), t, swap={'spatial': 'spatialMp'})
        run(p + 'debandV2', cfg(DEFAULT, output=out), t, swap={'spatial': 'spatialDb2'})
        run(p + 'gate', cfg(DEFAULT, output=out), t, swap={'spatial': 'spatialGate'})
    # Poco alternatives: compositor stretch of the 1080p result, and SGSR in place of EASU + sharpening.
    run('1280:nativo-esticado', cfg(DEFAULT), '1280', display=True)
    run('1280:semFiltro-esticado', cfg(OFF), '1280', display=True)
    for name in ('sgsr8s2', 'sgsr8s15', 'sgsr20s2', 'sgsr20s15'):
        run('1280:' + name, cfg(DEFAULT, output='1280', sharpness=0), '1280', swap={'easu': name})
        run('1280:' + name + '-usm15', cfg(DEFAULT, output='1280', sharpness=1.5), '1280', swap={'easu': name})
    page.evaluate('m=>swap(m)', {})
    # Flicker on 1080p sequences: consecutive frames, temporal history kept.
    seq = {}
    for name, s in (('padrao', cfg(DEFAULT)), ('semFiltro', cfg(OFF)), ('temporal50', cfg(DEFAULT, temporal=.5)), ('semDetalhe', cfg(DEFAULT, detail=0)), ('semNitidez', cfg(DEFAULT, sharpness=0))):
        seq[name] = ev.sequence(s, start=150, end=168, measure_from=8)[0]; print(name, seq[name], flush=True)
    res['sequencia'] = seq
    ev.close()
    (ROOT / 'docs/medicoes/spec2/ganho-visual.json').write_text(json.dumps(res, indent=1) + '\n', encoding='utf-8')

main()
