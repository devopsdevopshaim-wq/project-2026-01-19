'use strict';
/* ===== Neon Warfront – audio engine =====
   Music: Komiku (CC0). Voices: Kenney Voiceover (CC0) + Meta/Oculus Audio Pack (CC BY 4.0).
   Effects: Kenney Sci-Fi & Impact (CC0), PanderMusubi weapons (CC0), Meta/Oculus Audio Pack (CC BY 4.0).
   UI blips are synthesized. */
G.sfx = (function () {
  let ac = null, master = null, sfxBus = null, musicBus = null, ambBus = null, voiceBus = null, noiseBuf = null;
  const BASE = 'audio/';
  const FILES = {
    expl: ['sfx/expl0', 'sfx/expl1', 'sfx/expl2', 'sfx/expl3', 'sfx/expl4'],
    bigboom: ['sfx/boom_big1', 'sfx/boom_big2'],
    smg: ['sfx/smg'], missile: ['sfx/missile1', 'sfx/missile2'], laser: ['sfx/laser1'],
    hit: ['sfx/hit1', 'sfx/hit2'], shell: ['sfx/shell1', 'sfx/shell2'], shield: ['sfx/shield'], snare: ['sfx/snare'], engine: ['sfx/engine'],
    scream: ['voice/scream1', 'voice/scream2', 'voice/scream3', 'voice/death1', 'voice/death2'], hurt: ['voice/hurt1', 'voice/hurt2'],
    victory: ['music/victory'], defeat: ['music/defeat'], levelup: ['music/levelup']
  };
  const VOICES = ['go_go_go', 'fire_in_the_hole', 'cover_me', 'target_destroyed', 'target_engaged', 'call_for_backup', 'look_out', 'get_down', 'rpg', 'mission_completed', 'mission_failed', 'objective_achieved'];
  VOICES.forEach(v => { FILES['a_' + v] = ['voice/a_' + v]; FILES['b_' + v] = ['voice/b_' + v]; });
  FILES.b_suppressing_fire = ['voice/b_suppressing_fire'];
  const AMB = ['sfx/amb_sea', 'sfx/amb_wind', 'sfx/amb_sea', 'sfx/amb_wind', 'sfx/amb_city'];
  const buf = {};
  const S = () => (G.meta && G.meta.data.settings) || {};
  const on = () => S().sfx !== false;
  const last = {};
  const throttle = (k, ms) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };

  function init() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.9;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(master);
      voiceBus = ac.createGain(); voiceBus.gain.value = 1; voiceBus.connect(master);
      ambBus = ac.createGain(); ambBus.gain.value = 0.35; ambBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loadAll();
    } catch (e) { ac = null; }
  }
  async function load(path) {
    if (buf[path] !== undefined) return buf[path];
    buf[path] = null;
    try {
      const r = await fetch(BASE + path + '.mp3');
      const ab = await r.arrayBuffer();
      buf[path] = await new Promise((res, rej) => ac.decodeAudioData(ab, res, rej));
    } catch (e) { buf[path] = null; }
    return buf[path];
  }
  function loadAll() { Object.values(FILES).flat().forEach(load); AMB.forEach(load); }

  function play(key, o = {}) {
    if (!ac || !on()) return null;
    const list = FILES[key]; if (!list) return null;
    const b = buf[list[Math.floor(Math.random() * list.length)]];
    if (!b) return null;
    const src = ac.createBufferSource(); src.buffer = b;
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary ?? 0.12));
    const g = ac.createGain(); g.gain.value = o.vol ?? 1;
    let node = src;
    if (o.radio) { // military radio: band-limited + light saturation
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
      const ws = ac.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.2); } ws.curve = c;
      node.connect(hp); hp.connect(lp); lp.connect(ws); node = ws;
    }
    if (o.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; }
    node.connect(g); g.connect(o.bus || sfxBus);
    src.start(ac.currentTime + (o.delay || 0));
    if (o.radio && throttle('click', 200)) { tone(1800, 0.04, 'square', 0.03); tone(1400, 0.04, 'square', 0.03, 0, (b.duration / src.playbackRate.value) + 0.05); }
    return src;
  }
  function tone(f, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!ac || !on()) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, type = 'lowpass') {
    if (!ac || !on()) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur);
  }

  /* ---------- music (streamed, crossfaded) ---------- */
  const PLAY = { menu: ['music/menu'], game: ['music/war1', 'music/war2', 'music/war3', 'music/war4'] };
  let deck = [], mode = null, idx = 0, duck = 1;
  function makeDeck() {
    const a = new Audio(); a.preload = 'none'; a.crossOrigin = 'anonymous';
    const g = ac.createGain(); g.gain.value = 0;
    try { ac.createMediaElementSource(a).connect(g); } catch (e) {}
    g.connect(musicBus);
    return { a, g };
  }
  function startTrack() {
    if (!ac || !mode || S().music === false) return;
    if (!deck.length) deck = [makeDeck(), makeDeck()];
    const list = PLAY[mode];
    const next = deck[1], cur = deck[0];
    next.a.src = BASE + list[idx % list.length] + '.mp3';
    next.a.currentTime = 0;
    next.a.onended = () => { idx++; startTrack(); };
    next.a.play().catch(() => {});
    const t = ac.currentTime;
    next.g.gain.cancelScheduledValues(t); next.g.gain.setValueAtTime(0, t); next.g.gain.linearRampToValueAtTime(1, t + 2.5);
    cur.g.gain.cancelScheduledValues(t); cur.g.gain.setValueAtTime(cur.g.gain.value, t); cur.g.gain.linearRampToValueAtTime(0, t + 2.5);
    setTimeout(() => { if (deck[1] !== cur) cur.a.pause(); }, 2700);
    deck = [next, cur];
  }
  function stopMusic() {
    if (!deck.length) return;
    const t = ac.currentTime;
    deck.forEach(d => { d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 1); });
    setTimeout(() => deck.forEach(d => d.a.pause()), 1100);
  }

  /* ---------- ambience ---------- */
  let ambSrc = null, ambWorld = -1;
  function startAmb(wi) {
    if (!ac) return;
    if (ambWorld === wi && ambSrc) return;
    stopAmb();
    const b = buf[AMB[wi]];
    if (!b) { load(AMB[wi]).then(() => { if (mode === 'game' && ambWorld === -1) startAmb(wi); }); return; }
    ambWorld = wi;
    ambSrc = ac.createBufferSource(); ambSrc.buffer = b; ambSrc.loop = true;
    const g = ac.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(1, ac.currentTime + 2);
    ambSrc.connect(g); g.connect(ambBus); ambSrc.start(); ambSrc._g = g;
  }
  function stopAmb() { if (ambSrc) { try { ambSrc.stop(ac.currentTime + 0.5); } catch (e) {} ambSrc = null; } ambWorld = -1; }

  return {
    unlock() {
      init();
      if (ac && ac.state === 'suspended') ac.resume();
      if (mode && !deck.some(d => !d.a.paused) && S().music !== false) startTrack();
    },
    scene(m, world) {
      if (!ac) { mode = m; return; }
      if (m !== mode) { mode = m; idx = m === 'game' ? Math.floor(Math.random() * 4) : 0; startTrack(); }
      if (m === 'game') startAmb(world); else stopAmb();
    },
    music(enable) { if (!ac) return; enable ? startTrack() : stopMusic(); },
    duck(on) { if (!ac) return; const t = ac.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t); musicBus.gain.linearRampToValueAtTime(on ? 0.22 : 0.55, t + 0.6); ambBus.gain.linearRampToValueAtTime(on ? 0.15 : 0.35, t + 0.6); },

    // --- UI (synth) ---
    click() { tone(880, 0.05, 'square', 0.05); },
    select() { tone(660, 0.05, 'triangle', 0.09); tone(990, 0.06, 'triangle', 0.07, 0, 0.05); },
    buy() { tone(523, 0.08, 'square', 0.06); tone(784, 0.1, 'square', 0.06, 0, 0.07); play('shell', { vol: 0.6 }); },
    error() { tone(160, 0.15, 'square', 0.08); },
    turn() { play('snare', { vol: 0.7, vary: 0 }) || (tone(330, 0.12, 'triangle', 0.1), tone(495, 0.16, 'triangle', 0.1, 0, 0.1)); },

    // --- combat ---
    shot(type) {
      if (!ac || !on()) return;
      if (type === 'tank' || type === 'mech') { if (throttle('cannon', 90)) play('bigboom', { vol: 0.45, rate: 1.5, vary: 0.2 }) || noise(0.3, 0.3, 700); }
      else if (type === 'art') { if (throttle('art', 150)) play('bigboom', { vol: 0.6, rate: 1.1 }); }
      else if (type === 'heli' || type === 'jet' || type === 'aa') { if (throttle('msl', 120)) play('missile', { vol: 0.55, rate: 1.2 }) || noise(0.15, 0.15, 3000, 'bandpass'); }
      else if (throttle('smg', 60)) play('smg', { vol: 0.32, rate: 1 + Math.random() * 0.25, pan: (Math.random() - 0.5) * 0.8 }) || noise(0.08, 0.12, 2500, 'bandpass');
    },
    boom(v = 1) {
      if (!throttle('boom', 70)) return;
      if (!play(v > 0.8 ? 'bigboom' : 'expl', { vol: 0.5 + 0.5 * Math.min(1, v), pan: (Math.random() - 0.5) * 0.6 })) { noise(0.6, 0.35 * v, 500); tone(90, 0.4, 'sine', 0.3 * v, -60); }
      if (Math.random() < 0.3) play('hit', { vol: 0.25, delay: 0.05 });
    },
    scream() { if (throttle('scream', 900) && Math.random() < 0.55) play(Math.random() < 0.6 ? 'scream' : 'hurt', { vol: 0.35, pan: (Math.random() - 0.5) * 0.8 }); },
    voice(line, enemy = false) {
      if (!throttle('voice', 1300)) return;
      play((enemy ? 'b_' : 'a_') + line, { vol: 1, vary: 0.03, radio: true, bus: voiceBus });
    },
    shield() { play('shield', { vol: 0.7 }); },
    engine() { if (throttle('engine', 1500)) play('engine', { vol: 0.25, rate: 0.7 }); },
    battleEnd(good) {
      play(good ? 'levelup' : 'defeat', { vol: 0.6, vary: 0 }) || (good ? this._arp(1) : this._arp(0));
      setTimeout(() => this.voice(good ? 'target_destroyed' : 'get_down'), 450);
    },
    capture() { play('levelup', { vol: 0.45, vary: 0 }) || this._arp(1); },
    win() { this.duck(true); play('victory', { vol: 0.9, vary: 0 }) || this._arp(1); setTimeout(() => { this.voice('mission_completed'); this.duck(false); }, 1600); },
    lose() { this.duck(true); play('defeat', { vol: 0.9, vary: 0 }) || this._arp(0); setTimeout(() => { this.voice('mission_failed'); this.duck(false); }, 1600); },
    _arp(up) { (up ? [523, 659, 784, 1046] : [392, 330, 262, 196]).forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.06, 0, i * 0.09)); }
  };
})();
