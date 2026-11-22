import json, subprocess, sys, numpy as np
from PIL import Image, ImageDraw
pres_path, out_dir = sys.argv[1], sys.argv[2]
geo = json.load(open('geo.json'))
# read presenter frames
probe = subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate','-of','csv=p=0',pres_path],capture_output=True,text=True).stdout.strip().split(',')
sw, sh = int(probe[0]), int(probe[1]); num,den = map(int,probe[2].split('/')); pfps = num/den
raw = subprocess.run(['ffmpeg','-v','error','-i',pres_path,'-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
P = np.frombuffer(raw,np.uint8).reshape(-1,sh,sw,3); NP=len(P)
print('presenter frames',NP,sw,sh,pfps,flush=True)
import os; os.makedirs(out_dir,exist_ok=True)
masks={}
def mask(W,H,R):
    key=(W,H,R)
    if key not in masks:
        m=Image.new('L',(W*3,H*3),0); ImageDraw.Draw(m).rounded_rectangle([0,0,W*3-1,H*3-1],radius=R*3,fill=255)
        masks[key]=m.resize((W,H),Image.LANCZOS)
    return masks[key]
sel=set(map(int,sys.argv[3].split(','))) if len(sys.argv)>3 else None
for i,g in enumerate(geo):
    if sel is not None and i not in sel: continue
    t=i/30
    bg=Image.open(f'frames_p/f{i:04d}.png').convert('RGB')
    if g['alpha']>0.01:
        idx=min(NP-1,int(t*pfps))
        src=Image.fromarray(P[idx])
        W=max(2,round(g['w']*g['scale'])); H=max(2,round(g['h']*g['scale'])); R=round(g['r']*g['scale'])
        zoom=1+g['k']*0.8; s0=max(W/sw,H/sh)*zoom
        cw,ch=W/s0,H/s0
        fx=0.5*sw; fy=(0.5+(0.40-0.5)*g['k'])*sh
        x0=min(max(fx-cw/2,0),sw-cw); y0=min(max(fy-ch/2,0),sh-ch)
        crop=src.resize((W,H),Image.LANCZOS,box=(x0,y0,x0+cw,y0+ch))
        m=mask(W,H,R)
        if g['alpha']<1: m=m.point(lambda v:int(v*g['alpha']))
        cx=g['x']+g['w']/2; cy=g['y']+g['h']/2
        bg.paste(crop,(round(cx-W/2),round(cy-H/2)),m)
    bg.save(f'{out_dir}/c{i:04d}.jpg',quality=93)
    if i%150==0: print(i,flush=True)
print('done')
