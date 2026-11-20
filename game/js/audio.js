'use strict';
/* ===== Neon Warfront – synthesized audio (no assets) ===== */
G.sfx = (function () {
  let ac = null, master = null, musicGain = null, noiseBuf = null, musicTimer = null;
  const on = () => G.meta && G.meta.data.settings.sfx;
  function init() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!ac || !on()) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, type = 'lowpass') {
    if (!ac || !on()) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }
  // simple synthwave loop
  const BASS = [41.2, 41.2, 49, 49, 36.7, 36.7, 46.2, 46.2];
  const ARP = [0, 7, 12, 15, 12, 7, 3, 7];
  let step = 0, nextT = 0;
  function schedule() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.25) {
      const bar = Math.floor(step / 8) % BASS.length;
      const root = BASS[bar] * 2;
      const t = nextT;
      // bass
      if (step % 2 === 0) {
        const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = root; f.type = 'lowpass'; f.frequency.value = 380;
        g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.25);
      }
      // arp
      const o2 = ac.createOscillator(), g2 = ac.createGain();
      o2.type = 'triangle'; o2.frequency.value = root * 4 * Math.pow(2, ARP[step % 8] / 12);
      g2.gain.setValueAtTime(0.05, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o2.connect(g2); g2.connect(musicGain); o2.start(t); o2.stop(t + 0.14);
      // kick / hat
      if (step % 4 === 0) {
        const k = ac.createOscillator(), kg = ac.createGain();
        k.frequency.setValueAtTime(120, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        kg.gain.setValueAtTime(0.35, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        k.connect(kg); kg.connect(musicGain); k.start(t); k.stop(t + 0.2);
      }
      if (step % 2 === 1) {
        const s = ac.createBufferSource(); s.buffer = noiseBuf;
        const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ac.createGain(); g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.06);
      }
      step++; nextT += 0.125;
    }
  }
  return {
    unlock() { init(); if (ac && ac.state === 'suspended') ac.resume(); this.music(G.meta.data.settings.music); },
    music(enable) {
      if (!ac) return;
      musicGain.gain.setTargetAtTime(enable ? 0.55 : 0, ac.currentTime, 0.4);
      if (enable && !musicTimer) { nextT = ac.currentTime + 0.1; musicTimer = setInterval(schedule, 100); }
      if (!enable && musicTimer) { setTimeout(() => { if (!G.meta.data.settings.music) { clearInterval(musicTimer); musicTimer = null; } }, 1200); }
    },
    click() { tone(880, 0.06, 'square', 0.06); },
    select() { tone(660, 0.05, 'triangle', 0.1); tone(990, 0.06, 'triangle', 0.08, 0, 0.05); },
    buy() { tone(523, 0.08, 'square', 0.07); tone(784, 0.1, 'square', 0.07, 0, 0.07); },
    shot() { noise(0.08, 0.12, 2500, 'bandpass'); },
    boom(v = 1) { noise(0.6, 0.35 * v, 500); tone(90, 0.4, 'sine', 0.3 * v, -60); },
    capture() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.07, 0, i * 0.07)); },
    win() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.06, 0, i * 0.09)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, 0, i * 0.12)); },
    turn() { tone(330, 0.12, 'triangle', 0.1); tone(495, 0.16, 'triangle', 0.1, 0, 0.1); },
    error() { tone(160, 0.15, 'square', 0.08); }
  };
})();
