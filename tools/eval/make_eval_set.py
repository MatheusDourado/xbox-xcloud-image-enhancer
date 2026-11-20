"""Builds the objective evaluation set: clean references and xCloud-like H.264 streams.

Masters are 1440p game-like scenes with a slow camera pan. Each frame is downscaled
(Lanczos) to the 1080p stream size and to the Poco F7 display size (2276x1280, 16:9 on
a 1280 px tall panel), encoded with x264 4:2:0 without B-frames at 15 and 20 Mbps
(xCloud-like), then decoded back to RGB with bilinear chroma (as browsers do).

Usage: python3 tools/eval/make_eval_set.py <texture dir>
Texture dir: Khronos glTF-Sample-Assets textures (Sponza, FlightHelmet, DamagedHelmet)
and OpenCV sample photos; see docs/historico/analysis-v9.1.md.
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = sys.argv[1] if __name__ == '__main__' else None
OUT = 'output/eval'
W, H, PAN, FRAMES, FPS = 2560, 1440, 4, 48, 60   # pan: master pixels per frame
SAMPLES = [24, 47]                              # evaluated frames (P-frames after warm-up)
SIZES = {'1080': (1920, 1080), '1280': (2276, 1280)}
rng = np.random.default_rng(7)

def load(name, scale):
    im = Image.open(os.path.join(SRC, name)).convert('RGB')
    return im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)

def tile(canvas, image, box):
    x0, y0, x1, y1 = box
    for y in range(y0, y1, image.height):
        for x in range(x0, x1, image.width):
            canvas.paste(image.crop((0, 0, min(image.width, x1 - x), min(image.height, y1 - y))), (x, y))

def font(size):
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(path): return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def hud(canvas):
    g = ImageDraw.Draw(canvas)
    g.rounded_rectangle((60, 1180, 760, 1380), 18, fill=(20, 24, 30))
    g.text((90, 1200), 'HP 1250 / 1500', font=font(48), fill=(235, 235, 235))
    g.text((90, 1270), 'Missão: atravessar a ponte', font=font(36), fill=(255, 196, 64))
    g.text((90, 1320), 'Munição 24 | 120', font=font(30), fill=(120, 200, 255))
    g.rectangle((1900, 80, 2480, 104), fill=(180, 30, 30)); g.rectangle((1900, 80, 2300, 104), fill=(40, 200, 80))
    for i in range(12): g.line((2000 + i * 40, 160, 2030 + i * 40, 260), fill=(255, 255, 255), width=2)

def scene_textures():
    m = Image.new('RGB', (W + PAN * FRAMES, H))
    names = ['FlightHelmet_glTF_FlightHelmet_Materials_LeatherPartsMat_BaseColor.png', 'DamagedHelmet_glTF_Default_albedo.jpg',
             'FlightHelmet_glTF_FlightHelmet_Materials_RubberWoodMat_BaseColor.png', 'FlightHelmet_glTF_FlightHelmet_Materials_MetalPartsMat_BaseColor.png']
    cw = m.width // 2
    for i, n in enumerate(names):
        x, y = (i % 2) * cw, (i // 2) * (H // 2)
        tile(m, load(n, .75), (x, y, x + cw, y + H // 2))
    hud(m); return m

def scene_sponza():
    m = Image.new('RGB', (W + PAN * FRAMES, H))
    names = sorted(n for n in os.listdir(SRC) if n.startswith('Sponza'))[:6]
    cw = m.width // 3
    for i, n in enumerate(names):
        x, y = (i % 3) * cw, (i // 3) * (H // 2)
        tile(m, load(n, 1.0), (x, y, x + cw, y + H // 2))
    # Soft directional light so the scene is not flat albedo.
    yy, xx = np.mgrid[0:m.height, 0:m.width]
    shade = (.55 + .45 * np.clip(1 - ((xx - m.width * .3) ** 2 + (yy - m.height * .4) ** 2) / (1.2 * m.width ** 2), 0, 1))[..., None]
    m = Image.fromarray(np.clip(np.asarray(m) * shade, 0, 255).astype(np.uint8))
    hud(m); return m

def scene_sky():
    w = W + PAN * FRAMES
    yy, xx = np.mgrid[0:H, 0:w].astype(np.float32)
    t = yy / H
    sky = np.stack([40 + 90 * t, 80 + 80 * t, 150 + 60 * t], -1)          # slow gradient: banding test
    clouds = np.asarray(Image.fromarray((rng.random((H // 16, w // 16)) * 255).astype(np.uint8)).resize((w, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(24)), np.float32)
    sky += ((clouds - 128) / 128 * 10)[..., None]
    ground = np.asarray(load('cv_starry_night.jpg', 1.0).resize((w, H // 3), Image.LANCZOS), np.float32)
    sky[H - H // 3:] = ground * .9
    m = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8))
    photo = load('cv_building.jpg', 1.2); m.paste(photo, (w // 2 - photo.width // 2, 140))
    hud(m); return m

def animate(master, i):
    # Pan + slow zoom (non-translational motion) + fast particles: closer to game
    # motion than a pure pan, so the encoder has to drop detail like a real stream.
    zoom = 1 + .04 * np.sin(i / FRAMES * np.pi)
    w, h = W / zoom, H / zoom
    x, y = i * PAN + (W - w) / 2, (H - h) / 2
    frame = master.transform((W, H), Image.EXTENT, (x, y, x + w, y + h), Image.BICUBIC)
    g = ImageDraw.Draw(frame); r = np.random.default_rng(1000 + i)
    for k in range(400):
        px, py = (k * 97 + i * (18 + k % 7)) % W, (k * 53 + i * (11 + k % 5)) % H
        c = int(170 + 85 * r.random()); g.ellipse((px, py, px + 3, py + 3), fill=(c, c - 20, c - 60))
    return frame

def encode(frames, size, mbps, path):
    w, h = size
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
           '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
           '-bf', '0', '-g', '600', '-b:v', f'{mbps}M', '-maxrate', f'{mbps}M', '-bufsize', f'{mbps // 2}M',
           '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.tobytes())
    p.stdin.close(); assert p.wait() == 0

def decode(path, size, index, out):
    w, h = size
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'select=eq(n\\,{index}),scale=in_color_matrix=bt709:in_range=tv:flags=bilinear+accurate_rnd+full_chroma_int',
                          '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    Image.frombytes('RGB', (w, h), raw).save(out)

def main():
  os.makedirs(OUT, exist_ok=True)
  for name, make in [('textures', scene_textures), ('sponza', scene_sponza), ('sky', scene_sky)]:
      master = make()
      crops = [animate(master, i) for i in range(FRAMES)]
      for key, size in SIZES.items():
          for i in SAMPLES: crops[i].resize(size, Image.LANCZOS).save(f'{OUT}/{name}-ref{key}-{i}.png')
      frames = [c.resize(SIZES['1080'], Image.LANCZOS) for c in crops]
      for mbps in (10, 15, 20):
          path = f'{OUT}/{name}-{mbps}.mp4'
          encode(frames, SIZES['1080'], mbps, path)
          for i in SAMPLES: decode(path, SIZES['1080'], i, f'{OUT}/{name}-{mbps}-{i}.png')
      print('scene', name, 'done')

if __name__ == '__main__':
    main()
