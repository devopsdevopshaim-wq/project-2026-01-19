# Procedural upbeat "chill pop" track, 104 BPM, ~27s. Deterministic.
import numpy as np, wave, sys
SR=44100; BPM=104; beat=60/BPM; DUR=float(sys.argv[2]) if len(sys.argv)>2 else 27.0
N=int(SR*DUR); L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(7)
def add(sig,t,pan=0.0,g=1.0):
    i=int(t*SR); 
    if i>=N: return
    s=sig[:N-i]*g; L[i:i+len(s)]+=s*(1-pan)*0.5*2**.5*0.7071*1.414/1.414; R[i:i+len(s)]+=s*(1+pan)*0.5
def env(n,a=0.005,d=0.3):
    t=np.arange(n)/SR; e=np.minimum(t/a,1)*np.exp(-t/d); return e
def kick():
    n=int(.45*SR); t=np.arange(n)/SR; f=45+110*np.exp(-t*28); ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*7)*1.0 + np.sin(2*np.pi*1800*t)*np.exp(-t*300)*.15
def clap():
    n=int(.3*SR); t=np.arange(n)/SR; x=rng.standard_normal(n)
    e=np.exp(-t*18)+.6*np.exp(-np.maximum(t-.012,0)*40)*(t>.012)
    x=np.convolve(x,[1,-.6],'same'); return x*e*.35
def hat(open_=False):
    n=int((.25 if open_ else .06)*SR); t=np.arange(n)/SR; x=rng.standard_normal(n); x=np.diff(np.r_[0,x])
    return x*np.exp(-t*(12 if open_ else 70))*.12
def note(f,dur,kind='pluck'):
    n=int(dur*SR); t=np.arange(n)/SR
    if kind=='pluck':
        s=sum(np.sin(2*np.pi*f*k*t)/k**1.6 for k in range(1,6)); return s*env(n,.003,.22)*.22
    if kind=='bass':
        s=np.sin(2*np.pi*f*t)+.35*np.sin(4*np.pi*f*t); return s*env(n,.01,.5)*np.minimum(1,(dur-t)/0.03+0)*.42
    if kind=='pad':
        s=sum(np.sin(2*np.pi*f*(1+d)*t) for d in(-.004,0,.004))/3; a=np.minimum(t/.4,1)*np.minimum(1,(dur-t)/.5)
        return s*a*.07
    if kind=='bell':
        s=np.sin(2*np.pi*f*t+1.5*np.sin(2*np.pi*f*3.5*t)*np.exp(-t*6)); return s*env(n,.002,.6)*.12
mid=lambda m:440*2**((m-69)/12)
# progression (C major, warm): Cmaj7 Am7 Fmaj7 G6  -> 2 bars each? 1 bar each
chords=[[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,52]]
bassn=[36,33,29,31]
bar=4*beat; nb=int(DUR/bar)+1
mel=[76,74,72,74, 72,69,67,69, 69,72,74,76, 74,71,74,79]  # 16 eighth-ish hits per 4 bars
for b in range(nb):
    t0=b*bar; c=chords[b%4]; intro=b<1; outro=t0>DUR-bar*0.9
    for m in c: add(note(mid(m+12),bar,'pad'),t0,0)
    if not intro:
        for k in range(4):
            add(kick(),t0+k*beat)
            if k%2==1: add(clap(),t0+k*beat,0.1)
        for k in range(8): add(hat(k%2==1 and k==7),t0+k*beat/2+ (0.012 if k%2 else 0),0.3,1.0 if k%2 else .6)
        # bass: syncopated
        for off,d in((0,.75),(1.5,.5),(2,.75),(3.5,.5)): add(note(mid(bassn[b%4]),d*beat,'bass'),t0+off*beat)
    # arpeggio pluck 16ths
    arp=[c[0]+12,c[1]+12,c[2]+12,c[3]+12,c[2]+12,c[1]+12,c[0]+24,c[2]+12]
    for k in range(8): add(note(mid(arp[k]),beat*.6,'pluck'),t0+k*beat/2,(-.4 if k%2 else .4),0.8 if not intro else .6)
    if b>=2:
        for k in range(4): add(note(mid(mel[(b%4)*4+k]),beat*1.2,'bell'),t0+k*beat,-.2)
mix=np.stack([L,R],1)
# sidechain-ish pump on kick grid
t=np.arange(N)/SR; pump=1-.25*np.exp(-((t%beat))*10); pump[t<bar]=1; mix*=pump[:,None]
# fade
fi=np.minimum(t/0.8,1); fo=np.clip((DUR-t)/2.0,0,1); mix*=(fi*fo)[:,None]
mix/=np.max(np.abs(mix))*1.12
# soft clip
mix=np.tanh(mix*1.2)/np.tanh(1.2)*0.85
w=wave.open(sys.argv[1],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((mix*32767).astype('<i2').tobytes()); w.close()
