"""Turn the EchoMimicV2 clips into 30fps, upscaled, background-removed RGBA frame folders: ../v4/clip{i}/f0000.png"""
import glob, os, subprocess, sys
from PIL import Image
from rembg import remove, new_session

OUT = '../v4'
clips = {}
import re
for i in [int(x) for x in os.environ.get("LINES", "1,2,3,4,5").split(",")]:
    parts = sorted(glob.glob(f'../ext/echomimic_v2/output/**/ref_{i}_s*_sig.mp4', recursive=True),
                   key=lambda p: int(re.search(r'_s(\d+)-', os.path.basename(p)).group(1)))
    if not parts: continue
    os.makedirs(OUT, exist_ok=True)
    lst = f'{OUT}/list{i}.txt'
    open(lst, 'w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    cat = f'{OUT}/line{i}_12fps.mp4'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-an', '-c:v', 'libx264', '-crf', '14', cat], check=True)
    clips[i] = cat
print(clips)
sess = new_session("u2net_human_seg")
for i, p in sorted(clips.items()):
    d = f'{OUT}/clip{i}'
    os.makedirs(d, exist_ok=True)
    tmp = f'{OUT}/clip{i}_30.mp4'
    # motion-interpolate 12 -> 30 fps and upscale for the composite
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', p, '-vf',
                    "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1,scale=1024:1024:flags=lanczos",
                    '-an', tmp], check=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, f'{d}/raw%04d.png'], check=True)
    frames = sorted(glob.glob(f'{d}/raw*.png'))
    for k, f in enumerate(frames):
        im = Image.open(f).convert('RGB')
        m = remove(im, session=sess, only_mask=True, post_process_mask=True)
        im.putalpha(m)
        im.save(f'{d}/f{k:04d}.png')
        os.remove(f)
    print('clip', i, len(frames), flush=True)
print('done')
