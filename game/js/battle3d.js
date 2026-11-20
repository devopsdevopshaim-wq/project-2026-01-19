/* ===== Neon Warfront – realistic combat VFX & battle camera =====
   Noise-shaded fire, smoke and dust billboards; dirt impacts; spark streaks; debris; scorch decals;
   burning wrecks; per-weapon ballistics; shot-driven casualties; units that advance in loose formation
   and turn toward their targets; one smooth, continuous camera move (no shake, no cuts, no slow motion);
   a film-style colour grade during battles; image-based lighting for more natural materials. */
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from '../vendor/addons/RoomEnvironment.js';

const G = window.G;
const R3 = G.__r3d;
if (R3) install(R3);

function install({ THREE, makeUnit, mats, geo, mesh, TEX, S, Renderer3D }) {
  const P = Renderer3D.prototype;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const DUST = ['#8a7a62', '#b08a5a', '#9aa4b0', '#4a4040', '#5a5a6a'];

  /* ---------- natural lighting: image-based environment ---------- */
  const origSetMap = P.setMap;
  P.setMap = function (map) {
    origSetMap.call(this, map);
    try {
      if (!this._envTex) {
        const pm = new THREE.PMREMGenerator(this.renderer);
        this._envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        pm.dispose();
      }
      this.scene.environment = this._envTex;
      this.scene.environmentIntensity = 0.32;
    } catch (e) {}
    this.vfx = null;
  };

  /* ---------- puff shader (fire / smoke / dust billboards) ---------- */
  const NOISE = `
    float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
    float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n3(p); p*=2.03; a*=0.5; } return s; }`;
  const puffVS = `
    uniform float uSize; uniform float uRot; varying vec2 vUv;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
      float c = cos(uRot), s = sin(uRot); vec2 q = vec2(c*position.x - s*position.y, s*position.x + c*position.y);
      mv.xy += q * uSize; gl_Position = projectionMatrix * mv; }`;
  const puffFS = `
    uniform float uLife; uniform float uSeed; uniform float uAge; uniform float uMode; uniform vec3 uTint; uniform float uOpacity;
    varying vec2 vUv; ${NOISE}
    void main(){
      vec2 p = vUv*2.0-1.0; float r = length(p);
      float n = fbm(vec3(p*2.1 + uSeed, uSeed*3.1 + uAge*1.3));
      float edge = r + (n-0.5)*0.8;
      float body = 1.0 - smoothstep(0.4, 0.98, edge);
      if (uMode < 0.5) {
        float heat = clamp(body * (1.0 - uLife*1.25) * (0.45 + n), 0.0, 1.0);
        vec3 c = mix(vec3(0.18,0.05,0.02), vec3(0.95,0.32,0.06), smoothstep(0.05,0.35,heat));
        c = mix(c, vec3(1.0,0.66,0.25), smoothstep(0.35,0.7,heat));
        c = mix(c, vec3(1.0,0.9,0.7), smoothstep(0.75,1.0,heat));
        float a = smoothstep(0.03,0.2,heat) * uOpacity;
        gl_FragColor = vec4(c*(0.55+heat*0.9)*a, a);
      } else {
        float d = body * (0.55+0.45*n) * (1.0 - smoothstep(0.45,1.0,uLife)) * smoothstep(0.0,0.06,uLife+0.01);
        vec3 c = uTint*(0.55+0.6*n);
        gl_FragColor = vec4(c, d*uOpacity);
      }
    }`;
  const quad = new THREE.PlaneGeometry(1, 1);
  const pool = { fire: [], smoke: [] };
  function puffMesh(kind) {
    const p = pool[kind].pop();
    if (p) { p.visible = true; return p; }
    const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: puffVS, fragmentShader: puffFS, transparent: true, depthWrite: false,
      blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uSize: { value: 1 }, uRot: { value: 0 }, uLife: { value: 0 }, uSeed: { value: 0 }, uAge: { value: 0 }, uMode: { value: kind === 'fire' ? 0 : 1 }, uTint: { value: new THREE.Color(0x2a2626) }, uOpacity: { value: 1 } }
    }));
    m.frustumCulled = false; m.renderOrder = kind === 'fire' ? 8 : 7; m.userData.kind = kind;
    return m;
  }
  const scorchTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 6, 64, 64, 62); r.addColorStop(0, 'rgba(14,11,9,.9)'); r.addColorStop(0.55, 'rgba(28,22,17,.6)'); r.addColorStop(1, 'rgba(30,22,16,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`; const a = Math.random() * 6.28, d = Math.random() * 50; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 6, 0, 6.28); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  /* ---------- FX system ---------- */
  P.vfxInit = function () {
    if (this.vfx && this.vfx.scene === this.scene) return;
    const N = 600;
    const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lines.frustumCulled = false; lines.renderOrder = 9;
    this.scene.add(lines);
    this.vfx = { scene: this.scene, puffs: [], sparks: { lines, pos, col, p: [], N }, debris: [], decals: [], emitters: [], projectiles: [] };
  };
  P.dustColor = function () { return DUST[this.map ? this.map.wi : 0]; };
  P.puff = function (kind, at, o = {}) {
    this.vfxInit();
    const low = this.quality === 'low';
    if (this.vfx.puffs.length > (low ? 110 : 280) || (low && kind === 'smoke' && Math.random() < 0.4)) return null;
    const m = puffMesh(kind);
    m.position.copy(at);
    const u = m.material.uniforms;
    u.uSeed.value = Math.random() * 50; u.uRot.value = Math.random() * 6.28; u.uOpacity.value = o.op ?? 1;
    u.uTint.value.set(o.tint || (kind === 'smoke' ? 0x2b2727 : 0xffffff));
    m.userData.p = { op0: o.op ?? 1, vel: o.vel || V(rnd(-0.1, 0.1), kind === 'fire' ? rnd(0.3, 0.7) : rnd(0.15, 0.4), rnd(-0.1, 0.1)), size: o.size || 0.5, grow: o.grow ?? 1.2, life: o.life || (kind === 'fire' ? 0.6 : 2.6), age: 0, drag: o.drag ?? 1.4, rise: o.rise ?? 0.12, spin: rnd(-0.4, 0.4) };
    this.fxLayer.add(m); this.vfx.puffs.push(m);
    return m;
  };
  P.sparks = function (at, n, speed = 4, color = [1, 0.62, 0.25]) {
    this.vfxInit();
    const s = this.vfx.sparks;
    for (let i = 0; i < n; i++) {
      if (s.p.length >= s.N) s.p.shift();
      const a = Math.random() * 6.28, el = rnd(0.2, 1.3);
      s.p.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * Math.cos(el) * speed * rnd(0.3, 1), vy: Math.sin(el) * speed * rnd(0.4, 1.1), vz: Math.sin(a) * Math.cos(el) * speed * rnd(0.3, 1), life: rnd(0.25, 0.6), age: 0, c: color });
    }
  };
  P.decal = function (at, size = 1) {
    this.vfxInit();
    const m = new THREE.Mesh(geo('decalQ', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(at.x, at.y + 0.015, at.z); m.rotation.y = Math.random() * 6.28; m.scale.setScalar(size);
    m.renderOrder = 3; m.userData.age = 0;
    this.fxLayer.add(m); this.vfx.decals.push(m);
    if (this.vfx.decals.length > 40) { const d = this.vfx.decals.shift(); this.fxLayer.remove(d); d.material.dispose(); }
  };
  P.emitter = function (obj, o) { this.vfxInit(); this.vfx.emitters.push({ obj, until: performance.now() + (o.dur || 6000), fire: o.fire ?? 0.5, smoke: o.smoke ?? 1, off: o.off || V(0, 0.15, 0), size: o.size || 0.3, acc: 0 }); };
  const chunk = (r, c) => { const d = new THREE.Mesh(geo('chunk', () => new THREE.DodecahedronGeometry(0.03, 0)), mats(c).dark); d.castShadow = true; return d; };
  P.debrisBurst = function (at, n, power, color = '#2a2622', trail = false) {
    this.vfxInit();
    for (let i = 0; i < n; i++) {
      const d = chunk(0.03, color);
      d.position.copy(at).add(V(0, 0.08, 0)); d.scale.setScalar(rnd(0.6, 1.6));
      d.userData = { v: V(rnd(-1.6, 1.6) * power, rnd(1.6, 3.4) * power, rnd(-1.6, 1.6) * power), floor: at.y, age: 0, life: rnd(1.2, 2), trail };
      this.fxLayer.add(d); this.vfx.debris.push(d);
    }
  };

  // dirt impact: no fireball, just a plume of earth (what most shells look like)
  P.dirtImpact = function (pos, big = 0.5) {
    const at = pos.clone(), dc = this.dustColor();
    this.sprite(at.clone().add(V(0, 0.08, 0)), { color: '#ffcf96', size: 0.35 * big, life: 0.07, glow: 1.2 });
    for (let i = 0; i < Math.round(3 + 4 * big); i++) this.puff('smoke', at.clone().add(V(rnd(-0.08, 0.08), rnd(0.02, 0.15), rnd(-0.08, 0.08))), { size: rnd(0.22, 0.4) * big + 0.1, grow: 1.6, life: rnd(1.4, 2.4), vel: V(rnd(-0.25, 0.25), rnd(0.7, 1.6) * big + 0.3, rnd(-0.25, 0.25)), drag: 2.2, rise: 0.02, tint: dc, op: 0.9 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; this.puff('smoke', at.clone().add(V(0, 0.03, 0)), { size: 0.18 * big + 0.08, grow: 2.2, life: 1.6, vel: V(Math.cos(a) * 0.9 * big, 0.05, Math.sin(a) * 0.9 * big), drag: 3, tint: dc, op: 0.7 }); }
    this.debrisBurst(at, Math.round(4 + 6 * big), 0.6 + big * 0.5, '#3b3026');
    if (big >= 0.7) this.decal(at, 0.3 + big * 0.3);
    G.sfx.boom(Math.min(1, 0.25 + big * 0.5));
  };

  // vehicle / heavy explosion: short fireball, then a lot of dark smoke
  P.explode = function (pos, big = 1, o = {}) {
    this.vfxInit();
    const at = pos.clone();
    this.sprite(at.clone().add(V(0, 0.15 * big, 0)), { color: '#ffd9a0', size: 0.7 * big, life: 0.1, grow: 1.5, glow: 1.4 });
    this.flash(at, 3.5 * big, 0xffa050);
    for (let i = 0; i < Math.round(3 + 3 * big); i++) this.puff('fire', at.clone().add(V(rnd(-0.12, 0.12) * big, rnd(0.05, 0.25) * big, rnd(-0.12, 0.12) * big)), { size: rnd(0.28, 0.5) * big, grow: 1.3, life: rnd(0.35, 0.6), vel: V(rnd(-0.4, 0.4) * big, rnd(0.6, 1.3) * big, rnd(-0.4, 0.4) * big), drag: 2.6 });
    for (let i = 0; i < Math.round(4 + 4 * big); i++) this.puff('smoke', at.clone().add(V(rnd(-0.15, 0.15) * big, rnd(0.2, 0.5) * big, rnd(-0.15, 0.15) * big)), { size: rnd(0.3, 0.55) * big, grow: 1.6, life: rnd(2.6, 4) * (0.7 + big * 0.3), vel: V(rnd(-0.12, 0.12), rnd(0.35, 0.7) * big, rnd(-0.12, 0.12)), op: 0.9, tint: 0x1d1a19 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; this.puff('smoke', at.clone().add(V(0, 0.04, 0)), { size: 0.25 * big, grow: 2.2, life: 1.6, vel: V(Math.cos(a) * 1.2 * big, 0.06, Math.sin(a) * 1.2 * big), drag: 3, tint: o.dust || this.dustColor(), op: 0.75 }); }
    this.sparks(at.clone().add(V(0, 0.15, 0)), Math.round(12 * big), 3.5 * big);
    this.debrisBurst(at, Math.round(3 * big), 1 + big * 0.3, '#222', true);
    if (big >= 0.6) this.decal(at, 0.45 * big + 0.2);
    if (!o.silent) G.sfx.boom(Math.min(1.2, 0.45 * big + 0.2));
  };

  P.vfxUpdate = function (dt) {
    if (!this.vfx || this.vfx.scene !== this.scene) return;
    const now = performance.now(), cam = this.camera;
    const keep = [];
    for (const m of this.vfx.puffs) {
      const p = m.userData.p; p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { this.fxLayer.remove(m); m.visible = false; pool[m.userData.kind].push(m); continue; }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      if (m.userData.kind === 'smoke') p.vel.y += p.rise * dt;
      m.position.addScaledVector(p.vel, dt);
      const u = m.material.uniforms;
      const cd = m.position.distanceTo(cam.position);
      u.uOpacity.value = p.op0 * Math.min(1, Math.max(0, (cd - 0.8) / 1.6));
      u.uLife.value = k; u.uAge.value = p.age; u.uSize.value = p.size * (1 + p.grow * Math.sqrt(k)); u.uRot.value += p.spin * dt;
      keep.push(m);
    }
    this.vfx.puffs = keep;
    const s = this.vfx.sparks; let n = 0;
    s.p = s.p.filter(q => (q.age += dt) < q.life);
    for (const q of s.p) {
      q.vy -= 9 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = 1 - q.age / q.life, L = 0.03;
      s.pos.set([q.x, q.y, q.z, q.x - q.vx * L, q.y - q.vy * L, q.z - q.vz * L], n * 6);
      const b = 2.2 * k; s.col.set([q.c[0] * b, q.c[1] * b, q.c[2] * b, q.c[0] * b * 0.3, q.c[1] * b * 0.2, 0], n * 6);
      n++;
    }
    s.lines.geometry.setDrawRange(0, n * 2);
    s.lines.geometry.attributes.position.needsUpdate = true; s.lines.geometry.attributes.color.needsUpdate = true;
    this.vfx.debris = this.vfx.debris.filter(d => {
      const u = d.userData; u.age += dt;
      if (u.age > u.life) { this.fxLayer.remove(d); return false; }
      u.v.y -= 9.5 * dt; d.position.addScaledVector(u.v, dt); d.rotation.x += dt * 9; d.rotation.y += dt * 7;
      if (d.position.y < u.floor) { d.position.y = u.floor; u.v.multiplyScalar(0.3); u.v.y = Math.abs(u.v.y) * 0.35; }
      if (u.trail && Math.random() < 0.4) this.puff('smoke', d.position.clone(), { size: 0.1, grow: 2, life: 0.9, vel: V(0, 0.1, 0), op: 0.6, tint: 0x2a2626 });
      return true;
    });
    for (const d of this.vfx.decals) { d.userData.age += dt; if (d.userData.age > 25) d.material.opacity = Math.max(0, 0.55 * (1 - (d.userData.age - 25) / 5)); }
    this.vfx.emitters = this.vfx.emitters.filter(e => {
      if (now > e.until || !e.obj.parent) return false;
      e.acc += dt;
      while (e.acc > 0.07) {
        e.acc -= 0.07;
        const at = e.obj.getWorldPosition(V()).add(e.off);
        if (Math.random() < e.fire) this.puff('fire', at.clone().add(V(rnd(-0.05, 0.05), 0, rnd(-0.05, 0.05))), { size: e.size * rnd(0.5, 0.85), grow: 0.7, life: rnd(0.3, 0.5), vel: V(rnd(-0.04, 0.04), rnd(0.5, 0.8), rnd(-0.04, 0.04)), drag: 0.6 });
        if (Math.random() < e.smoke * 0.55) this.puff('smoke', at.clone().add(V(0, 0.12, 0)), { size: e.size * 1.1, grow: 2.2, life: rnd(3, 4.2), vel: V(rnd(-0.06, 0.06), rnd(0.4, 0.6), rnd(-0.06, 0.06)), drag: 0.35, op: 0.8, tint: 0x1b1918 });
      }
      return true;
    });
    this.vfx.projectiles = this.vfx.projectiles.filter(pr => pr.update(dt));
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      u.uAmt.value += ((this.cineOn ? 1 : 0) - u.uAmt.value) * Math.min(1, dt * 2.5);
      u.uTime.value = now / 1000;
      this.gradePass.enabled = u.uAmt.value > 0.01;
      if (this.bloom) this.bloom.strength = this._bloom0 !== undefined ? G.lerp(this._bloom0, 0.12, u.uAmt.value) : this.bloom.strength;
    }
  };
  const origUP = P.updateParticles;
  P.updateParticles = function (dt) { origUP.call(this, dt); this.vfxUpdate(dt); };

  /* ---------- steady camera: no shake ever, smooth cinematic override ---------- */
  const origUC = P.updateCamera;
  P.updateCamera = function () {
    this.shake = 0;
    origUC.call(this);
    const mapLook = V(this.cam.x * S, 0.4, this.cam.y * S);
    const c = this.cine;
    if (c) {
      this.camera.position.copy(c.pos); this.camera.lookAt(c.look); this.camera.updateMatrixWorld();
      this._lastLook = c.look.clone();
      return;
    }
    const b = this.cineBlend;
    if (b) {   // ease from the cinematic camera back to the map camera
      const k0 = Math.min(1, (performance.now() - b.t0) / 1400), k = k0 * k0 * (3 - 2 * k0);
      const pos = b.pos.clone().lerp(this.camera.position, k), look = b.look.clone().lerp(mapLook, k);
      this.camera.position.copy(pos); this.camera.lookAt(look); this.camera.updateMatrixWorld();
      if (k0 >= 1) this.cineBlend = null;
    }
  };
  P.ensureGrade = function () {
    if (this.gradePass || !this.composer) return;
    this._bloom0 = this.bloom ? this.bloom.strength : 0.3;
    this.gradePass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uAmt: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uTime; varying vec2 vUv;
        float rn(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.299,0.587,0.114));
          vec3 g = mix(vec3(l), c.rgb, 0.72);                       // desaturate
          g = (g - 0.5) * 1.08 + 0.5;                               // contrast
          g *= mix(vec3(0.93,1.0,1.04), vec3(1.05,1.0,0.93), smoothstep(0.2,0.8,l)); // teal shadows, warm highlights
          vec2 d = vUv-0.5; g *= 1.0 - 0.35*smoothstep(0.1, 0.55, dot(d,d)*2.0);   // soft vignette
          g += (rn(vUv*vec2(1733.0,977.0)+fract(uTime*7.0)) - 0.5)*0.025;           // fine film grain
          gl_FragColor = vec4(mix(c.rgb, g, uAmt), c.a);
        }`
    });
    this.gradePass.enabled = false;
    this.composer.insertPass(this.gradePass, this.composer.passes.length - 1);
  };

  /* ---------- ballistics ---------- */
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc977').multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.85 });
  const shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(1.6), toneMapped: false });
  P.fire = function (o) {
    this.vfxInit();
    const from = o.from.clone(), to = o.to.clone();
    const dist = from.distanceTo(to);
    const dur = { bullet: 0.07 + dist * 0.02, shell: 0.1 + dist * 0.03, arty: 1.1, missile: 0.55 + dist * 0.08, flak: 0.22 }[o.kind];
    let obj = null;
    if (o.kind === 'missile') {
      obj = new THREE.Group();
      obj.add(mesh(geo('msl', () => new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6).rotateZ(Math.PI / 2)), mats('#5a5a5a').mid));
      const fl = new THREE.Mesh(geo('mflame', () => new THREE.SphereGeometry(0.025, 8, 6)), shellMat); fl.position.x = -0.075; obj.add(fl);
    } else if (o.kind === 'bullet' ? o.tracer : true) {
      obj = new THREE.Mesh(geo('tracer', () => new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4).rotateZ(Math.PI / 2)), o.kind === 'bullet' ? tracerMat : shellMat);
      if (o.kind !== 'bullet') obj.scale.set(0.6, 2, 2);
    }
    if (obj) { obj.position.copy(from); this.fxLayer.add(obj); }
    const ctrl = from.clone().lerp(to, 0.5).add(V(rnd(-0.3, 0.3), o.kind === 'arty' ? 2.4 + dist * 0.3 : o.kind === 'missile' ? rnd(0.2, 0.6) : 0, rnd(-0.3, 0.3)));
    const bez = t => { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return V(a * from.x + b * ctrl.x + c * to.x, a * from.y + b * ctrl.y + c * to.y, a * from.z + b * ctrl.z + c * to.z); };
    const curved = o.kind === 'arty' || o.kind === 'missile';
    let t = 0, prev = from.clone(), whistled = false;
    this.vfx.projectiles.push({
      update: (dt) => {
        t += dt / dur;
        const p = t >= 1 ? to : curved ? bez(t) : from.clone().lerp(to, t);
        if (obj) {
          obj.position.copy(p);
          const dir = p.clone().sub(prev);
          if (dir.lengthSq() > 1e-8) { obj.lookAt(p.clone().add(dir)); obj.rotateY(-Math.PI / 2); }
        }
        prev.copy(p);
        if (o.kind === 'missile' && Math.random() < 0.9) this.puff('smoke', p.clone(), { size: 0.08, grow: 3, life: 1.6, vel: V(0, 0.04, 0), op: 0.55, tint: 0xc9c4bc, rise: 0.05 });
        if (o.kind === 'arty' && !whistled && t > 0.5) { whistled = true; G.sfx.whistle && G.sfx.whistle(); }
        if (t >= 1) { if (obj) this.fxLayer.remove(obj); o.onHit && o.onHit(to); return false; }
        return true;
      }
    });
    // muzzle: small flash; big guns throw up a dust cloud around the barrel
    const mz = { bullet: 0.09, shell: 0.3, arty: 0.38, missile: 0.16, flak: 0.14 }[o.kind];
    this.sprite(from, { color: '#ffcc88', size: mz, life: 0.05, glow: 1.3 });
    if (o.kind === 'shell' || o.kind === 'arty') {
      this.flash(from, 1.6, 0xffb060);
      for (let i = 0; i < 4; i++) this.puff('smoke', from.clone().add(V(rnd(-0.05, 0.05), -0.1, rnd(-0.05, 0.05))), { size: 0.16, grow: 2.4, life: 1.8, vel: V(rnd(-0.5, 0.5), 0.12, rnd(-0.5, 0.5)), drag: 2.5, op: 0.6, tint: this.dustColor() });
      this.puff('smoke', from.clone(), { size: 0.12, grow: 2.5, life: 1.4, vel: V(0, 0.15, 0), op: 0.5, tint: 0x8c8780 });
    }
  };

  /* ---------- battle ---------- */
  const CLS = t => G.UNITS[t].cls;
  const WEAPON = { inf: 'bullet', commando: 'bullet', tank: 'shell', art: 'arty', aa: 'flak', heli: 'missile', jet: 'missile', mech: 'shell' };
  const PREF = { inf: ['inf', 'art', 'aa'], commando: ['inf', 'art', 'aa'], tank: ['armor', 'inf', 'aa', 'art'], art: ['armor', 'inf', 'aa', 'art'], aa: ['air'], heli: ['armor', 'art', 'aa'], jet: ['armor', 'air', 'art'], mech: ['armor', 'air', 'inf'] };
  const RELOAD = { bullet: [1.0, 2.0], shell: [2.8, 4.0], arty: [3.8, 5.2], missile: [3, 4.5], flak: [0.7, 1.2] };

  P.battle = function (opts) {
    return new Promise(resolve => {
      this.ensureGrade(); this.vfxInit();
      const ov = document.getElementById('battle');
      ov.classList.add('show'); document.body.classList.add('cine');
      document.getElementById('battle-title').textContent = `${opts.att.name}  ⚔  ${opts.def.name}`;
      document.getElementById('battle-place').textContent = opts.place;
      const banner = document.getElementById('battle-banner');
      const saveCam = { ...this.cam }, saveYaw = this.yaw;
      const T = opts.tid, C = this.centerOf(T);
      const src = opts.from !== undefined ? this.centerOf(opts.from) : C.clone().add(V(-3, 0, 2));
      const dir = V(C.x - src.x, 0, C.z - src.z).normalize();
      const perp = V(-dir.z, 0, dir.x);
      const playerSide = G.match && opts.att.color === G.match.factions[0].color ? 'A' : 'D';
      this.hidden.add(T);
      if (this.garrison[T]) { this.unitLayer.remove(this.garrison[T].group); delete this.garrison[T]; }
      this.cineOn = true;
      G.sfx.duck(true);

      // clear scenery from the battlefield (restored afterwards)
      const cleared = [], zero = new THREE.Matrix4().makeScale(0, 0, 0), tmp = new THREE.Matrix4();
      if (this.featGroup) this.featGroup.traverse(im => {
        if (!im.isInstancedMesh || !im.userData.pts) return;
        im.userData.pts.forEach((p, i) => { const dx = p.x - C.x, dz = p.z - C.z; if (dx * dx + dz * dz < 4.4 || ((p.x - src.x) ** 2 + (p.z - src.z) ** 2 < 1.6)) { im.getMatrixAt(i, tmp); cleared.push([im, i, tmp.clone()]); im.setMatrixAt(i, zero); } });
        im.instanceMatrix.needsUpdate = true;
      });

      // ---- loose formations ----
      const squad = [];
      const yawTo = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
      const spawn = (units, side, color) => {
        const types = G.UNIT_ORDER.filter(k => units[k] > 0);
        const per = Math.max(1, Math.floor(10 / Math.max(1, types.length)));
        const list = [];
        types.forEach(t => { const n = Math.min(units[t], per, t === 'inf' ? 3 : 4); for (let i = 0; i < n; i++) list.push(t); });
        // armour leads, infantry follows, artillery and AA at the back
        const rank = t => ({ armor: 0, air: 0, inf: 1, aa: 2, art: 2 })[CLS(t)];
        list.sort((a, b) => rank(a) - rank(b));
        list.forEach((t, idx) => {
          const u = makeUnit(t, color);
          u.scale.multiplyScalar(1.2);
          const fr = u.getObjectByName('fring'); if (fr) fr.visible = false;
          const lane = (idx % 4) - 1.5, row = rank(t) + Math.floor(idx / 8) * 0.5;
          const depth = 0.55 * row + rnd(-0.12, 0.12), width = lane * 0.66 + rnd(-0.16, 0.16);
          const base = side === 'A' ? C.clone().addScaledVector(dir, -1.5 - depth) : C.clone().addScaledVector(dir, 0.15 + depth);
          base.addScaledVector(perp, width);
          base.y = (side === 'A' ? G.lerp(src.y, C.y, 0.8) : C.y) + (u.userData.air || 0) * 0.8;
          const start = side === 'A' ? base.clone().addScaledVector(dir, -1.8) : base.clone();
          u.position.copy(start);
          u.rotation.y = side === 'A' ? yawTo(V(), dir) : yawTo(V(), dir.clone().negate());
          Object.assign(u.userData, { side, home: base, start, alive: true, type: t, cool: rnd(0.4, 2.2), yaw: u.rotation.y, delay: rnd(0, 0.5) });
          if (side === 'A' && u.userData.play) u.userData.play('move');
          this.fxLayer.add(u); squad.push(u);
        });
      };
      spawn(opts.att.units, 'A', opts.att.color);
      spawn(opts.def.units, 'D', opts.def.color);
      const walls = [];
      for (let l = 0; l < (opts.fort || 0); l++) for (let k = -2; k <= 2; k++) {
        const w = mesh(geo('sandbag', () => new THREE.CapsuleGeometry(0.035, 0.16, 2, 6).rotateZ(Math.PI / 2)), mats('#9c8a62').body);
        w.position.copy(C).addScaledVector(dir, -0.45 - l * 0.18).addScaledVector(perp, k * 0.36); w.position.y = C.y + 0.06;
        w.rotation.y = yawTo(V(), perp); this.fxLayer.add(w); walls.push(w);
      }
      if (playerSide === 'A') { G.sfx.voice('go_go_go'); setTimeout(() => G.sfx.voice('target_engaged', true), 2200); }
      else { G.sfx.voice('look_out'); setTimeout(() => G.sfx.voice('cover_me'), 2200); }

      const res = opts.result, initial = { A: G.cloneU(opts.att.units), D: G.cloneU(opts.def.units) };
      const APPROACH = 2.2, RD = 1.9;
      const total = APPROACH + res.rounds.length * RD;
      let t = 0, last = performance.now(), ended = 0, finished = false, applied = -1;
      const kills = [];
      const alive = side => squad.filter(u => u.userData.alive && u.userData.side === side);
      const muzzle = u => u.position.clone().add(V(0, u.userData.air ? -0.05 : (CLS(u.userData.type) === 'inf' ? 0.2 : 0.26), 0)).add(V(Math.cos(u.userData.yaw), 0, -Math.sin(u.userData.yaw)).multiplyScalar(0.18));
      const aimPt = u => u.position.clone().add(V(rnd(-0.05, 0.05), u.userData.air ? 0 : 0.12, rnd(-0.05, 0.05)));
      const pickTarget = (shooter, poolU) => {
        const pref = PREF[shooter.userData.type] || [];
        for (const c of pref) { const l = poolU.filter(u => CLS(u.userData.type) === c); if (l.length) return l[Math.floor(Math.random() * l.length)]; }
        return shooter.userData.type === 'aa' ? null : poolU[Math.floor(Math.random() * poolU.length)];
      };

      // ---- one continuous camera move (crane down from behind the attackers, slow arc to the side) ----
      const cine = this.cine = { pos: null, look: null };
      const camAt = (u) => {
        const e = u * u * (3 - 2 * u);
        const pos = C.clone().addScaledVector(dir, -3.6 + 1.2 * e).addScaledVector(perp, 3.6 + 0.9 * e).add(V(0, 3.7 - 0.9 * e, 0));
        const look = C.clone().addScaledVector(dir, -0.8 + 0.4 * e).add(V(0, 0.1, 0));
        return { pos, look };
      };
      cine.pos = this.camera.position.clone(); cine.look = V(this.cam.x * S, 0.4, this.cam.y * S);
      const director = (dt) => {
        const u = Math.min(1, t / (total + 2.5));
        const w = camAt(u);
        const k = 1 - Math.pow(0.15, dt);          // gentle critically-damped follow, never snaps
        cine.pos.lerp(w.pos, k); cine.look.lerp(w.look, k);
      };

      const kill = (u) => {
        if (!u.userData.alive) return;
        u.userData.alive = false; u.userData.dieT = t;
        const c = CLS(u.userData.type), at = u.position.clone();
        if (c === 'inf') {
          this.dirtImpact(at, 0.35);
          G.sfx.scream();
          u.userData.fall = { side: Math.random() < 0.5 ? 1 : -1 };
        } else if (c === 'air') {
          this.explode(at, 0.6);
          this.emitter(u, { fire: 0.7, smoke: 1, size: 0.2, dur: 3000 });
          u.userData.crash = true;
        } else {
          this.explode(at, u.userData.type === 'mech' ? 1.3 : 1.0);
          setTimeout(() => !finished && this.explode(at.clone().add(V(rnd(-0.08, 0.08), 0.1, rnd(-0.08, 0.08))), 0.45, { silent: true }), 350);
          const tur = u.getObjectByName('turret');
          if (tur) { const wp = tur.getWorldPosition(V()); u.remove(tur); tur.position.copy(wp); tur.scale.multiplyScalar(1.2); this.fxLayer.add(tur); tur.userData = { v: V(rnd(-0.6, 0.6), 2.6, rnd(-0.6, 0.6)), floor: at.y, age: 0, life: 2.5 }; this.vfx.debris.push(tur); }
          if (!(u.userData.play && u.userData.play('die', true))) u.traverse(o => { if (o.isMesh && o.name !== 'fring') o.material = mats('#000').burnt; });
          this.emitter(u, { fire: 0.6, smoke: 1, size: 0.26, dur: 12000 });
        }
      };

      const finish = () => {
        if (finished) return; finished = true;
        squad.concat(walls).forEach(u => this.fxLayer.remove(u));
        cleared.forEach(([im, i, m]) => { im.setMatrixAt(i, m); im.instanceMatrix.needsUpdate = true; });
        this.anims = this.anims.filter(a => a !== anim);
        this.hidden.delete(T);
        // hand the camera back smoothly from where the cinematic ended
        this.cineBlend = { pos: this.camera.position.clone(), look: (this._lastLook || C).clone(), t0: performance.now() };
        this.cine = null; this.cineOn = false;
        this.camTarget = { ...saveCam }; this.yaw = saveYaw;
        ov.classList.remove('show'); document.body.classList.remove('cine'); banner.className = 'battle-banner';
        document.getElementById('battle-skip').onclick = null;
        G.sfx.duck(false);
        resolve();
      };
      document.getElementById('battle-skip').onclick = () => { G.sfx.click(); finish(); };

      const anim = {
        t: 0, dur: 1e9, done: () => {},
        update: () => {
          const now = performance.now();
          const dt = Math.min(0.3, (now - last) / 1000); last = now;
          t += dt;
          director(Math.min(dt, 0.1));
          // ground haze drifting over the battlefield
          if (t > APPROACH && Math.random() < dt * 3) this.puff('smoke', C.clone().addScaledVector(perp, rnd(-1.5, 1.5)).addScaledVector(dir, rnd(-2, 0.8)).add(V(0, 0.15, 0)), { size: rnd(0.6, 1), grow: 1.2, life: 6, vel: V(rnd(-0.05, 0.05), 0.02, rnd(-0.05, 0.05)), op: 0.28, tint: this.dustColor(), drag: 0.2, rise: 0.01 });
          for (const u of squad) {
            const ud = u.userData;
            if (ud.alive) {
              if (ud.side === 'D') u.position.set(ud.home.x, u.position.y, ud.home.z);
              // advance in bounds, then creep forward while fighting
              if (ud.side === 'A') {
                const e = Math.max(0, Math.min(1, (t - ud.delay) / APPROACH));
                const base = ud.start.clone().lerp(ud.home, 1 - Math.pow(1 - e, 2));
                const creep = Math.max(0, t - APPROACH) * 0.04 * (Math.sin(t * 1.3 + ud.delay * 9) > -0.2 ? 1 : 0);
                ud.creep = Math.max(ud.creep || 0, creep);
                u.position.copy(base).addScaledVector(dir, Math.min(0.35, ud.creep));
                if (e < 1 && !ud.air && CLS(ud.type) !== 'inf' && Math.random() < dt * 8) this.puff('smoke', u.position.clone().add(V(0, 0.03, 0)), { size: 0.14, grow: 2, life: 1.4, tint: this.dustColor(), op: 0.5, vel: V(0, 0.06, 0) });
                if (e >= 1 && ud.play && !ud.idled) { ud.idled = true; ud.play('idle'); }
              }
              if (ud.air) u.position.y = ud.home.y + Math.sin(t * 1.6 + ud.ph) * 0.05;
              // turn smoothly toward the current target
              if (ud.target && ud.target.parent) { const want = yawTo(u.position, ud.target.position); let d = want - ud.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); ud.yaw += d * Math.min(1, dt * 2.5); u.rotation.y = ud.yaw; }
              const rotor = u.getObjectByName('rotor'); if (rotor) rotor.rotation.y += dt * 30;
            } else if (ud.fall) {
              const k = Math.min(1, (t - ud.dieT) * 2.2);
              u.rotation.z = ud.fall.side * 1.45 * k * k;
              u.position.y = Math.max(C.y - 0.01, u.position.y - dt * 0.05);
            } else if (ud.crash) {
              u.position.y -= dt * 1.8; u.rotation.z += dt * 2.2; u.rotation.y += dt * 1.5;
              if (u.position.y < C.y + 0.05) { ud.crash = false; this.explode(u.position.clone().setY(C.y), 1.0); u.visible = false; }
            }
          }
          // ambient (non-lethal) fire at a realistic pace
          const fighting = t > APPROACH * 0.7 && t < total;
          if (fighting) for (const u of squad) {
            const ud = u.userData; if (!ud.alive) continue;
            ud.cool -= dt; if (ud.cool > 0) continue;
            const enemies = alive(ud.side === 'A' ? 'D' : 'A'); if (!enemies.length) continue;
            const tg = (ud.target && ud.target.userData.alive) ? ud.target : pickTarget(u, enemies);
            if (!tg) { ud.cool = 1; continue; }
            ud.target = tg;
            const kind = WEAPON[ud.type];
            const r = RELOAD[kind]; ud.cool = rnd(r[0], r[1]);
            const miss = V(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3));
            if (kind === 'bullet') {
              for (let b = 0; b < 4; b++) setTimeout(() => {
                if (finished || !ud.alive) return;
                const p = aimPt(tg).add(miss).add(V(rnd(-0.12, 0.12), 0, rnd(-0.12, 0.12)));
                p.y = Math.max(p.y, C.y + 0.02);
                this.fire({ from: muzzle(u), to: p, kind, tracer: b === 1, onHit: q => { if (Math.random() < 0.6) this.puff('smoke', q, { size: 0.05, grow: 2.5, life: 0.7, tint: this.dustColor(), op: 0.7, vel: V(0, 0.25, 0) }); if (CLS(tg.userData.type) === 'armor' && Math.random() < 0.3) this.sparks(q, 3, 1.4); } });
              }, b * 85);
            } else {
              const to = kind === 'flak' ? tg.position.clone().add(V(rnd(-0.3, 0.3), rnd(-0.05, 0.3), rnd(-0.3, 0.3))) : aimPt(tg).add(miss.multiplyScalar(1.4));
              if (kind !== 'flak') to.y = Math.max(C.y, Math.min(to.y, C.y + 0.05));
              this.fire({ from: muzzle(u), to, kind, onHit: p => kind === 'flak' ? (this.puff('smoke', p, { size: 0.16, grow: 1.6, life: 1.6, tint: 0x232323, op: 0.85 }), this.sprite(p, { color: '#ffb070', size: 0.15, life: 0.06, glow: 1.2 }), G.sfx.flak && G.sfx.flak()) : this.dirtImpact(p, kind === 'arty' ? 0.85 : 0.5) });
              if (kind === 'shell' || kind === 'arty') { ud.recoil = 0.05; }
            }
            if (ud.play && Math.random() < 0.4) { ud.play('shoot', true); setTimeout(() => ud.alive && ud.play('idle'), 800); }
            G.sfx.shot(ud.type);
            if (kind === 'arty' && Math.random() < 0.2) G.sfx.voice('fire_in_the_hole', ud.side !== playerSide);
          }
          for (const u of squad) { const ud = u.userData; if (ud.recoil > 0) { u.position.addScaledVector(V(Math.cos(ud.yaw), 0, -Math.sin(ud.yaw)), -ud.recoil); ud.recoil *= 0.5; if (ud.recoil < 0.003) ud.recoil = 0; } }
          // schedule the killing shots that match the battle result
          const round = Math.floor((t - APPROACH) / RD);
          if (t >= APPROACH && round > applied && round < res.rounds.length) {
            applied = round;
            const cur = { A: res.rounds[round].A, D: res.rounds[round].D };
            for (const side of ['A', 'D']) {
              const by = {};
              alive(side).forEach(u => (by[u.userData.type] = by[u.userData.type] || []).push(u));
              for (const ty in by) {
                const totalM = squad.filter(u => u.userData.side === side && u.userData.type === ty).length;
                const keepN = (cur[side][ty] || 0) <= 0 ? 0 : Math.max(1, Math.ceil(totalM * cur[side][ty] / initial[side][ty]));
                const l = by[ty];
                while (l.length > keepN) kills.push({ v: l.pop(), at: t + rnd(0.3, RD * 0.85) });
              }
            }
            if (round === 0 && walls.length && res.win) setTimeout(() => walls.forEach(w => { if (!finished && w.visible) { this.dirtImpact(w.position.clone(), 0.4); w.visible = false; } }), 900);
          }
          for (const k of kills) {
            if (k.done || t < k.at) continue;
            k.done = true;
            const v = k.v; if (!v.userData.alive) continue;
            const shooters = alive(v.userData.side === 'A' ? 'D' : 'A');
            const s = shooters.find(u => (PREF[u.userData.type] || []).includes(CLS(v.userData.type))) || shooters[0];
            if (!s) { kill(v); continue; }
            s.userData.target = v;
            let kind = WEAPON[s.userData.type];
            if (kind === 'flak') kind = 'missile';
            if (kind === 'bullet' && CLS(v.userData.type) !== 'inf') kind = 'missile'; // infantry anti-tank rocket
            G.sfx.shot(s.userData.type);
            this.fire({ from: muzzle(s), to: aimPt(v), kind, tracer: true, onHit: () => kill(v) });
          }
          if (t > total + 1 && !ended) {
            kills.forEach(k => { if (!k.done) { k.done = true; kill(k.v); } });
            ended = t;
            banner.textContent = opts.banner; banner.className = 'battle-banner show ' + (opts.good ? 'good' : 'bad');
            G.sfx.battleEnd(opts.good);
          }
          if (ended && res.win) for (const u of alive('A')) { const goal = C.clone().addScaledVector(u.position.clone().sub(C), 0.5); goal.y = u.position.y; u.position.lerp(goal, dt * 0.8); }
          if (ended && !res.win) for (const u of alive('A')) u.position.lerp(u.userData.start, dt * 0.5);
          if (ended && t - ended > 2.6) finish();
        }
      };
      this.anims.push(anim);
    });
  };
}
