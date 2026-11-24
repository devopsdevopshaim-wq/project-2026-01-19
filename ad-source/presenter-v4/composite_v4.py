"""v4 compositor (EchoMimicV2 half-body presenter with hands): a living presenter that walks between screens, camera moves, whip transitions, particles, confetti."""
import json, subprocess, sys, os, math, wave, numpy as np
from PIL import Image, ImageFilter, ImageDraw

W, H, FPS = 1080, 1920, 30
V2 = '../v2'
T = json.load(open(f'{V2}/vo/timing.json'))
starts, durs = T['starts'], T['durs']
S = [0] + [s - 0.6 for s in starts[1:]]            # scene starts (same as v2.html)
N = len(os.listdir('frames_v2'))
END = N / FPS
SEG = [('welcome', 'welcome'), ('point', 'point'), ('present', 'present'), ('show', 'show'), ('welcome', 'cta')]
out_dir = sys.argv[1] if len(sys.argv) > 1 else 'comp_v4'
sel = set(map(int, sys.argv[2].split(','))) if len(sys.argv) > 2 else None
os.makedirs(out_dir, exist_ok=True)

# ---------- media ----------
def load_video(path):
    w, h, r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                              'stream=width,height,r_frame_rate', '-of', 'csv=p=0', path],
                             capture_output=True, text=True).stdout.strip().split(',')
    w, h = int(w), int(h); n, d = map(int, r.split('/'))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3), n / d
import glob
FR = {i: sorted(glob.glob(f'../v4/clip{i}/f*.png')) for i in range(1, 6)}
_cache = {}
def clip_frame(i, vt):
    fl = FR[i + 1]; k = int(min(max(vt, 0) * FPS, len(fl) - 1))
    key = (i, k)
    if key not in _cache:
        if len(_cache) > 60: _cache.clear()
        _cache[key] = Image.open(fl[k]).convert('RGBA')
    return _cache[key]

# voice envelope -> "energy" per video frame
with wave.open(f'{V2}/vo/voice_full.wav') as wf:
    sr, ch = wf.getframerate(), wf.getnchannels()
    a = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).astype(np.float32)
a = a.reshape(-1, ch).mean(1) / 32768
hop = sr // FPS
env = np.array([np.sqrt(np.mean(a[i * hop:(i + 1) * hop] ** 2)) if i * hop < len(a) else 0 for i in range(N + 5)])
env = np.convolve(env / (env.max() + 1e-9), np.ones(5) / 5, 'same')   # smooth
def energy(t): return float(env[min(len(env) - 1, int(t * FPS))])

# ---------- helpers ----------
def clamp(x, a=0, b=1): return max(a, min(b, x))
def ease_io(x): x = clamp(x); return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def lerp(a, b, k): return a + (b - a) * k
def keyframes(t, keys):
    """keys: list of (time, value); eased between."""
    if t <= keys[0][0]: return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            k = ease_io((t - t0) / (t1 - t0))
            return tuple(lerp(a, b, k) for a, b in zip(v0, v1)) if isinstance(v0, tuple) else lerp(v0, v1, k)
    return keys[-1][1]

# ---------- choreography ----------
TR = 0.45   # half-width of transitions
# presenter base position (cx, height) per scene; she WALKS between them across transitions
# per-scene waypoints: (time from scene start, x). She walks between them.
WAY = {0: [(0, 540)], 1: [(0, 880)], 2: [(0, 880)], 3: [(0, 880), (0.9, 880), (2.4, 800), (5.5, 800), (6.3, 920)], 4: [(0, 880)]}
HGT = [1300, 980, 980, 980, 980]
def entry(i): return WAY[i][0][1]
def exitx(i): return WAY[i][-1][1]
def scene_pos(i, t):
    pts = WAY[i]; lt = t - S[i]; x = pts[0][1]; walk = 0
    for (t0, x0), (t1, x1) in zip(pts, pts[1:]):
        if lt >= t1: x = x1
        elif lt > t0 and x1 != x0:
            k = (lt - t0) / (t1 - t0); x = lerp(x0, x1, ease_io(k)); walk = math.sin(k * math.pi); break
        elif lt > t0: x = x0; break
    return x, HGT[i], walk
def presenter_state(t):
    i = max([k for k in range(5) if t >= S[k] - TR] or [0])
    if i > 0 and t < S[i] + TR:
        k = ease_io((t - (S[i] - TR)) / (2 * TR))
        cx = lerp(exitx(i - 1), entry(i), k); h = lerp(HGT[i - 1], HGT[i], k)
        layers = [(i - 1, t - starts[i - 1], 1 - k), (i, t - starts[i], k)]
        walk = math.sin(k * math.pi)
    else:
        cx, h, walk = scene_pos(i, t); layers = [(i, t - starts[i], 1.0)]
    if t < 1.8:   # intro: walks in from the right
        k = ease_out((t - 0.25) / 1.45); cx = lerp(1500, 540, k); walk = max(walk, (1 - k) if t > .25 else 0)
    return i, layers, cx, h, walk

def camera(t):
    """zoom, focus x, focus y, shake x, shake y"""
    z_keys = [(0, 1.0), (1.8, 1.0), (5.5, 1.11), (9.8, 1.12), (11.2, 1.0),
              (S[1] + .5, 1.0), (S[1] + 4.0, 1.06), (S[1] + 4.1, 1.10), (S[1] + 4.6, 1.06), (S[2] - .5, 1.04),
              (S[2] + .5, 1.03), (S[3] - .6, 1.0),
              (S[3] + .5, 1.0), (S[3] + 6.6, 1.10), (S[3] + 6.75, 1.15), (S[3] + 7.4, 1.10), (S[4] - .6, 1.04),
              (S[4] + .4, 1.07), (S[4] + 3.0, 1.0), (END, 1.02)]
    f_keys = [(0, (540, 900)), (1.8, (540, 760)), (11.2, (540, 900)),
              (S[1] + .5, (400, 975)), (S[2] - .5, (400, 975)), (S[2] + .5, (440, 900)),
              (S[3] + .5, (420, 950)), (S[4] - .6, (420, 900)), (S[4] + .4, (540, 900)), (END, (540, 960))]
    z = keyframes(t, z_keys); fx, fy = keyframes(t, f_keys)
    # impacts: stamp slam, ribbon slam, shutter clicks, button pop
    sx = sy = 0
    for t0, amp in [(S[1] + 4.1, 14), (S[3] + 6.8, 16), (S[2] + 2.95, 6), (S[2] + 5.45, 6), (S[4] + 3.0, 8)]:
        d = t - t0
        if 0 <= d < .35:
            decay = (1 - d / .35) ** 2
            sx += amp * decay * math.sin(d * 90); sy += amp * .6 * decay * math.cos(d * 75)
    return z, fx, fy, sx, sy

def whip(t):
    """horizontal whip-pan offset (px) and blur radius applied to the BACKGROUND around transitions."""
    for k in range(1, 5):
        d = t - S[k]
        if -TR < d < TR:
            direction = -1 if k % 2 else 1
            if d < 0: p = (d + TR) / TR; off = direction * (p ** 3) * W * 0.6
            else: p = d / TR; off = -direction * ((1 - p) ** 3) * W * 0.6
            speed = abs(off) / (W * .6)
            return off, int(10 + 120 * speed) if speed > .02 else 0
    return 0, 0

def hblur(arr, r):
    if r < 2: return arr
    c = np.cumsum(np.pad(arr.astype(np.float32), ((0, 0), (r, r), (0, 0)), mode='edge'), axis=1)
    out = (c[:, 2 * r:] - c[:, :-2 * r]) / (2 * r)
    return out[:, :arr.shape[1]].clip(0, 255).astype(np.uint8)

# particles (gold bokeh) and confetti — deterministic
rng = np.random.default_rng(3)
BOKEH = [dict(x=rng.uniform(0, W), y=rng.uniform(0, H), r=rng.uniform(6, 22), sp=rng.uniform(18, 55),
              ph=rng.uniform(0, 6.3), a=rng.uniform(.10, .28)) for _ in range(38)]
CONF_T0 = S[4] + 3.0
CONF = [dict(x=rng.uniform(80, W - 80), vy=rng.uniform(380, 760), vx=rng.uniform(-160, 160), y0=rng.uniform(-300, -20),
             w=rng.uniform(14, 26), h=rng.uniform(7, 12), rot=rng.uniform(0, 360), vr=rng.uniform(-420, 420),
             col=[(214, 178, 122), (240, 211, 160), (255, 250, 240), (184, 145, 95), (230, 200, 150)][rng.integers(0, 5)])
        for _ in range(150)]
bokeh_sprite = {}
def bokeh(r):
    r = int(r)
    if r not in bokeh_sprite:
        s = Image.new('L', (r * 4, r * 4), 0); ImageDraw.Draw(s).ellipse([r, r, r * 3, r * 3], fill=255)
        bokeh_sprite[r] = s.filter(ImageFilter.GaussianBlur(r * .45))
    return bokeh_sprite[r]

def shadow(w):
    s = Image.new('L', (w, 90), 0); ImageDraw.Draw(s).ellipse([w * .1, 20, w * .9, 70], fill=120)
    return s.filter(ImageFilter.GaussianBlur(14))

def presenter_layer(layers, cx, h, t, walk):
    """composite the presenter (with crossfade between poses) and return (rgb, alpha, x, y)."""
    e = energy(t)
    # life: voice-driven bob + breathing + walking bounce
    stepf = 2.2
    bob = -abs(math.sin(t * stepf * math.pi)) * 10 * walk
    scale = 1 + 0.003 * math.sin(t * 2.1)
    hh = int(round(h * scale))
    acc_rgb = None; acc_a = None
    for ci, vt, wgt in layers:
        if wgt <= 0.01: continue
        fr = clip_frame(ci, vt).resize((hh, hh), Image.LANCZOS)
        arr = np.asarray(fr, np.float32)
        src = arr[..., :3]; al = arr[..., 3:4] / 255 * wgt
        acc_rgb = src * al if acc_rgb is None else acc_rgb + src * al
        acc_a = al if acc_a is None else acc_a + al
    rgb = (acc_rgb / np.maximum(acc_a, 1e-4)).clip(0, 255).astype(np.uint8)
    a = (acc_a.clip(0, 1) * 255).astype(np.uint8)[..., 0]
    img = Image.fromarray(rgb); al = Image.fromarray(a)
    tilt = 1.2 * math.sin(t * stepf * math.pi) * walk + 0.6 * math.sin(t * 1.3) * e
    if abs(tilt) > .05:
        img = img.rotate(tilt, resample=Image.BICUBIC, center=(img.width / 2, img.height), expand=False)
        al = al.rotate(tilt, resample=Image.BICUBIC, center=(al.width / 2, al.height), expand=False)
    x = int(round(cx - img.width / 2)); y = int(round(1920 + int(img.height * 0.06) - img.height + bob))
    return img, al, x, y

for i in range(N):
    if sel is not None and i not in sel: continue
    t = i / FPS
    bg = np.asarray(Image.open(f'frames_v2/f{i:04d}.png').convert('RGB'))
    # whip pan on the background
    off, br = whip(t)
    if off:
        bg = np.roll(bg, int(off), axis=1); bg = hblur(bg, br)
    frame = Image.fromarray(bg.copy())
    # floating gold bokeh behind presenter
    glow = Image.new('RGB', (W, H), (236, 205, 150))
    for b in BOKEH:
        y = (b['y'] - t * b['sp']) % (H + 100) - 50; x = b['x'] + math.sin(t * .7 + b['ph']) * 25
        tw = .6 + .4 * math.sin(t * 2 + b['ph'])
        spr = bokeh(b['r']).point(lambda v, k=b['a'] * tw: int(v * k))
        frame.paste(glow.crop((0, 0) + spr.size), (int(x - b['r'] * 2), int(y - b['r'] * 2)), spr)
    # presenter
    idx, layers, cx, h, walk = presenter_state(t)
    img, al, x, y = presenter_layer(layers, cx, h, t, walk)
    if walk > .05:   # slight motion blur on her while walking between screens
        rgba = Image.merge('RGBA', (*img.split(), al))
        arr = hblur(np.asarray(rgba), int(walk * 10))
        img = Image.fromarray(arr[..., :3]); al = Image.fromarray(arr[..., 3])
    frame.paste(img, (x, y), al)
    # confetti at the call to action
    dt = t - CONF_T0
    if 0 <= dt < 4.5:
        d = ImageDraw.Draw(frame)
        for c in CONF:
            cy = c['y0'] + c['vy'] * dt + 120 * dt * dt; cxp = c['x'] + c['vx'] * dt + 30 * math.sin(dt * 4 + c['rot'])
            if cy > H + 40: continue
            ang = math.radians(c['rot'] + c['vr'] * dt); fl = abs(math.cos(dt * 6 + c['rot']))
            hw, hh2 = c['w'] / 2, c['h'] / 2 * (.3 + .7 * fl)
            pts = [(cxp + px * math.cos(ang) - py * math.sin(ang), cy + px * math.sin(ang) + py * math.cos(ang))
                   for px, py in [(-hw, -hh2), (hw, -hh2), (hw, hh2), (-hw, hh2)]]
            d.polygon(pts, fill=c['col'])
    # camera: zoom toward a focus point + impact shake
    z, fx, fy, sx, sy = camera(t)
    if z > 1.001 or sx or sy:
        cw, ch = W / z, H / z
        x0 = clamp(fx - cw / 2 - sx / z, 0, W - cw); y0 = clamp(fy - ch / 2 - sy / z, 0, H - ch)
        frame = frame.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))
    frame.save(f'{out_dir}/c{i:04d}.jpg', quality=92)
    if i % 300 == 0: print(i, flush=True)
print('done')
