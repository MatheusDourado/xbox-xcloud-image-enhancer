"""Training pairs for the neural restoration: decoded xCloud-like H.264 luma -> clean luma.

Uses textures that are NOT in the evaluation set (see docs/historico/analysis-v9.1.md), the same
camera motion and x264 settings as tools/eval, bitrates 8-25 Mbps.
Usage: python3 tools/nn/make_train_set.py <training texture dir> [scenes]
Output: output/nn/train.npz (uint8 patches, input and target luma).
"""
import os, sys, random
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'eval'))
import make_eval_set as ev

SRC = sys.argv[1]; SCENES = int(sys.argv[2]) if len(sys.argv) > 2 else 16
ev.SRC = SRC
OUT = 'output/nn'; P = 72; PER_FRAME = 400
rnd = random.Random(11); nrng = np.random.default_rng(11)
names = sorted(os.listdir(SRC))

def luma(a): return (np.asarray(a, np.float32) @ np.array([.2126, .7152, .0722], np.float32))

def scene(k):
    w = ev.W + ev.PAN * ev.FRAMES
    m = Image.new('RGB', (w, ev.H))
    cols, rows = rnd.choice([(2, 2), (3, 2), (4, 3)])
    cw, ch = w // cols, ev.H // rows
    for r in range(rows):
        for c in range(cols):
            n = rnd.choice(names)
            im = ev.load(n, rnd.uniform(.45, 1.3))
            ev.tile(m, im, (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    a = np.asarray(m, np.float32)
    if rnd.random() < .5:   # lighting variation, including dark scenes
        yy, xx = np.mgrid[0:ev.H, 0:w]
        cx, cy = rnd.uniform(0, w), rnd.uniform(0, ev.H)
        a = a * (rnd.uniform(.25, .6) + rnd.uniform(.4, .8) * np.clip(1 - ((xx - cx) ** 2 + (yy - cy) ** 2) / (w * w), 0, 1))[..., None]
    if rnd.random() < .4:   # smooth gradient band (sky/fog)
        y0 = rnd.randrange(0, ev.H // 2); y1 = y0 + rnd.randrange(150, 500)
        t = np.linspace(0, 1, y1 - y0)[:, None, None]
        c0, c1 = nrng.uniform(10, 200, 3), nrng.uniform(10, 200, 3)
        a[y0:y1] = c0 + (c1 - c0) * t
    m = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if rnd.random() < .6: ev.hud(m)
    return m

os.makedirs(OUT, exist_ok=True)
xs, ys = [], []
for k in range(SCENES):
    master = scene(k)
    crops = [ev.animate(master, i) for i in range(ev.FRAMES)]
    frames = [c.resize(ev.SIZES['1080'], Image.LANCZOS) for c in crops]
    mbps = rnd.choice([8, 10, 12, 15, 18, 22, 25])
    path = f'{OUT}/scene{k}.mp4'
    ev.encode(frames, ev.SIZES['1080'], mbps, path)
    for i in (12, 30, 47):
        ev.decode(path, ev.SIZES['1080'], i, f'{OUT}/tmp.png')
        x = luma(Image.open(f'{OUT}/tmp.png')); y = luma(frames[i])
        for _ in range(PER_FRAME):
            r, c = nrng.integers(0, 1080 - P), nrng.integers(0, 1920 - P)
            xp, yp = x[r:r + P, c:c + P], y[r:r + P, c:c + P]
            if yp.std() < 1 and nrng.random() < .7: continue   # keep few flat patches
            xs.append(np.round(xp).astype(np.uint8)); ys.append(np.round(yp).astype(np.uint8))
    os.remove(path)
    print('scene', k, mbps, 'Mbps', len(xs), 'patches', flush=True)
np.savez_compressed(f'{OUT}/train.npz', x=np.stack(xs), y=np.stack(ys))
