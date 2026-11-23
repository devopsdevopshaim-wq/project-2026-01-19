"""Composite the talking full-body presenter (cut out) onto the v2 graphics frames."""
import json, subprocess, sys, os, numpy as np
from PIL import Image, ImageFilter, ImageDraw

V2 = '../v2'
geo = json.load(open('geo_v2.json'))
T = json.load(open(f'{V2}/vo/timing.json'))
starts = T['starts']
SEG = [('welcome', 'welcome'), ('point', 'point'), ('present', 'present'), ('show', 'show'), ('welcome', 'cta')]
out_dir = sys.argv[1] if len(sys.argv) > 1 else 'comp_v2'
sel = set(map(int, sys.argv[2].split(','))) if len(sys.argv) > 2 else None
os.makedirs(out_dir, exist_ok=True)

def load_video(path):
    w, h, r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                              'stream=width,height,r_frame_rate', '-of', 'csv=p=0', path],
                             capture_output=True, text=True).stdout.strip().split(',')
    w, h = int(w), int(h); n, d = map(int, r.split('/'))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3), n / d

vids, masks = {}, {}
for pose, name in SEG:
    path = f'{V2}/talk/{name}.mp4'
    if os.path.exists(path):
        vids[name] = load_video(path)
    else:  # fallback: still image (lets us preview before the talking render is done)
        im = np.array(Image.open(f'{V2}/pose/up_{pose}.png').convert('RGB')) if os.path.exists(f'{V2}/pose/up_{pose}.png') \
            else np.array(Image.open(f'{V2}/pose/pose_{pose}.png').convert('RGB').resize((768, 1248), Image.LANCZOS))
        vids[name] = (im[None], 25.0)
    masks[pose] = Image.open(f'{V2}/pose/mask_{pose}.png').convert('L')

def shadow(w):
    s = Image.new('L', (w, 90), 0)
    ImageDraw.Draw(s).ellipse([w * 0.1, 20, w * 0.9, 70], fill=120)
    return s.filter(ImageFilter.GaussianBlur(14))

for i, g in enumerate(geo):
    if sel is not None and i not in sel:
        continue
    t = i / 30
    bg = Image.open(f'frames_v2/f{i:04d}.png').convert('RGB')
    idx = g['idx']; pose, name = SEG[idx]
    frames, fps = vids[name]
    vt = t - starts[idx]
    fi = int(min(max(vt, 0), (len(frames) - 1) / fps) * fps)
    fi = min(fi, len(frames) - 1)
    src = Image.fromarray(frames[fi])
    m = masks[pose]
    if src.size != m.size:
        src = src.resize(m.size, Image.LANCZOS)
    H = int(round(g['h'])); W = int(round(m.size[0] * H / m.size[1]))
    src = src.resize((W, H), Image.LANCZOS); mm = m.resize((W, H), Image.LANCZOS)
    if g['alpha'] < 1:
        mm = mm.point(lambda v: int(v * max(0, g['alpha'])))
    x = int(round(g['cx'] - W / 2)); y = int(round(g['bottom'] - H))
    # soft floor shadow under her feet
    sh = shadow(int(W * 0.7))
    dark = Image.new('RGB', sh.size, (110, 85, 60))
    bg.paste(dark, (x + int(W * 0.15), y + int(H * 0.955) - 45), sh.point(lambda v: int(v * max(0, g['alpha']))))
    bg.paste(src, (x, y), mm)
    bg.save(f'{out_dir}/c{i:04d}.jpg', quality=93)
    if i % 300 == 0:
        print(i, flush=True)
print('done')
