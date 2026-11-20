/* ===== Neon Warfront – cinematic combat VFX & battle director =====
   Volumetric-looking fire/smoke (noise shader billboards), spark streaks, debris with smoke trails,
   scorch decals, burning wrecks, per-weapon projectiles, shot-driven casualties,
   multi-angle camera director with slow motion, and a lens post-process (chromatic aberration, vignette, grain). */
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';

const G = window.G;
const R3 = G.__r3d;
if (R3) install(R3);

function install({ THREE, makeUnit, mats, geo, mesh, TEX, S, topY, Renderer3D }) {
  const P = Renderer3D.prototype;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------------- puff shader (fire / smoke billboards) ---------------- */
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
      float n = fbm(vec3(p*2.1 + uSeed, uSeed*3.1 + uAge*1.6));
      float edge = r + (n-0.5)*0.75;
      float body = 1.0 - smoothstep(0.42, 0.98, edge);
      if (uMode < 0.5) {
        float heat = clamp(body * (1.05 - uLife*1.2) * (0.5 + n), 0.0, 1.0);
        vec3 c = mix(vec3(0.22,0.05,0.02), vec3(1.0,0.3,0.04), smoothstep(0.04,0.32,heat));
        c = mix(c, vec3(1.0,0.72,0.22), smoothstep(0.32,0.62,heat));
        c = mix(c, vec3(1.0,0.96,0.82), smoothstep(0.62,0.95,heat));
        float a = smoothstep(0.02,0.18,heat) * uOpacity;
        gl_FragColor = vec4(c*(0.6+heat*1.1)*a, a);
      } else {
        float d = body * (0.6+0.4*n) * (1.0 - smoothstep(0.5,1.0,uLife)) * smoothstep(0.0,0.08,uLife+0.02);
        vec3 c = uTint*(0.5+0.65*n);
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

  /* ---------------- textures ---------------- */
  const scorchTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 6, 64, 64, 62); r.addColorStop(0, 'rgba(10,8,8,.95)'); r.addColorStop(0.55, 'rgba(25,18,15,.7)'); r.addColorStop(1, 'rgba(30,20,15,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`; const a = Math.random() * 6.28, d = Math.random() * 50; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 6, 0, 6.28); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  /* ---------------- FX system on the renderer ---------------- */
  P.vfxInit = function () {
    if (this.vfx && this.vfx.scene === this.scene) return;
    const N = 700;
    const pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lines.frustumCulled = false; lines.renderOrder = 9;
    this.scene.add(lines);
    this.vfx = {
      scene: this.scene, puffs: [], sparks: { lines, pos, col, p: [], N }, debris: [], decals: [], emitters: [], projectiles: [],
      timeScale: 1, slowUntil: 0
    };
  };
  P.puff = function (kind, at, o = {}) {
    this.vfxInit();
    const low = this.quality === 'low';
    if (this.vfx.puffs.length > (low ? 110 : 260) || (low && kind === 'smoke' && Math.random() < 0.4)) return null;
    const m = puffMesh(kind);
    m.position.copy(at);
    const u = m.material.uniforms;
    u.uSeed.value = Math.random() * 50; u.uRot.value = Math.random() * 6.28; u.uOpacity.value = o.op ?? 1;
    if (o.tint) u.uTint.value.set(o.tint); else u.uTint.value.set(kind === 'smoke' ? 0x2b2727 : 0xffffff);
    m.userData.p = { op0: o.op ?? 1, vel: o.vel || V(rnd(-0.1, 0.1), kind === 'fire' ? rnd(0.3, 0.8) : rnd(0.2, 0.5), rnd(-0.1, 0.1)), size: o.size || 0.5, grow: o.grow ?? 1.2, life: o.life || (kind === 'fire' ? 0.7 : 2.4), age: 0, drag: o.drag ?? 1.4, spin: rnd(-0.6, 0.6) };
    this.fxLayer.add(m); this.vfx.puffs.push(m);
    return m;
  };
  P.sparks = function (at, n, speed = 4, color = [1, 0.6, 0.2]) {
    this.vfxInit();
    const s = this.vfx.sparks;
    for (let i = 0; i < n; i++) {
      if (s.p.length >= s.N) s.p.shift();
      const a = Math.random() * 6.28, el = rnd(0.15, 1.3);
      s.p.push({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * Math.cos(el) * speed * rnd(0.3, 1), vy: Math.sin(el) * speed * rnd(0.4, 1.1), vz: Math.sin(a) * Math.cos(el) * speed * rnd(0.3, 1), life: rnd(0.3, 0.8), age: 0, c: color });
    }
  };
  P.decal = function (at, size = 1) {
    this.vfxInit();
    const m = new THREE.Mesh(geo('decalQ', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(at.x, at.y + 0.015, at.z); m.rotation.y = Math.random() * 6.28; m.scale.setScalar(size);
    m.renderOrder = 3; m.userData.age = 0;
    this.fxLayer.add(m); this.vfx.decals.push(m);
    if (this.vfx.decals.length > 40) { const d = this.vfx.decals.shift(); this.fxLayer.remove(d); d.material.dispose(); }
  };
  P.emitter = function (obj, o) { this.vfxInit(); this.vfx.emitters.push({ obj, until: performance.now() + (o.dur || 6000), fire: o.fire ?? 0.5, smoke: o.smoke ?? 1, off: o.off || V(0, 0.15, 0), size: o.size || 0.35, acc: 0 }); };

  // big cinematic explosion (also used for map skirmishes)
  P.explode = function (pos, big = 1, o = {}) {
    this.vfxInit();
    const at = pos.clone();
    // flash + light
    this.sprite(at.clone().add(V(0, 0.2 * big, 0)), { color: '#ffe2b0', size: 0.8 * big, life: 0.12, grow: 1.6, glow: 1.6 });
    this.flash(at, 4 * big, 0xffb060);
    // fireballs
    const nf = Math.round(3 + 3 * big);
    for (let i = 0; i < nf; i++) this.puff('fire', at.clone().add(V(rnd(-0.18, 0.18) * big, rnd(0.05, 0.3) * big, rnd(-0.18, 0.18) * big)), { size: rnd(0.32, 0.55) * big, grow: 1.4, life: rnd(0.4, 0.75), vel: V(rnd(-0.6, 0.6) * big, rnd(0.6, 1.6) * big, rnd(-0.6, 0.6) * big), drag: 2.4 });
    // smoke column + ground dust ring
    for (let i = 0; i < Math.round(3 + 3 * big); i++) this.puff('smoke', at.clone().add(V(rnd(-0.2, 0.2) * big, rnd(0.2, 0.6) * big, rnd(-0.2, 0.2) * big)), { size: rnd(0.35, 0.6) * big, grow: 1.5, life: rnd(2.2, 3.6) * (0.7 + big * 0.4), vel: V(rnd(-0.15, 0.15), rnd(0.35, 0.8) * big, rnd(-0.15, 0.15)), op: 0.85 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; this.puff('smoke', at.clone().add(V(0, 0.05, 0)), { size: 0.35 * big, grow: 2.2, life: 1.4, vel: V(Math.cos(a) * 1.6 * big, 0.08, Math.sin(a) * 1.6 * big), drag: 3, tint: o.dust || 0x6b5a48, op: 0.7 }); }
    // sparks + debris with smoke trails
    this.sparks(at.clone().add(V(0, 0.15, 0)), Math.round(20 * big), 5 * big);
    for (let i = 0; i < Math.round(3.5 * big); i++) {
      const d = new THREE.Mesh(geo('chunk', () => new THREE.TetrahedronGeometry(0.035, 0)), mats('#222').dark);
      d.position.copy(at).add(V(0, 0.15, 0)); d.castShadow = true;
      d.userData = { v: V(rnd(-2.5, 2.5) * big, rnd(2, 4.5) * big, rnd(-2.5, 2.5) * big), floor: at.y, age: 0, life: rnd(1.4, 2.4), trail: Math.random() < 0.6 };
      this.fxLayer.add(d); this.vfx.debris.push(d);
    }
    // shockwave ring
    const ring = new THREE.Mesh(geo('ring', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: TEX.ring, color: new THREE.Color('#ffe2b0').multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    ring.position.copy(at).add(V(0, 0.05, 0)); ring.userData = { ring: true, life: 0.45, t: 0, size: 3.2 * big };
    this.fxLayer.add(ring); this.particles.push(ring);
    if (big >= 0.6) this.decal(at, 0.9 * big + 0.4);
    this.shake = Math.min(0.35, this.shake + 0.08 * big);
    if (this.cinePass && big >= 0.6) this.cinePass.uniforms.uAmt.value = Math.min(0.007, this.cinePass.uniforms.uAmt.value + 0.0025 * big);
    if (!o.silent) G.sfx.boom(Math.min(1.2, 0.45 * big + 0.2));
  };

  P.vfxUpdate = function (dtReal) {
    if (!this.vfx || this.vfx.scene !== this.scene) return;
    const now = performance.now();
    const ts = now < this.vfx.slowUntil ? 0.3 : 1;
    this.vfx.timeScale += (ts - this.vfx.timeScale) * Math.min(1, dtReal * 8);
    const dt = dtReal * this.vfx.timeScale;
    const cam = this.camera;
    // puffs
    const keep = [];
    for (const m of this.vfx.puffs) {
      const p = m.userData.p; p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { this.fxLayer.remove(m); m.visible = false; pool[m.userData.kind].push(m); continue; }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      if (m.userData.kind === 'smoke') p.vel.y += 0.15 * dt;
      m.position.addScaledVector(p.vel, dt);
      const u = m.material.uniforms;
      const cd = m.position.distanceTo(cam.position); u.uOpacity.value = (p.op0 ?? 1) * Math.min(1, Math.max(0, (cd - 0.8) / 1.6));
      u.uLife.value = k; u.uAge.value = p.age; u.uSize.value = p.size * (1 + p.grow * Math.sqrt(k)); u.uRot.value += p.spin * dt;
      keep.push(m);
    }
    this.vfx.puffs = keep;
    // sparks
    const s = this.vfx.sparks; let n = 0;
    s.p = s.p.filter(q => (q.age += dt) < q.life);
    for (const q of s.p) {
      q.vy -= 9 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = 1 - q.age / q.life, L = 0.035;
      s.pos.set([q.x, q.y, q.z, q.x - q.vx * L, q.y - q.vy * L, q.z - q.vz * L], n * 6);
      const b = 3 * k; s.col.set([q.c[0] * b, q.c[1] * b, q.c[2] * b, q.c[0] * b * 0.3, q.c[1] * b * 0.2, 0], n * 6);
      n++;
    }
    s.lines.geometry.setDrawRange(0, n * 2);
    s.lines.geometry.attributes.position.needsUpdate = true; s.lines.geometry.attributes.color.needsUpdate = true;
    // debris
    this.vfx.debris = this.vfx.debris.filter(d => {
      const u = d.userData; u.age += dt;
      if (u.age > u.life) { this.fxLayer.remove(d); return false; }
      u.v.y -= 9.5 * dt; d.position.addScaledVector(u.v, dt); d.rotation.x += dt * 9; d.rotation.y += dt * 7;
      if (d.position.y < u.floor) { d.position.y = u.floor; u.v.multiplyScalar(0.35); u.v.y = Math.abs(u.v.y) * 0.4; }
      if (u.trail && Math.random() < 0.5) this.puff('smoke', d.position.clone(), { size: 0.12, grow: 2, life: 0.9, vel: V(0, 0.1, 0), op: 0.6 });
      return true;
    });
    // decals fade
    for (const d of this.vfx.decals) { d.userData.age += dtReal; if (d.userData.age > 25) d.material.opacity = Math.max(0, 1 - (d.userData.age - 25) / 5); }
    // emitters (burning wrecks)
    this.vfx.emitters = this.vfx.emitters.filter(e => {
      if (now > e.until || !e.obj.parent) return false;
      e.acc += dt;
      while (e.acc > 0.06) {
        e.acc -= 0.06;
        const at = e.obj.getWorldPosition(V()).add(e.off);
        if (Math.random() < e.fire) this.puff('fire', at.clone().add(V(rnd(-0.06, 0.06), 0, rnd(-0.06, 0.06))), { size: e.size * rnd(0.6, 1), grow: 0.8, life: rnd(0.35, 0.6), vel: V(rnd(-0.05, 0.05), rnd(0.6, 1), rnd(-0.05, 0.05)), drag: 0.6 });
        if (Math.random() < e.smoke * 0.6) this.puff('smoke', at.clone().add(V(0, 0.15, 0)), { size: e.size * 1.1, grow: 2, life: rnd(2.5, 3.5), vel: V(rnd(-0.08, 0.08), rnd(0.45, 0.7), rnd(-0.08, 0.08)), drag: 0.4, op: 0.75 });
      }
      return true;
    });
    // projectiles
    this.vfx.projectiles = this.vfx.projectiles.filter(pr => pr.update(dt));
    // lens pass decay
    if (this.cinePass) {
      const u = this.cinePass.uniforms;
      u.uAmt.value = Math.max(this.cineOn ? 0.0008 : 0, u.uAmt.value - dtReal * 0.02);
      u.uVig.value += ((this.cineOn ? 1 : 0) - u.uVig.value) * Math.min(1, dtReal * 3);
      u.uTime.value = now / 1000;
      this.cinePass.enabled = u.uVig.value > 0.01 || u.uAmt.value > 0.0001;
    }
  };
  const origUP = P.updateParticles;
  P.updateParticles = function (dt) { origUP.call(this, dt); this.vfxUpdate(dt); };

  /* ---------------- cinematic camera ---------------- */
  const origUC = P.updateCamera;
  P.updateCamera = function () {
    origUC.call(this);
    const c = this.cine;
    if (!c) return;
    const sh = this.shake;
    this.camera.position.set(c.pos.x + (Math.random() - 0.5) * sh, c.pos.y + (Math.random() - 0.5) * sh, c.pos.z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(c.look);
    this.camera.updateMatrixWorld();
  };
  P.ensureCinePass = function () {
    if (this.cinePass || !this.composer) return;
    this.cinePass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uAmt: { value: 0 }, uVig: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uVig; uniform float uTime; varying vec2 vUv;
        float rn(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }
        void main(){ vec2 d = vUv-0.5; float r2 = dot(d,d); vec2 off = d*uAmt*(0.6+r2*5.0);
          vec4 c = vec4(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b, 1.0);
          c.rgb *= 1.0 - uVig*0.55*smoothstep(0.05, 0.5, r2*2.0);
          c.rgb = mix(c.rgb, c.rgb*vec3(1.06,1.0,0.92), uVig*0.5);
          c.rgb += (rn(vUv*vec2(1733.0,977.0)+fract(uTime*7.0)) - 0.5)*0.035*uVig;
          gl_FragColor = c; }`
    });
    this.cinePass.enabled = false;
    this.composer.insertPass(this.cinePass, this.composer.passes.length - 1);
  };

  /* ---------------- projectiles ---------------- */
  const boltMat = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(5), toneMapped: false });
  const BOLT = { bullet: boltMat('#fff1b8'), shell: boltMat('#ffd27a'), flak: boltMat('#ffe9a0') };
  P.fire = function (o) {
    // o: {from, to, kind:'bullet'|'shell'|'arty'|'missile'|'flak', onHit}
    this.vfxInit();
    const from = o.from.clone(), to = o.to.clone();
    const dist = from.distanceTo(to);
    const dur = { bullet: 0.09 + dist * 0.025, shell: 0.16 + dist * 0.04, arty: 0.95, missile: 0.5 + dist * 0.08, flak: 0.25 }[o.kind];
    let obj;
    if (o.kind === 'missile') {
      obj = new THREE.Group();
      obj.add(mesh(geo('msl', () => new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6).rotateZ(Math.PI / 2)), mats('#666').mid));
      obj.add(new THREE.Mesh(geo('mflame', () => new THREE.SphereGeometry(0.035, 8, 6)), boltMat('#ff9a3c')));
      obj.children[1].position.x = -0.09;
    } else {
      obj = new THREE.Mesh(geo('bolt2', () => new THREE.CapsuleGeometry(0.012, 0.22, 2, 6).rotateZ(Math.PI / 2)), o.kind === 'bullet' ? BOLT.bullet : BOLT.shell);
      if (o.kind !== 'bullet') obj.scale.set(1.2, 2.2, 2.2);
    }
    obj.position.copy(from);
    this.fxLayer.add(obj);
    const ctrl = from.clone().lerp(to, 0.5).add(V(rnd(-0.5, 0.5), o.kind === 'arty' ? 2.6 + dist * 0.3 : o.kind === 'missile' ? rnd(0.3, 0.9) : 0, rnd(-0.5, 0.5)));
    const bez = t => { const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; return V(a * from.x + b * ctrl.x + c * to.x, a * from.y + b * ctrl.y + c * to.y, a * from.z + b * ctrl.z + c * to.z); };
    const curved = o.kind === 'arty' || o.kind === 'missile';
    let t = 0, prev = from.clone(), whistled = false;
    this.vfx.projectiles.push({
      update: (dt) => {
        t += dt / dur;
        const p = t >= 1 ? to : curved ? bez(t) : from.clone().lerp(to, t);
        obj.position.copy(p);
        const dir = p.clone().sub(prev);
        if (dir.lengthSq() > 1e-8) { obj.lookAt(p.clone().add(dir)); obj.rotateY(-Math.PI / 2); }
        prev.copy(p);
        if (o.kind === 'missile' || o.kind === 'arty' || o.kind === 'shell') if (Math.random() < (o.kind === 'shell' ? 0.4 : 0.9)) this.puff('smoke', p.clone(), { size: o.kind === 'missile' ? 0.13 : 0.09, grow: 2.5, life: o.kind === 'missile' ? 1.4 : 0.8, vel: V(0, 0.05, 0), op: 0.65, tint: 0xb8b0a8 });
        if (o.kind === 'missile' && Math.random() < 0.7) this.puff('fire', p.clone(), { size: 0.1, grow: 0.5, life: 0.12, vel: V() });
        if (o.kind === 'arty' && !whistled && t > 0.45) { whistled = true; G.sfx.whistle && G.sfx.whistle(); }
        if (t >= 1) { this.fxLayer.remove(obj); o.onHit && o.onHit(to); return false; }
        return true;
      }
    });
    // muzzle
    const mz = { bullet: 0.18, shell: 0.55, arty: 0.7, missile: 0.3, flak: 0.3 }[o.kind];
    this.sprite(from, { color: '#ffd090', size: mz * 0.8, life: 0.06, glow: 1.4 });
    if (o.kind !== 'bullet') { this.flash(from, o.kind === 'shell' || o.kind === 'arty' ? 2.5 : 1.2, 0xffc070); this.puff('smoke', from.clone(), { size: mz * 0.6, grow: 2.5, life: 1.2, vel: V(0, 0.2, 0), op: 0.55, tint: 0x9a948c }); }
  };

  /* ---------------- battle director ---------------- */
  const CLS = t => G.UNITS[t].cls;
  const WEAPON = { inf: 'bullet', commando: 'bullet', tank: 'shell', art: 'arty', aa: 'flak', heli: 'missile', jet: 'missile', mech: 'shell' };
  const PREF = { inf: ['inf', 'art', 'aa'], commando: ['inf', 'art', 'aa'], tank: ['armor', 'inf', 'aa', 'art'], art: ['armor', 'inf', 'aa', 'art'], aa: ['air'], heli: ['armor', 'art', 'aa'], jet: ['armor', 'air', 'art'], mech: ['armor', 'air', 'inf'] };

  P.battle = function (opts) {
    return new Promise(resolve => {
      this.ensureCinePass(); this.vfxInit();
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
      this.camTarget = { x: C.x / S, y: C.z / S + 10, z: 3.1 };
      this.cineOn = true; this._nextSlow = 0;
      const cleared = [], zero = new THREE.Matrix4().makeScale(0, 0, 0), tmp = new THREE.Matrix4();
      if (this.featGroup) this.featGroup.traverse(im => {
        if (!im.isInstancedMesh || !im.userData.pts) return;
        im.userData.pts.forEach((p, i) => { const dx = p.x - C.x, dz = p.z - C.z; if (dx * dx + dz * dz < 4.4 || ((p.x - src.x) ** 2 + (p.z - src.z) ** 2 < 1.6)) { im.getMatrixAt(i, tmp); cleared.push([im, i, tmp.clone()]); im.setMatrixAt(i, zero); } });
        im.instanceMatrix.needsUpdate = true;
      });
      G.sfx.duck(true);

      // ---- spawn squads ----
      const squad = [];
      const spawn = (units, side, color) => {
        const types = G.UNIT_ORDER.filter(k => units[k] > 0);
        const per = Math.max(1, Math.floor(10 / Math.max(1, types.length)));
        const list = [];
        types.forEach(t => { const n = Math.min(units[t], per, t === 'inf' ? 3 : 4); for (let i = 0; i < n; i++) list.push(t); });
        list.forEach((t, idx) => {
          const u = makeUnit(t, color);
          u.scale.multiplyScalar(1.25);
          const row = Math.floor(idx / 4), colI = idx % 4;
          const base = side === 'A' ? C.clone().addScaledVector(dir, -1.7 - row * 0.62) : C.clone().addScaledVector(dir, 0.25 + row * 0.6);
          base.addScaledVector(perp, (colI - 1.5) * 0.62 + rnd(-0.06, 0.06));
          base.y = (side === 'A' ? G.lerp(src.y, C.y, 0.75) : C.y) + (u.userData.air || 0) * 0.8;
          const start = side === 'A' ? base.clone().addScaledVector(dir, -1.6) : base.clone();
          u.position.copy(start);
          u.rotation.y = side === 'A' ? Math.atan2(-dir.z, dir.x) : Math.atan2(dir.z, -dir.x);
          Object.assign(u.userData, { side, home: base, start, alive: true, type: t, cool: rnd(0.1, 0.8) });
          if (side === 'A' && u.userData.play) u.userData.play('move');
          this.fxLayer.add(u); squad.push(u);
        });
      };
      spawn(opts.att.units, 'A', opts.att.color);
      spawn(opts.def.units, 'D', opts.def.color);
      const walls = [];
      for (let l = 0; l < (opts.fort || 0); l++) for (let k = -2; k <= 2; k++) {
        const w = mesh(geo('wall', () => new THREE.BoxGeometry(0.12, 0.18, 0.38)), mats('#7a7466').mid);
        w.position.copy(C).addScaledVector(dir, -0.45 - l * 0.2).addScaledVector(perp, k * 0.42); w.position.y = C.y + 0.09;
        w.rotation.y = Math.atan2(-dir.z, dir.x); this.fxLayer.add(w); walls.push(w);
      }
      if (playerSide === 'A') { G.sfx.voice('go_go_go'); setTimeout(() => G.sfx.voice('target_engaged', true), 1700); }
      else { G.sfx.voice('look_out'); setTimeout(() => G.sfx.voice('cover_me'), 1700); }

      const res = opts.result, initial = { A: G.cloneU(opts.att.units), D: G.cloneU(opts.def.units) };
      const APPROACH = 1.4, RD = 1.6;
      const total = APPROACH + res.rounds.length * RD;
      let t = 0, lastWall = performance.now(), ended = 0, finished = false, applied = -1;
      const kills = [];
      const alive = side => squad.filter(u => u.userData.alive && u.userData.side === side);
      const muzzle = u => u.position.clone().add(V(0, u.userData.air ? 0 : (CLS(u.userData.type) === 'inf' ? 0.22 : 0.3), 0)).addScaledVector(dir, u.userData.side === 'A' ? 0.15 : -0.15);
      const aimPt = u => u.position.clone().add(V(rnd(-0.08, 0.08), u.userData.air ? 0 : 0.15, rnd(-0.08, 0.08)));
      const pickTarget = (shooter, pool) => {
        const pref = PREF[shooter.userData.type] || [];
        for (const c of pref) { const l = pool.filter(u => CLS(u.userData.type) === c); if (l.length) return l[Math.floor(Math.random() * l.length)]; }
        return shooter.userData.type === 'aa' ? null : pool[Math.floor(Math.random() * pool.length)];
      };

      // ---- camera director ----
      const cine = this.cine = { pos: C.clone().add(V(0, 6, 6)), look: C.clone() };
      let shot = 'establish', shotT = 0, focus = null, focusUntil = 0;
      const want = { pos: V(), look: V() };
      const director = (dt) => {
        shotT += dt;
        if (focus && t < focusUntil) {
          want.pos.copy(focus).addScaledVector(perp, 2.4).addScaledVector(dir, -1.4).add(V(0, 1.5, 0));
          want.look.copy(focus).add(V(0, 0.2, 0));
        } else {
          focus = null;
          if (t > APPROACH && shotT > 2.4) { shot = shot === 'side' ? 'track' : shot === 'track' ? 'low' : 'side'; shotT = 0; }
          const ang = t * 0.25;
          if (shot === 'establish') { want.pos.copy(C).addScaledVector(dir, -5).addScaledVector(perp, 3.4 * Math.cos(ang)).add(V(0, 3.6, 0)); want.look.copy(C).addScaledVector(dir, -0.6); }
          else if (shot === 'track') { want.pos.copy(C).addScaledVector(dir, -4.6).addScaledVector(perp, 1.6).add(V(0, 2.4, 0)); want.look.copy(C).addScaledVector(dir, 0.2).add(V(0, 0.2, 0)); }
          else if (shot === 'side') { want.pos.copy(C).addScaledVector(perp, -4.4).addScaledVector(dir, -0.6 + Math.sin(ang) * 0.5).add(V(0, 2.5, 0)); want.look.copy(C).addScaledVector(dir, -0.5); }
          else { want.pos.copy(C).addScaledVector(dir, 3.0).addScaledVector(perp, 2.2).add(V(0, 1.6, 0)); want.look.copy(C).addScaledVector(dir, -0.9).add(V(0, 0.25, 0)); }
        }
        want.pos.y = Math.max(want.pos.y, C.y + 1.2);
        const k = 1 - Math.pow(0.04, dt);
        cine.pos.lerp(want.pos, k); cine.look.lerp(want.look, k);
      };
      const slowmo = (at) => {
        if (t < (this._nextSlow || 0)) return;
        this._nextSlow = t + 3.5;
        this.vfx.slowUntil = performance.now() + 900;
        focus = at.clone(); focusUntil = t + 1.1;
      };

      // ---- deaths ----
      const kill = (u, big) => {
        if (!u.userData.alive) return;
        u.userData.alive = false; u.userData.dieT = t;
        const c = CLS(u.userData.type), at = u.position.clone();
        const fr = u.getObjectByName('fring'); if (fr) fr.visible = false;
        if (c === 'inf') {
          this.explode(at, 0.45, { dust: 0x7a6a55 });
          G.sfx.scream();
          u.userData.fall = { vx: rnd(-0.6, 0.6) - (u.userData.side === 'A' ? 1 : -1) * dir.x * 1.2, vy: 1.6, vz: rnd(-0.6, 0.6), rot: rnd(-6, 6) };
        } else if (c === 'air') {
          this.explode(at, 0.7, { silent: false });
          this.emitter(u, { fire: 0.8, smoke: 1, size: 0.25, dur: 3000 });
          u.userData.crash = true;
        } else {
          const vehicleBig = u.userData.type === 'mech' ? 1.6 : 1.25;
          this.explode(at, vehicleBig);
          setTimeout(() => !finished && this.explode(at.clone().add(V(rnd(-0.1, 0.1), 0.1, rnd(-0.1, 0.1))), 0.6), 280);
          const tur = u.getObjectByName('turret');
          if (tur) { const wp = tur.getWorldPosition(V()); u.remove(tur); tur.position.copy(wp); tur.scale.multiplyScalar(1.45); this.fxLayer.add(tur); tur.userData = { v: V(rnd(-1, 1), 4, rnd(-1, 1)), floor: at.y, age: 0, life: 2.5 }; this.vfx.debris.push(tur); }
          if (!(u.userData.play && u.userData.play('die', true))) u.traverse(o => { if (o.isMesh) o.material = mats('#000').burnt; });
          this.emitter(u, { fire: 0.7, smoke: 1, size: 0.32, dur: 9000 });
          if (big) slowmo(at);
        }
      };

      const finish = () => {
        if (finished) return; finished = true;
        squad.concat(walls).forEach(u => this.fxLayer.remove(u));
        cleared.forEach(([im, i, m]) => { im.setMatrixAt(i, m); im.instanceMatrix.needsUpdate = true; });
        this.anims = this.anims.filter(a => a !== anim);
        this.hidden.delete(T);
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
          const dtReal = Math.min(0.3, (now - lastWall) / 1000); lastWall = now;
          const dt = dtReal * (this.vfx ? this.vfx.timeScale : 1);
          t += dt;
          director(dtReal);
          // movement & idle
          for (const u of squad) {
            const ud = u.userData;
            if (ud.alive) {
              if (ud.side === 'A' && t < APPROACH + 0.2) { const e = Math.min(1, t / APPROACH); u.position.lerpVectors(ud.start, ud.home, 1 - Math.pow(1 - e, 3)); if (CLS(ud.type) !== 'inf' && CLS(ud.type) !== 'air' && Math.random() < 0.3) this.puff('smoke', u.position.clone().add(V(0, 0.04, 0)), { size: 0.18, grow: 2, life: 0.9, tint: 0x9c8a70, op: 0.5, vel: V(0, 0.1, 0) }); }
              else if (ud.side === 'A' && ud.play && !ud.idled) { ud.idled = true; ud.play('idle'); }
              if (ud.air) u.position.y = ud.home.y + Math.sin(t * 2 + ud.ph) * 0.07;
              const rotor = u.getObjectByName('rotor'); if (rotor) rotor.rotation.y += dt * 30;
              if (ud.recoil > 0) { ud.recoil -= dt * 4; }
            } else if (ud.fall) {
              const f = ud.fall; f.vy -= 7 * dt;
              u.position.x += f.vx * dt; u.position.y = Math.max(C.y - 0.02, u.position.y + f.vy * dt); u.position.z += f.vz * dt;
              u.rotation.x = Math.min(1.5, u.rotation.x + Math.abs(f.rot) * dt * 0.4);
              if (u.position.y <= C.y) { f.vx *= 0.8; f.vz *= 0.8; }
            } else if (ud.crash) {
              u.position.y -= dt * 2.4; u.rotation.z += dt * 4; u.rotation.y += dt * 3;
              if (u.position.y < C.y + 0.05) { ud.crash = false; this.explode(u.position.clone().setY(C.y), 1.2); slowmo(u.position.clone()); u.visible = false; }
            } else if (!ud.animDeath && CLS(ud.type) !== 'inf') { u.rotation.z = Math.min(0.12, u.rotation.z + dt * 0.3); }
          }
          // firing (ambient, non-lethal)
          const fighting = t > APPROACH * 0.6 && t < total;
          if (fighting) for (const u of squad) {
            const ud = u.userData; if (!ud.alive) continue;
            ud.cool -= dt; if (ud.cool > 0) continue;
            const enemies = alive(ud.side === 'A' ? 'D' : 'A'); if (!enemies.length) continue;
            const tg = pickTarget(u, enemies); if (!tg) { ud.cool = 0.5; continue; }
            const kind = WEAPON[ud.type];
            ud.cool = { bullet: rnd(0.12, 0.35), shell: rnd(1.1, 1.8), arty: rnd(1.6, 2.4), missile: rnd(1.2, 2), flak: rnd(0.25, 0.5) }[kind];
            const miss = V(rnd(-0.35, 0.35), 0, rnd(-0.35, 0.35));
            const to = kind === 'flak' ? tg.position.clone().add(V(rnd(-0.3, 0.3), rnd(-0.1, 0.3), rnd(-0.3, 0.3))) : aimPt(tg).add(miss);
            if (kind === 'bullet') { for (let b = 0; b < 3; b++) setTimeout(() => !finished && this.fire({ from: muzzle(u), to: to.clone().add(V(rnd(-0.1, 0.1), 0, rnd(-0.1, 0.1))), kind, onHit: p => { this.puff('smoke', p, { size: 0.08, grow: 2, life: 0.5, tint: 0x8a7a64, op: 0.6 }); if (Math.random() < 0.3) this.sparks(p, 3, 1.5); } }), b * 60); }
            else this.fire({ from: muzzle(u), to, kind, onHit: p => kind === 'flak' ? (this.puff('smoke', p, { size: 0.22, grow: 1.4, life: 1.2, tint: 0x222222 }), this.sparks(p, 6, 2), G.sfx.flak && G.sfx.flak()) : this.explode(p.setY(Math.max(p.y, C.y)), kind === 'arty' ? 0.75 : 0.5) });
            if (ud.play && Math.random() < 0.4) { ud.play('shoot', true); setTimeout(() => ud.alive && ud.play('idle'), 700); }
            if (kind === 'shell' || kind === 'arty') u.position.addScaledVector(dir, ud.side === 'A' ? -0.04 : 0.04);
            G.sfx.shot(ud.type);
            if (kind === 'arty' && Math.random() < 0.2) G.sfx.voice('fire_in_the_hole', ud.side !== playerSide);
          }
          // schedule lethal shots for this round
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
                while (l.length > keepN) kills.push({ v: l.pop(), at: t + rnd(0.35, RD * 0.8), big: true });
              }
            }
            if (round === 0 && walls.length && res.win) setTimeout(() => walls.forEach(w => { if (!finished) { this.explode(w.position.clone(), 0.4); w.visible = false; } }), 700);
          }
          for (const k of kills) {
            if (k.done || t < k.at) continue;
            k.done = true;
            const v = k.v; if (!v.userData.alive) continue;
            const shooters = alive(v.userData.side === 'A' ? 'D' : 'A');
            const s = shooters.find(u => (PREF[u.userData.type] || []).includes(CLS(v.userData.type))) || shooters[0];
            if (!s) { kill(v, k.big); continue; }
            const kind = CLS(v.userData.type) === 'inf' && WEAPON[s.userData.type] === 'bullet' ? 'shell' : WEAPON[s.userData.type] === 'flak' ? 'missile' : WEAPON[s.userData.type];
            G.sfx.shot(s.userData.type);
            this.fire({ from: muzzle(s), to: aimPt(v), kind, onHit: () => kill(v, k.big) });
          }
          // ending
          if (t > total + 0.8 && !ended) {
            kills.forEach(k => { if (!k.done) { k.done = true; kill(k.v, false); } });
            ended = t;
            banner.textContent = opts.banner; banner.className = 'battle-banner show ' + (opts.good ? 'good' : 'bad');
            G.sfx.battleEnd(opts.good);
            focus = null; shot = 'establish'; shotT = 0;
          }
          if (ended && res.win) for (const u of alive('A')) { const goal = C.clone().addScaledVector(u.position.clone().sub(C), 0.4); goal.y = u.position.y; u.position.lerp(goal, dt * 1.5); }
          if (ended && !res.win) for (const u of alive('A')) u.position.lerp(u.userData.start, dt * 0.8);
          if (ended && t - ended > 2.2) finish();
        }
      };
      this.anims.push(anim);
    });
  };
}
