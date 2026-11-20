/* ===== Neon Warfront – real-time 3D renderer (Three.js / WebGL) ===== */
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/addons/utils/SkeletonUtils.js';

const G = window.G;
const S = 1 / 26;           // map px -> world units (hex radius = 1)
const SQ = G.HEX.SQ;
const FOV = 36;
const topY = hx => 0.28 + hx.h * 0.05;
const col = (hex, mul = 1) => new THREE.Color(hex).multiplyScalar(mul);

/* ---------------- shared textures ---------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX = {};
function textures() {
  if (TEX.glow) return TEX;
  TEX.glow = canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  TEX.smoke = canvasTex(128, 128, g => {
    for (let i = 0; i < 18; i++) {
      const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, rr = 22 + Math.random() * 26;
      const r = g.createRadialGradient(x, y, 0, x, y, rr);
      r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    }
  });
  TEX.windows = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#1b1d2a'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h - 2; y += 8) for (let x = 4; x < w - 2; x += 8) {
      const r = Math.random();
      g.fillStyle = r < 0.42 ? (Math.random() < 0.5 ? '#ffd27a' : '#fff1d0') : r < 0.5 ? '#ff6ab8' : r < 0.56 ? '#7fe3ff' : '#2a2d3d';
      g.fillRect(x, y, 4, 5);
    }
  });
  TEX.windows.wrapS = TEX.windows.wrapT = THREE.RepeatWrapping;
  TEX.dash = canvasTex(64, 8, g => {
    g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, 64, 8);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 36, 8);
  });
  TEX.dash.wrapS = THREE.RepeatWrapping;
  TEX.ring = canvasTex(128, 128, g => {
    const r = g.createRadialGradient(64, 64, 40, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  return TEX;
}

/* ---------------- unit models (procedural low-poly) ---------------- */
const MATS = {};
function mats(color) {
  if (MATS[color]) return MATS[color];
  const c = new THREE.Color(color);
  return (MATS[color] = {
    body: new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.38 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24272f, metalness: 0.6, roughness: 0.5 }),
    mid: new THREE.MeshStandardMaterial({ color: 0x4a4f5c, metalness: 0.5, roughness: 0.45 }),
    glow: new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.6), toneMapped: false }),
    light: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(3), toneMapped: false }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc98d68, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fe3ff, emissive: 0x1b4f70, metalness: 0.9, roughness: 0.08 }),
    burnt: new THREE.MeshStandardMaterial({ color: 0x151213, roughness: 1 })
  });
}
const GEO = {};
const geo = (k, f) => GEO[k] || (GEO[k] = f());
function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  return o;
}
function soldier(M, x, z, elite) {
  const g = new THREE.Group();
  g.add(mesh(geo('cap', () => new THREE.CapsuleGeometry(0.05, 0.11, 3, 8)), M.body, 0, 0.13, 0));
  g.add(mesh(geo('leg', () => new THREE.BoxGeometry(0.08, 0.07, 0.07)), M.dark, 0, 0.035, 0));
  g.add(mesh(geo('head', () => new THREE.SphereGeometry(0.042, 10, 8)), M.skin, 0, 0.255, 0));
  g.add(mesh(geo('helm', () => new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), elite ? M.dark : M.mid, 0, 0.265, 0));
  g.add(mesh(geo('rifle', () => new THREE.BoxGeometry(0.2, 0.025, 0.025)), M.dark, 0.07, 0.17, 0.04));
  if (elite) g.add(mesh(geo('visor', () => new THREE.BoxGeometry(0.02, 0.018, 0.07)), M.glow, 0.042, 0.258, 0));
  g.position.set(x, 0, z);
  return g;
}
const BUILD = {
  inf(M) { const g = new THREE.Group(); [[0, 0], [-0.13, 0.12], [-0.13, -0.12], [0.1, 0.17], [0.1, -0.17]].forEach(([x, z]) => g.add(soldier(M, x, z))); return g; },
  commando(M) { const g = new THREE.Group(); [[0.05, 0], [-0.12, 0.13], [-0.12, -0.13]].forEach(([x, z]) => { const s = soldier(M, x, z, true); s.scale.setScalar(1.25); g.add(s); }); return g; },
  tank(M) {
    const g = new THREE.Group();
    g.add(mesh(geo('hull', () => new THREE.BoxGeometry(0.64, 0.15, 0.36)), M.body, 0, 0.14, 0));
    g.add(mesh(geo('hullf', () => new THREE.BoxGeometry(0.12, 0.1, 0.34)), M.body, 0.34, 0.12, 0, 0, 0, -0.5));
    const tr = geo('track', () => new THREE.BoxGeometry(0.7, 0.13, 0.1));
    g.add(mesh(tr, M.dark, 0, 0.07, 0.2)); g.add(mesh(tr, M.dark, 0, 0.07, -0.2));
    const tur = new THREE.Group(); tur.position.set(-0.04, 0.24, 0); tur.name = 'turret';
    tur.add(mesh(geo('tur', () => new THREE.CylinderGeometry(0.14, 0.17, 0.11, 8)), M.body, 0, 0.03, 0));
    tur.add(mesh(geo('barrel', () => new THREE.CylinderGeometry(0.022, 0.026, 0.44, 8)), M.dark, 0.3, 0.04, 0, 0, 0, Math.PI / 2));
    tur.add(mesh(geo('stripe', () => new THREE.BoxGeometry(0.2, 0.015, 0.3)), M.glow, -0.02, 0.09, 0));
    g.add(tur);
    g.add(mesh(geo('lamp', () => new THREE.BoxGeometry(0.02, 0.03, 0.05)), M.light, 0.33, 0.17, 0.12));
    g.add(mesh(geo('lamp'), M.light, 0.33, 0.17, -0.12));
    return g;
  },
  art(M) {
    const g = new THREE.Group();
    g.add(mesh(geo('abase', () => new THREE.BoxGeometry(0.46, 0.12, 0.3)), M.body, 0, 0.13, 0));
    const w = geo('wheel', () => new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12));
    [[0.15, 0.17], [-0.15, 0.17], [0.15, -0.17], [-0.15, -0.17]].forEach(([x, z]) => g.add(mesh(w, M.dark, x, 0.075, z, Math.PI / 2)));
    g.add(mesh(geo('abarrel', () => new THREE.CylinderGeometry(0.035, 0.045, 0.7, 10)), M.dark, 0.18, 0.36, 0, 0, 0, -1.05));
    g.add(mesh(geo('ashield', () => new THREE.BoxGeometry(0.05, 0.16, 0.26)), M.body, 0.05, 0.24, 0));
    g.add(mesh(geo('astripe', () => new THREE.BoxGeometry(0.3, 0.02, 0.31)), M.glow, -0.05, 0.19, 0));
    return g;
  },
  aa(M) {
    const g = new THREE.Group();
    g.add(mesh(geo('truck', () => new THREE.BoxGeometry(0.5, 0.13, 0.28)), M.body, 0, 0.13, 0));
    g.add(mesh(geo('cab', () => new THREE.BoxGeometry(0.15, 0.13, 0.26)), M.glass, 0.2, 0.26, 0));
    const w = geo('wheel');
    [[0.16, 0.16], [-0.16, 0.16], [0.16, -0.16], [-0.16, -0.16]].forEach(([x, z]) => g.add(mesh(w, M.dark, x, 0.075, z, Math.PI / 2)));
    const tur = new THREE.Group(); tur.position.set(-0.08, 0.22, 0); tur.name = 'turret';
    tur.add(mesh(geo('aat', () => new THREE.CylinderGeometry(0.09, 0.11, 0.08, 8)), M.dark, 0, 0.02, 0));
    const b = geo('aab', () => new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6));
    tur.add(mesh(b, M.mid, 0.12, 0.17, 0.04, 0, 0, -0.75)); tur.add(mesh(b, M.mid, 0.12, 0.17, -0.04, 0, 0, -0.75));
    g.add(tur);
    const dish = mesh(geo('dish', () => new THREE.CylinderGeometry(0.1, 0.02, 0.03, 12)), M.glow, -0.2, 0.33, 0, 0, 0, 0.5); dish.name = 'spin';
    g.add(dish);
    return g;
  },
  heli(M) {
    const g = new THREE.Group();
    const b = mesh(geo('hbody', () => new THREE.SphereGeometry(0.15, 14, 10)), M.body, 0, 0, 0); b.scale.set(1.7, 0.9, 0.95); g.add(b);
    g.add(mesh(geo('hcock', () => new THREE.SphereGeometry(0.1, 12, 8)), M.glass, 0.17, 0.03, 0));
    g.add(mesh(geo('htail', () => new THREE.CylinderGeometry(0.025, 0.05, 0.45, 8)), M.body, -0.42, 0.04, 0, 0, 0, Math.PI / 2));
    g.add(mesh(geo('hfin', () => new THREE.BoxGeometry(0.1, 0.14, 0.02)), M.dark, -0.62, 0.1, 0));
    const sk = geo('skid', () => new THREE.BoxGeometry(0.4, 0.015, 0.02));
    g.add(mesh(sk, M.dark, 0, -0.16, 0.1)); g.add(mesh(sk, M.dark, 0, -0.16, -0.1));
    g.add(mesh(geo('hpod', () => new THREE.BoxGeometry(0.16, 0.04, 0.04)), M.dark, 0.05, -0.06, 0.18));
    g.add(mesh(geo('hpod'), M.dark, 0.05, -0.06, -0.18));
    const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.y = 0.16;
    const bl = geo('blade', () => new THREE.BoxGeometry(0.9, 0.008, 0.045));
    rotor.add(mesh(bl, M.dark)); rotor.add(mesh(bl, M.dark, 0, 0, 0, 0, Math.PI / 2));
    g.add(rotor);
    g.add(mesh(geo('hl', () => new THREE.SphereGeometry(0.025, 8, 6)), M.glow, -0.64, 0.18, 0));
    g.userData.air = 1.15;
    return g;
  },
  jet(M) {
    const g = new THREE.Group();
    g.add(mesh(geo('jbody', () => new THREE.CylinderGeometry(0.045, 0.075, 0.7, 10)), M.body, 0, 0, 0, 0, 0, -Math.PI / 2));
    g.add(mesh(geo('jnose', () => new THREE.ConeGeometry(0.045, 0.18, 10)), M.dark, 0.44, 0, 0, 0, 0, -Math.PI / 2));
    const wing = geo('jwing', () => {
      const s = new THREE.Shape(); s.moveTo(0.15, 0); s.lineTo(-0.2, 0.42); s.lineTo(-0.3, 0.42); s.lineTo(-0.2, 0); s.lineTo(-0.3, -0.42); s.lineTo(-0.2, -0.42); s.lineTo(0.15, 0);
      const e = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); e.rotateX(Math.PI / 2); return e;
    });
    g.add(mesh(wing, M.body, 0, 0.01, 0));
    g.add(mesh(geo('jfin', () => new THREE.BoxGeometry(0.14, 0.16, 0.015)), M.dark, -0.3, 0.09, 0.05, 0.3));
    g.add(mesh(geo('jfin'), M.dark, -0.3, 0.09, -0.05, -0.3));
    g.add(mesh(geo('jcock', () => new THREE.SphereGeometry(0.05, 10, 6)), M.glass, 0.18, 0.045, 0));
    const fl = mesh(geo('jflame', () => new THREE.ConeGeometry(0.05, 0.2, 8)), M.glow, -0.45, 0, 0, 0, 0, Math.PI / 2); fl.name = 'flame'; g.add(fl);
    g.userData.air = 1.9;
    return g;
  },
  mech(M) {
    const g = new THREE.Group();
    const lg = geo('mleg', () => new THREE.BoxGeometry(0.11, 0.34, 0.13));
    const ll = mesh(lg, M.dark, 0, 0.17, 0.12), rl = mesh(lg, M.dark, 0, 0.17, -0.12);
    ll.name = 'legL'; rl.name = 'legR'; g.add(ll); g.add(rl);
    g.add(mesh(geo('mfoot', () => new THREE.BoxGeometry(0.2, 0.05, 0.15)), M.mid, 0.03, 0.025, 0.12));
    g.add(mesh(geo('mfoot'), M.mid, 0.03, 0.025, -0.12));
    const top = new THREE.Group(); top.position.y = 0.36; top.name = 'torso';
    top.add(mesh(geo('mtor', () => new THREE.BoxGeometry(0.36, 0.3, 0.38)), M.body, 0, 0.15, 0));
    top.add(mesh(geo('mcock', () => new THREE.BoxGeometry(0.06, 0.07, 0.22)), M.glow, 0.18, 0.2, 0));
    const arm = geo('marm', () => new THREE.BoxGeometry(0.1, 0.26, 0.1));
    top.add(mesh(arm, M.dark, 0.02, 0.06, 0.25)); top.add(mesh(arm, M.dark, 0.02, 0.06, -0.25));
    const gun = geo('mgun', () => new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8));
    top.add(mesh(gun, M.mid, 0.18, -0.04, 0.25, 0, 0, Math.PI / 2)); top.add(mesh(gun, M.mid, 0.18, -0.04, -0.25, 0, 0, Math.PI / 2));
    top.add(mesh(geo('mpod', () => new THREE.BoxGeometry(0.16, 0.1, 0.14)), M.mid, -0.06, 0.34, 0.14));
    top.add(mesh(geo('mpod'), M.mid, -0.06, 0.34, -0.14));
    g.add(top);
    g.scale.setScalar(1.25);
    return g;
  }
};
/* ---------------- CC0 glTF assets (Quaternius) ---------------- */
// size = target length (or height for axis:'h') in world units; yaw turns the model to face +X
const UNIT_CFG = {
  inf:      { file: 'inf', size: 0.3, axis: 'h', yaw: -Math.PI / 2, tint: 0.2, pose: true, squad: [[0.02, 0], [-0.13, 0.14], [-0.13, -0.14]], ring: 1.1 },
  commando: { file: 'commando', size: 0.33, axis: 'h', yaw: -Math.PI / 2, tint: 0.3, pose: true, squad: [[0.04, 0.08], [-0.1, -0.1]], ring: 1 },
  tank:     { file: 'tank', size: 0.72, yaw: Math.PI, tint: 0.55, anim: { move: 'Tank_Forward' }, ring: 1.5 },
  art:      { file: 'art', size: 0.74, yaw: Math.PI, tint: 0.5, anim: { move: 'Tank_Forward' }, ring: 1.5 },
  aa:       { file: 'aa', size: 0.46, yaw: 0, tint: 0.45, ring: 1.2 },
  heli:     { file: 'heli', size: 0.46, yaw: Math.PI / 2, tint: 0.45, air: 1.1, anim: { idle: 'Idle', shoot: 'Shoot', die: 'Dead' }, ring: 1 },
  jet:      { file: 'jet', size: 0.72, yaw: Math.PI / 2, tint: 0.4, air: 1.8, ring: 1.2 },
  mech:     { file: 'mech', size: 0.62, axis: 'h', yaw: -Math.PI / 2, tint: 0.35, anim: { idle: 'Idle', move: 'Walk', shoot: 'Shoot', die: 'Death' }, ring: 1.5 }
};
const SCENERY = ['palm1', 'palm2', 'pine1', 'pine2', 'tree1', 'tree2', 'cactus1', 'cactus2', 'deadtree', 'mountain1', 'mountain2', 'gold', 'ship', 'boat'];
const ASSETS = { ready: false, units: {}, scenery: {} };
G.POSE = G.POSE || { axis: 'x', l: -1.2, r: -1.2 };
function poseArms(root) {
  root.traverse(b => {
    if (!b.isBone) return;
    if (b.name === 'UpperArmL') b.rotation[G.POSE.axis] += G.POSE.l;
    if (b.name === 'UpperArmR') b.rotation[G.POSE.axis] += G.POSE.r;
  });
}
function prepUnit(k, gltf) {
  const cfg = UNIT_CFG[k], inner = gltf.scene;
  if (cfg.pose) poseArms(inner);
  inner.rotation.y = cfg.yaw || 0;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const sc = cfg.size / (cfg.axis === 'h' ? size.y : Math.max(size.x, size.z));
  inner.scale.multiplyScalar(sc);
  inner.position.set(-c.x * sc, -box.min.y * sc - (cfg.air ? size.y * sc * 0.5 : 0), -c.z * sc);
  const wrap = new THREE.Group(); wrap.add(inner);
  return { proto: wrap, anims: gltf.animations, cfg };
}
function prepScenery(gltf) {
  const sc = gltf.scene; sc.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sc), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const N = new THREE.Matrix4().makeScale(1 / size.y, 1 / size.y, 1 / size.y).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  const parts = [];
  sc.traverse(o => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, m: N.clone().multiply(o.matrixWorld) }); });
  return { parts, len: Math.max(size.x, size.z) / size.y };
}
const TINTS = {};
function tintMat(m, color, amt) {
  const k = m.uuid + color + amt;
  if (!TINTS[k]) { const t = m.clone(); t.color.lerp(new THREE.Color(color), amt); TINTS[k] = t; }
  return TINTS[k];
}
G.assets3D = ASSETS;
G.renderers3D = [];
(async function loadAssets() {
  try {
    const ld = new GLTFLoader();
    const base = new URL('../models/', import.meta.url).href;
    await Promise.all([
      ...Object.keys(UNIT_CFG).map(async k => { ASSETS.units[k] = prepUnit(k, await ld.loadAsync(base + UNIT_CFG[k].file + '.glb')); }),
      ...SCENERY.map(async n => { ASSETS.scenery[n] = prepScenery(await ld.loadAsync(base + n + '.glb')); })
    ]);
    ASSETS.ready = true;
    for (const k in PROTO) delete PROTO[k];
    for (const k in snapCache) delete snapCache[k];
    G.renderers3D.forEach(r => r.onAssets());
    document.dispatchEvent(new Event('assets3d'));
  } catch (e) { console.warn('3D assets unavailable, using built-in models', e); }
})();

function fromAsset(type, color) {
  const A = ASSETS.units[type], cfg = A.cfg;
  const root = new THREE.Group();
  const mixers = [];
  for (const [x, z] of (cfg.squad || [[0, 0]])) {
    const o = SkeletonUtils.clone(A.proto);
    o.position.set(x, 0, z);
    if (cfg.squad) o.rotation.y = (Math.random() - 0.5) * 0.5;
    o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.material = tintMat(m.material, color, cfg.tint); if (m.isSkinnedMesh) m.frustumCulled = false; } });
    if (A.anims.length) mixers.push(new THREE.AnimationMixer(o));
    root.add(o);
  }
  const ring = new THREE.Mesh(geo('fring', () => new THREE.RingGeometry(0.2, 0.25, 28).rotateX(-Math.PI / 2)), mats(color).glow);
  ring.position.y = -(cfg.air || 0) + 0.025; ring.scale.setScalar(cfg.ring || 1); ring.name = 'fring';
  root.add(ring);
  const ud = root.userData = { type, ph: Math.random() * 10, air: cfg.air, mixers, cur: null };
  ud.play = (key, once) => {
    const name = cfg.anim && cfg.anim[key];
    if (!name || !mixers.length) return false;
    const clip = A.anims.find(a => a.name.includes(name));
    if (!clip) return false;
    for (const mx of mixers) {
      const act = mx.clipAction(clip);
      act.reset();
      if (once) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; } else { act.setLoop(THREE.LoopRepeat); act.time = Math.random() * clip.duration; }
      const prev = mx._cur;
      act.play();
      if (prev && prev !== act) act.crossFadeFrom(prev, 0.2, false);
      mx._cur = act;
    }
    if (!once) ud.cur = key;
    return true;
  };
  ud.play('idle');
  return root;
}

const PROTO = {};
function makeUnit(type, color) {
  if (ASSETS.ready && ASSETS.units[type]) return fromAsset(type, color);
  const k = type + color;
  if (!PROTO[k]) PROTO[k] = BUILD[type](mats(color));
  const o = PROTO[k].clone();
  o.userData = { ...PROTO[k].userData, type, ph: Math.random() * 10 };
  return o;
}

/* ---------------- water shader ---------------- */
const waterVS = `
varying vec3 vW; varying float vFog;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`;
const waterFS = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSky; uniform vec3 uSun; uniform vec3 uSunDir;
uniform sampler2D uMask; uniform vec4 uMaskRect; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLava;
varying vec3 vW; varying float vFog;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float nz(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 uv = (vW.xz - uMaskRect.xy) / uMaskRect.zw;
  vec4 mk = (uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) ? vec4(0.0) : texture2D(uMask, uv);
  float t = uTime;
  vec2 p = vW.xz;
  float dx = cos(p.x*1.3 + t*1.1)*0.5 + cos(p.x*0.7 + p.y*0.9 + t*0.8)*0.4 + cos(p.x*3.1 - p.y*2.3 + t*2.2)*0.15;
  float dz = cos(p.y*1.1 + t*0.9)*0.5 + cos(p.y*0.8 - p.x*0.6 + t*1.3)*0.4 + cos(p.y*2.7 + p.x*2.9 + t*1.9)*0.15;
  vec3 n = normalize(vec3(-dx*0.12, 1.0, -dz*0.12));
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 base = mix(uDeep, uShallow, smoothstep(0.0, 0.9, mk.r));
  vec3 c;
  if (uLava > 0.5) {
    float f = nz(p*0.35 + vec2(t*0.04, t*0.03)) * 0.65 + nz(p*0.9 - vec2(t*0.08, 0.0)) * 0.35;
    float crust = smoothstep(0.38, 0.7, f);
    c = mix(uShallow*1.6, uDeep, crust) + uShallow * 1.2 * smoothstep(0.0, 0.8, mk.r);
    c += uFoam * smoothstep(0.5, 0.95, mk.g) * (0.8 + 0.4*sin(t*3.0 + mk.g*20.0));
  } else {
    vec3 R = reflect(-uSunDir, n);
    float spec = pow(max(dot(R, V), 0.0), 120.0) * 2.5 + pow(max(dot(R, V), 0.0), 18.0) * 0.25;
    c = mix(base, uSky, fres*0.55) + uSun * spec;
    float caust = nz(p*2.2 + vec2(t*0.35, -t*0.2)) * nz(p*3.1 - vec2(t*0.25, t*0.3));
    c += uShallow * caust * mk.r * 0.55;
    float band = smoothstep(0.55, 0.92, mk.g);
    float foam = band * smoothstep(0.35, 0.9, 0.5 + 0.5*sin(mk.g*26.0 - t*2.4)) * (0.6 + 0.4*nz(p*6.0 + t));
    c = mix(c, uFoam, foam*0.75);
  }
  float fogF = smoothstep(uFogNear, uFogFar, vFog);
  gl_FragColor = vec4(mix(c, uFogColor, fogF), 1.0);
  #include <colorspace_fragment>
}`;

/* ======================================================================
   Renderer3D
   ====================================================================== */
class Renderer3D {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.snapshot = !!opts.snapshot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: this.snapshot });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
    this.cam = { x: 0, y: 0, z: 1 };
    this.yaw = 0; this.shake = 0;
    this.fx = []; this.texts = []; this.particles = [];
    this.ownerDirty = true;
    this.garrison = {};
    this.hidden = new Set();
    this.anims = [];
    this.quality = (G.meta && G.meta.data.settings.gfx) || 'high';
    if (!this.snapshot) {
      this.ov = document.createElement('canvas');
      this.ov.id = 'map-ov';
      canvas.parentNode.insertBefore(this.ov, canvas.nextSibling);
      this.octx = this.ov.getContext('2d');
    }
    textures();
    this.resize();
    G.renderers3D.push(this);
  }

  onAssets() {
    if (!this.scene) return;
    this.buildFeatures();
    this.buildShips();
    for (const t in this.garrison) this.unitLayer.remove(this.garrison[t].group);
    this.garrison = {};
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    if (this.sun) this.sun.castShadow = q === 'high';
    this.renderer.shadowMap.needsUpdate = true;
    this.scene && this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize(w, h) {
    const r = this.cv.getBoundingClientRect();
    this.w = w || Math.max(1, r.width); this.h = h || Math.max(1, r.height);
    const dpr = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(this.w, this.h); }
    if (this.ov) { this.ov.width = this.w * dpr; this.ov.height = this.h * dpr; }
    if (this.map) this.clampCam();
  }

  /* ---------------- scene construction ---------------- */
  setMap(map) {
    if (this.scene) this.disposeScene();
    this.map = map;
    const th = this.theme = G.WORLDS[map.wi];
    const scene = this.scene = new THREE.Scene();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const hx of map.hexes) if (hx.land) { x0 = Math.min(x0, hx.x); x1 = Math.max(x1, hx.x); z0 = Math.min(z0, hx.y); z1 = Math.max(z1, hx.y); }
    this.bounds = { x0, x1, z0, z1 };
    this.mapW = map.hexes.reduce((a, h) => Math.max(a, h.x), 0) + 30;
    this.mapH = map.hexes.reduce((a, h) => Math.max(a, h.y), 0) + 30;
    const cx = (x0 + x1) / 2 * S, cz = (z0 + z1) / 2 * S;
    const ext = Math.max(x1 - x0, z1 - z0) * S;

    // sky + fog
    scene.background = canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      th.sky.forEach((c, i) => gr.addColorStop(i / (th.sky.length - 1), c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this.fogColor = new THREE.Color(th.sky[2]).lerp(new THREE.Color(th.sea[0]), 0.35);
    scene.fog = new THREE.Fog(this.fogColor, 20, 80);

    // lights
    const night = th.night;
    const hemi = new THREE.HemisphereLight(new THREE.Color(th.sky[3]).lerp(new THREE.Color('#ffffff'), 0.5), new THREE.Color(th.sea[0]), 0.75 - night * 0.35);
    scene.add(hemi);
    const sunCol = new THREE.Color(th.sky[4]).lerp(new THREE.Color('#ffffff'), 0.35);
    const sun = this.sun = new THREE.DirectionalLight(sunCol, 2.4 - night * 1.4);
    const sunDir = new THREE.Vector3(-0.8, 0.95 - night * 0.3, 0.35).normalize();
    this.sunDir = sunDir;
    sun.position.set(cx + sunDir.x * 40, sunDir.y * 40, cz + sunDir.z * 40);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = this.quality === 'high';
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -ext * 0.65; sc.right = ext * 0.65; sc.top = ext * 0.65; sc.bottom = -ext * 0.65; sc.near = 1; sc.far = 100;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12 + night * 0.15));

    // water mask (shallows / foam)
    const pad = 60;
    const rect = { x: (x0 - pad) * S, z: (z0 - pad) * S, w: (x1 - x0 + pad * 2) * S, h: (z1 - z0 + pad * 2) * S };
    const MW = 512, MH = Math.round(512 * rect.h / rect.w);
    const mask = canvasTex(MW, MH, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, MW, MH);
      const k = MW / rect.w;
      const land = (blur, color) => {
        g.save(); try { g.filter = `blur(${blur}px)`; } catch (e) {}
        g.fillStyle = color;
        for (const hx of map.hexes) if (hx.land) {
          g.beginPath();
          for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); const X = (hx.x * S + Math.cos(a) * 1.05 - rect.x) * k, Y = (hx.y * S + Math.sin(a) * 1.05 - rect.z) * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
          g.fill();
        }
        g.restore();
      };
      g.globalCompositeOperation = 'lighter';
      land(MW / 40, 'rgba(255,0,0,1)');
      land(MW / 160, 'rgba(0,255,0,1)');
    }, false);
    const wmat = this.waterMat = new THREE.ShaderMaterial({
      vertexShader: waterVS, fragmentShader: waterFS,
      uniforms: {
        uTime: { value: 0 }, uDeep: { value: new THREE.Color(th.sea[0]) }, uShallow: { value: new THREE.Color(th.sea[2]) },
        uFoam: { value: th.lavaSea ? new THREE.Color('#ffcc66').multiplyScalar(2) : new THREE.Color('#ffffff') },
        uSky: { value: new THREE.Color(th.sky[3]) }, uSun: { value: sunCol.clone().multiplyScalar(1.4 - night) }, uSunDir: { value: sunDir },
        uMask: { value: mask }, uMaskRect: { value: new THREE.Vector4(rect.x, rect.z, rect.w, rect.h) },
        uFogColor: { value: this.fogColor }, uFogNear: { value: 20 }, uFogFar: { value: 80 }, uLava: { value: th.lavaSea ? 1 : 0 }
      }
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(ext * 8, ext * 8, 1, 1), wmat);
    water.rotation.x = -Math.PI / 2; water.position.set(cx, 0, cz);
    scene.add(water);
    // receive shadows on water area via a shadow catcher
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2, ext * 2), new THREE.ShadowMaterial({ opacity: 0.25 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.set(cx, 0.01, cz); catcher.receiveShadow = true;
    scene.add(catcher);

    this.buildTerrain();
    this.buildFeatures();
    this.buildOverlays();
    this.buildAmbient();
    this.buildShips();
    this.garrison = {}; this.hidden = new Set();
    this.unitLayer = new THREE.Group(); scene.add(this.unitLayer);
    this.fxLayer = new THREE.Group(); scene.add(this.fxLayer);
    this.shieldMeshes = {};
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffaa55, 0, 6, 1.6); l.userData.t = 0; scene.add(l); this.lights.push(l); }

    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(scene, this.camera);
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.snapshot ? this.resize(this.w, this.h) : this.resize();
    } else this.renderPass.scene = scene;
    this.bloom.strength = 0.32 + th.night * 0.45;
    this.ownerDirty = true;
    this.clampCam();
  }

  disposeScene() {
    this.scene.traverse(o => {
      if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
    });
    this.scene = null;
  }

  hexColor(hx) {
    const tc = this.theme.terrain[hx.terr];
    const c = new THREE.Color(tc.top);
    const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * (1.08 + hx.rnd * 0.16)), G.clamp(hsl.l * (0.9 + hx.rnd * 0.2) + (hx.terr === 'mountain' ? hx.el * 0.1 : 0), 0, 1));
    return c;
  }

  buildTerrain() {
    const map = this.map, geos = [];
    for (const hx of map.hexes) {
      if (!hx.land) continue;
      const top = topY(hx), bot = -0.6;
      const g = new THREE.CylinderGeometry(0.97, 1.03, top - bot, 6, 1);
      g.translate(hx.x * S, (top + bot) / 2, hx.y * S);
      const topC = this.hexColor(hx), sideC = new THREE.Color(this.theme.terrain[hx.terr].side);
      const pos = g.attributes.position, nor = g.attributes.normal;
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        let c;
        if (nor.getY(i) > 0.5) c = topC;
        else { const y = pos.getY(i); c = sideC.clone().multiplyScalar(G.clamp(0.45 + (y - bot) / (top - bot) * 0.75, 0.3, 1.2)); }
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.deleteAttribute('uv');
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05, flatShading: true }));
    m.receiveShadow = true; m.castShadow = true;
    this.scene.add(m);
    this.terrainMesh = m;
  }

  buildFeatures() {
    const map = this.map, th = this.theme, wi = map.wi, R = G.rng(map.seed + 11);
    const dummy = new THREE.Object3D();
    if (this.featGroup) this.scene.remove(this.featGroup);
    const FG = this.featGroup = new THREE.Group(); this.scene.add(FG);
    const lists = { tree: [], pine: [], palm: [], mount: [], snow: [], bld: [], neonTree: [], crater: [], crack: [] };
    for (const hx of map.hexes) {
      if (!hx.land) continue;
      const x = hx.x * S, z = hx.y * S, y = topY(hx);
      const t = hx.terr;
      if (t === 'forest') {
        const n = 4 + R.int(3);
        for (let i = 0; i < n; i++) {
          const p = [x + R.range(-0.6, 0.6), y, z + R.range(-0.55, 0.55), R.range(0.75, 1.25), R() * 6];
          (wi === 0 ? lists.palm : wi === 2 ? lists.pine : wi === 4 ? lists.neonTree : lists.tree).push(p);
        }
      } else if (t === 'mountain') {
        const peaks = 1 + (R() < 0.35 ? 1 : 0);
        for (let i = 0; i < peaks; i++) {
          const s = (i ? R.range(0.4, 0.55) : R.range(0.6, 0.8)) * (0.75 + hx.el * 0.5);
          const p = [x + (i ? R.range(-0.45, 0.45) : 0), y, z + (i ? R.range(-0.4, 0.4) : 0), s, R() * 6];
          lists.mount.push(p);
          if (wi === 2 || wi === 0 || hx.el > 0.7) lists.snow.push(p);
          if (wi === 3 && !i) lists.crater.push([p[0], y + 0.85 * s, p[2], s]);
        }
      } else if (t === 'city') {
        const n = wi === 4 ? 6 : 4 + R.int(2);
        for (let i = 0; i < n; i++) {
          const hgt = R.range(0.25, wi === 4 ? 1.9 : 0.95) * (i === 0 ? 1.3 : 1);
          lists.bld.push([x + R.range(-0.55, 0.55), y, z + R.range(-0.5, 0.5), R.range(0.16, 0.3), hgt, R.range(0.16, 0.3), R() * 0.5]);
        }
      } else if (t === 'beach' && wi === 0 && R() < 0.5) {
        lists.palm.push([x + R.range(-0.5, 0.5), y, z + R.range(-0.4, 0.4), R.range(0.8, 1.1), R() * 6]);
      } else if (t === 'plain') {
        if (wi === 0 && R() < 0.25) lists.palm.push([x + R.range(-0.5, 0.5), y, z + R.range(-0.4, 0.4), 0.9, R() * 6]);
        else if ((wi === 1 || wi === 3) && R() < 0.2) lists.tree.push([x + R.range(-0.5, 0.5), y, z + R.range(-0.4, 0.4), 0.7, 0]);
        if (wi === 3 && R() < 0.5) lists.crack.push([x + R.range(-0.3, 0.3), y + 0.01, z + R.range(-0.3, 0.3), R() * 3]);
      }
    }
    const inst = (geometry, material, items, place, shadow = true) => {
      if (!items.length) return null;
      const im = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach((p, i) => { place(dummy, p, i); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      im.castShadow = shadow; im.receiveShadow = true;
      FG.add(im);
      return im;
    };
    // instanced glTF scenery
    const instModel = (names, items, height, tint, tintAmt = 0.6) => {
      if (!items.length) return;
      names.forEach((n, ni) => {
        const A = ASSETS.scenery[n]; if (!A) return;
        const mine = items.filter((_, i) => i % names.length === ni);
        if (!mine.length) return;
        for (const part of A.parts) {
          const mat = tint ? tintMat(part.mat, tint, tintAmt) : part.mat;
          const im = new THREE.InstancedMesh(part.geo, mat, mine.length);
          mine.forEach((p, i) => {
            dummy.position.set(p[0], p[1] - 0.02, p[2]); dummy.rotation.set(0, p[4] || 0, 0); dummy.scale.setScalar(height * p[3]); dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix.clone().multiply(part.m));
          });
          im.castShadow = true; im.receiveShadow = true;
          FG.add(im);
        }
      });
    };
    if (ASSETS.ready) {
      instModel(['palm1', 'palm2'], lists.palm, 0.62);
      instModel(['pine1', 'pine2'], lists.pine, 0.6);
      if (wi === 1) instModel(['cactus1', 'cactus2'], lists.tree, 0.36);
      else if (wi === 3) instModel(['deadtree'], lists.tree, 0.5, '#2a1a14', 0.5);
      else instModel(['tree1', 'tree2'], lists.tree, 0.55);
      const mt = ['#d6c7a8', '#c8743f', '#eef4ff', '#3a2c2c', '#8a8fc0'][wi];
      instModel(['mountain1', 'mountain2'], lists.mount, 1.05, mt, 0.55);
      lists.palm = []; lists.pine = []; lists.tree = []; lists.mount = []; lists.snow = [];
      if (wi === 3) lists.crater.forEach(c => c[1] += 0.15);
    }
    const vc = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; };
    const std = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, ...o });
    const fc = th.terrain.forest;
    // round tree
    const treeG = mergeGeometries([
      vc(new THREE.CylinderGeometry(0.03, 0.045, 0.22, 5).translate(0, 0.11, 0), '#5a3b22'),
      vc(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.32, 0), new THREE.Color(fc.top).multiplyScalar(0.85).getStyle()),
      vc(new THREE.IcosahedronGeometry(0.13, 0).translate(0.05, 0.46, 0.03), new THREE.Color(fc.top).getStyle())
    ]);
    inst(treeG, std(), lists.tree, (d, p) => { d.position.set(p[0], p[1], p[2]); d.scale.setScalar(p[3]); d.rotation.set(0, p[4], 0); });
    const pineG = mergeGeometries([
      vc(new THREE.CylinderGeometry(0.025, 0.035, 0.15, 5).translate(0, 0.075, 0), '#4a3322'),
      vc(new THREE.ConeGeometry(0.2, 0.32, 6).translate(0, 0.28, 0), '#2f5f52'),
      vc(new THREE.ConeGeometry(0.15, 0.26, 6).translate(0, 0.44, 0), '#3b7363'),
      vc(new THREE.ConeGeometry(0.08, 0.13, 6).translate(0, 0.56, 0), '#f4f8ff')
    ]);
    inst(pineG, std(), lists.pine, (d, p) => { d.position.set(p[0], p[1], p[2]); d.scale.setScalar(p[3]); d.rotation.set(0, p[4], 0); });
    // palm
    const fronds = [];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.BoxGeometry(0.34, 0.012, 0.07);
      f.translate(0.17, 0, 0); f.rotateZ(-0.45); f.rotateY(i * Math.PI * 2 / 7); f.translate(0.05, 0.52, 0);
      fronds.push(vc(f, i % 2 ? '#2fa35a' : '#24894a'));
    }
    const palmG = mergeGeometries([vc(new THREE.CylinderGeometry(0.022, 0.04, 0.55, 6).translate(0, 0.27, 0).rotateZ(0.12), '#8a6239'), ...fronds,
      vc(new THREE.SphereGeometry(0.04, 6, 4).translate(0.05, 0.5, 0), '#5a3a1a')]);
    inst(palmG, std({ roughness: 0.7 }), lists.palm, (d, p) => { d.position.set(p[0], p[1], p[2]); d.scale.setScalar(p[3]); d.rotation.set(0, p[4], 0); });
    // neon trees
    const ntG = mergeGeometries([vc(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 5).translate(0, 0.1, 0), '#1c2c2a'), vc(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.3, 0), '#3dff8f')]);
    inst(ntG, std({ emissive: 0x0b5a33, emissiveIntensity: 1.2 }), lists.neonTree, (d, p) => { d.position.set(p[0], p[1], p[2]); d.scale.setScalar(p[3]); });
    // mountains
    const mc = th.terrain.mountain;
    const mG = vc(new THREE.ConeGeometry(0.72, 0.85, 6, 1).translate(0, 0.425, 0), new THREE.Color(mc.top).getStyle());
    inst(mG, std({ roughness: 0.95 }), lists.mount, (d, p) => { d.position.set(p[0], p[1] - 0.05, p[2]); d.scale.set(p[3], p[3], p[3]); d.rotation.set(0, p[4], 0); });
    const snowC = wi === 3 ? '#3a2a2a' : '#ffffff';
    const sG = vc(new THREE.ConeGeometry(0.28, 0.33, 6, 1).translate(0, 0.687, 0), snowC);
    inst(sG, std({ roughness: 0.6 }), lists.snow, (d, p) => { d.position.set(p[0], p[1] - 0.05, p[2]); d.scale.set(p[3] * 1.005, p[3] * 1.005, p[3] * 1.005); d.rotation.set(0, p[4], 0); });
    // volcano glow
    if (lists.crater.length) {
      const cm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1f').multiplyScalar(3), toneMapped: false });
      inst(new THREE.SphereGeometry(0.16, 10, 8), cm, lists.crater, (d, p) => { d.position.set(p[0], p[1] - 0.08, p[2]); d.scale.setScalar(p[3]); }, false);
    }
    if (lists.crack.length) {
      const cm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a10').multiplyScalar(2.4), toneMapped: false });
      inst(new THREE.BoxGeometry(0.5, 0.02, 0.04), cm, lists.crack, (d, p) => { d.position.set(p[0], p[1], p[2]); d.rotation.set(0, p[3], 0); }, false);
    }
    // buildings
    if (lists.bld.length) {
      const night = th.night;
      const bm = new THREE.MeshStandardMaterial({
        color: new THREE.Color(th.terrain.city.top).lerp(new THREE.Color('#9aa3c2'), 0.3), map: TEX.windows, emissiveMap: TEX.windows,
        emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25 + night * 2.2, roughness: 0.35, metalness: 0.5
      });
      const bg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const im = inst(bg, bm, lists.bld, (d, p) => { d.position.set(p[0], p[1], p[2]); d.scale.set(p[3], p[4], p[5]); d.rotation.set(0, p[6], 0); });
      if (im) { const tint = new THREE.Color(); lists.bld.forEach((p, i) => { tint.setHSL(0.65 + R() * 0.15, 0.15, 0.7 + R() * 0.3); im.setColorAt(i, tint); }); }
      // rooftop neon / beacons
      const roof = lists.bld.filter(p => p[4] > 0.6 || wi === 4);
      const rm = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.accent).multiplyScalar(2.6), toneMapped: false });
      inst(new THREE.BoxGeometry(1, 0.03, 1), rm, roof, (d, p) => { d.position.set(p[0], p[1] + p[4], p[2]); d.scale.set(p[3] * 1.04, 1, p[5] * 1.04); d.rotation.set(0, p[6], 0); }, false);
    }
    // resources
    for (const T of map.terrs) {
      if (T.type !== 'resource') continue;
      const hx = map.hexes[T.center];
      const x = hx.x * S, z = hx.y * S, y = topY(hx);
      const g = new THREE.Group(); g.position.set(x + 0.45, y, z - 0.35);
      const dark = mats('#333333').dark;
      if (wi <= 1) {
        const leg = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4);
        [[0.12, 0.12], [-0.12, 0.12], [0, -0.14]].forEach(([a, b]) => { const l = mesh(leg, dark, a * 0.5, 0.33, b * 0.5); l.rotation.set(b * 0.6, 0, -a * 0.6); g.add(l); });
        g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), mats('#ffb340').light, 0, 0.7, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), mats('#b8862f').body, 0.25, 0.08, 0.1));
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.13, 10), mats('#b8862f').body, 0.25, 0.065, -0.12));
      } else if (wi === 2) {
        const cm = new THREE.MeshStandardMaterial({ color: 0x9fefff, emissive: 0x2fbfff, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.3 });
        for (let i = 0; i < 4; i++) { const c = mesh(new THREE.OctahedronGeometry(0.12, 0), cm, (i - 1.5) * 0.12, 0.15 + (i % 2) * 0.06, (i % 2) * 0.1); c.scale.y = 2; g.add(c); }
      } else if (wi === 3) {
        g.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffaa33').multiplyScalar(3), toneMapped: false }), 0, 0.02, 0));
      } else {
        g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8), dark, 0, 0.06, 0));
        const core = mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3dfcff').multiplyScalar(3), toneMapped: false }), 0, 0.3, 0);
        core.name = 'spin'; g.add(core);
      }
      FG.add(g);
    }
  }

  buildShips() {
    if (this.ships) this.ships.forEach(s => this.scene.remove(s));
    this.ships = [];
    if (!ASSETS.ready || this.theme.lavaSea) return;
    const b = this.bounds, cx = (b.x0 + b.x1) / 2 * S, cz = (b.z0 + b.z1) / 2 * S;
    const rx = (b.x1 - b.x0) / 2 * S + 2.2, rz = (b.z1 - b.z0) / 2 * S + 2;
    const defs = [['ship', 1.5, 0.05], ['boat', 0.55, -0.09], ['boat', 0.5, 0.07]];
    defs.forEach(([n, len, spd], i) => {
      const A = ASSETS.scenery[n];
      const g = new THREE.Group();
      for (const part of A.parts) { const m = new THREE.Mesh(part.geo, part.mat); m.applyMatrix4(part.m); m.castShadow = true; g.add(m); }
      const inner = new THREE.Group(); inner.add(g); inner.scale.setScalar(len / A.len);
      const s = new THREE.Group(); s.add(inner);
      s.userData = { a: i * 2.1 + 0.5, spd, rx: rx * (1 + i * 0.08), rz: rz * (1 + i * 0.1), cx, cz, n };
      this.scene.add(s); this.ships.push(s);
    });
  }

  buildOverlays() {
    const map = this.map;
    this.over = []; this.border = []; this.cborder = [];
    const plate = new THREE.CircleGeometry(0.97, 6, Math.PI / 6).rotateX(-Math.PI / 2);
    for (const T of map.terrs) {
      const pg = [];
      for (const i of T.hexes) { const hx = map.hexes[i]; pg.push(plate.clone().translate(hx.x * S, topY(hx) + 0.012, hx.y * S)); }
      const om = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const o = new THREE.Mesh(mergeGeometries(pg), om); o.renderOrder = 2;
      this.scene.add(o); this.over.push(o);
      // border ribbons
      const verts = [], cverts = [];
      for (const i of T.hexes) {
        const hx = map.hexes[i];
        const y = topY(hx) + 0.03;
        for (let k = 0; k < 6; k++) {
          const n = hx.nb[k];
          const nh = n >= 0 ? map.hexes[n] : null;
          if (nh && nh.tid === T.id) continue;
          const a0 = Math.PI / 180 * (60 * k - 30), a1 = Math.PI / 180 * (60 * k + 30);
          const pts = [[Math.cos(a0) * 0.97, Math.sin(a0) * 0.97], [Math.cos(a1) * 0.97, Math.sin(a1) * 0.97]];
          const ins = 0.87;
          const quad = (arr, w) => {
            const [p0, p1] = pts, q0 = [p0[0] * w, p0[1] * w], q1 = [p1[0] * w, p1[1] * w];
            const X = hx.x * S, Z = hx.y * S;
            arr.push(X + p0[0], y, Z + p0[1], X + p1[0], y, Z + p1[1], X + q1[0], y, Z + q1[1]);
            arr.push(X + p0[0], y, Z + p0[1], X + q1[0], y, Z + q1[1], X + q0[0], y, Z + q0[1]);
          };
          quad(verts, ins);
          if (nh && nh.land && map.terrs[nh.tid].country !== T.country) quad(cverts, 0.94);
        }
      }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, fog: false });
      const b = new THREE.Mesh(bg, bm); b.renderOrder = 3; this.scene.add(b); this.border.push(b);
      if (cverts.length) {
        const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cverts, 3));
        const c = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
        c.renderOrder = 4; c.visible = false; this.scene.add(c); this.cborder.push(c);
      }
    }
    plate.dispose();
  }

  buildAmbient() {
    const wi = this.map.wi, b = this.bounds;
    const kind = ['motes', 'dust', 'snow', 'embers', 'neon'][wi];
    const N = kind === 'snow' ? 1400 : 700;
    const pos = new Float32Array(N * 3), spd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (b.x0 + Math.random() * (b.x1 - b.x0)) * S; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (b.z0 + Math.random() * (b.z1 - b.z0)) * S;
      spd[i] = 0.3 + Math.random() * 0.7;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = { motes: '#fff3c0', dust: '#ffd9a0', snow: '#ffffff', embers: '#ff7a2b', neon: '#3dfcff' }[kind];
    const m = new THREE.PointsMaterial({
      size: kind === 'snow' ? 0.07 : 0.06, map: TEX.glow, color: new THREE.Color(c).multiplyScalar(kind === 'embers' || kind === 'neon' ? 2.5 : 1),
      transparent: true, opacity: kind === 'snow' ? 0.9 : 0.75, depthWrite: false, blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: kind === 'snow'
    });
    this.ambient = new THREE.Points(g, m); this.ambient.userData = { kind, spd };
    this.scene.add(this.ambient);
    // clouds
    this.clouds = [];
    if (wi !== 4) for (let i = 0; i < 6; i++) {
      const sm = new THREE.SpriteMaterial({ map: TEX.smoke, color: wi === 3 ? 0x553333 : 0xffffff, transparent: true, opacity: wi === 3 ? 0.35 : 0.22, depthWrite: false });
      const s = new THREE.Sprite(sm);
      s.scale.set(9, 5, 1);
      s.position.set((b.x0 + Math.random() * (b.x1 - b.x0)) * S, 5 + Math.random() * 2, (b.z0 + Math.random() * (b.z1 - b.z0)) * S);
      s.userData.v = 0.15 + Math.random() * 0.2;
      this.scene.add(s); this.clouds.push(s);
    }
  }

  /* ---------------- camera ---------------- */
  distFor(z) { return (this.h * S) / (z * 2 * Math.tan(FOV * Math.PI / 360)) * 0.95; }
  pitchFor(z) { const t = G.clamp((z - this.minZoom()) / (2.4 - this.minZoom()), 0, 1); return G.lerp(1.08, 0.72, t) + (this.h > this.w ? 0.18 : 0); }
  updateCamera() {
    const c = this.cam;
    const d = this.distFor(c.z), p = this.pitchFor(c.z);
    const tx = c.x * S, tz = c.y * S;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(tx + Math.sin(this.yaw) * Math.cos(p) * d + sx, Math.sin(p) * d + sy, tz + Math.cos(this.yaw) * Math.cos(p) * d);
    this.camera.lookAt(tx + sx * 0.5, 0.4, tz);
    this.camera.updateMatrixWorld();
    const f = this.scene && this.scene.fog;
    if (f) { f.near = d * 1.7; f.far = d * 5; this.waterMat.uniforms.uFogNear.value = f.near; this.waterMat.uniforms.uFogFar.value = f.far; }
  }
  minZoom() {
    if (!this.bounds) return 0.3;
    const b = this.bounds;
    return Math.min(this.w / (b.x1 - b.x0 + 120), this.h / ((b.z1 - b.z0) * 0.85 + 120)) * 0.85;
  }
  clampCam() {
    const c = this.cam, b = this.bounds;
    if (!b) return;
    c.z = G.clamp(c.z, this.minZoom(), 3.2);
    c.x = G.clamp(c.x, b.x0 - 40, b.x1 + 40);
    c.y = G.clamp(c.y, b.z0 - 40, b.z1 + 260);
  }
  focusBounds(tids, instant = true) {
    const m = this.map;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of tids) for (const i of m.terrs[t].hexes) { const hx = m.hexes[i]; x0 = Math.min(x0, hx.x - 26); x1 = Math.max(x1, hx.x + 26); y0 = Math.min(y0, hx.y - 26); y1 = Math.max(y1, hx.y + 26); }
    const padTop = 70, padBot = this.w < 760 ? 150 : 40;
    const z = Math.min(this.w / (x1 - x0 + 60), (this.h - padTop - padBot) / ((y1 - y0) * 0.92 + 60));
    const portrait = this.h > this.w;
    const target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + (portrait ? 150 / z : (padBot - padTop) / 2 / z * 0.8), z: G.clamp(z * (portrait ? 1.25 : 1), this.minZoom(), 2.4) };
    this.homeCam = target;
    if (instant) Object.assign(this.cam, target); else this.camTarget = target;
    this.clampCam();
  }
  ground(sx, sy, y = 0.45) {
    this.updateCamera();
    const ndc = new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const t = (y - ray.ray.origin.y) / ray.ray.direction.y;
    if (!(t > 0)) return null;
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
  }
  pan(x0, y0, x1, y1) {
    const a = this.ground(x0, y0), b = this.ground(x1, y1);
    if (!a || !b) return;
    this.cam.x += (a.x - b.x) / S; this.cam.y += (a.z - b.z) / S;
    this.camTarget = null; this.clampCam();
  }
  zoomAt(sx, sy, f) {
    const a = this.ground(sx, sy);
    this.cam.z *= f; this.clampCam();
    const b = this.ground(sx, sy);
    if (a && b) { this.cam.x += (a.x - b.x) / S; this.cam.y += (a.z - b.z) / S; }
    this.camTarget = null; this.clampCam();
  }
  pick(sx, sy) {
    if (!this.map) return -1;
    let best = -1;
    for (let it = 0, y = 0.5; it < 2; it++) {
      const g = this.ground(sx, sy, y);
      if (!g) return -1;
      let bd = Infinity, bh = null;
      for (const hx of this.map.hexes) {
        if (!hx.land) continue;
        const d = (hx.x * S - g.x) ** 2 + (hx.y * S - g.z) ** 2;
        if (d < bd) { bd = d; bh = hx; }
      }
      if (!bh || bd > 1.1) return -1;
      best = bh.tid; y = topY(bh);
    }
    return best;
  }
  centerOf(tid, lift = 0) {
    const hx = this.map.hexes[this.map.terrs[tid].center];
    return new THREE.Vector3(hx.x * S, topY(hx) + lift, hx.y * S);
  }
  from2D(x, y) {
    let bh = null, bd = Infinity;
    for (const hx of this.map.hexes) { if (!hx.land) continue; const d = (hx.x - x) ** 2 + (hx.y * SQ - hx.h - y) ** 2; if (d < bd) { bd = d; bh = hx; } }
    return new THREE.Vector3(x * S, bh ? topY(bh) + 0.1 : 0.5, bh ? (y + bh.h) / SQ * S : y / SQ * S);
  }
  project(v) {
    const p = v.clone().project(this.camera);
    return [(p.x + 1) / 2 * this.w, (1 - p.y) / 2 * this.h, p.z];
  }
  toScreen(mx, my) { const p = this.project(this.from2D(mx, my)); return [p[0], p[1]]; }

  /* ---------------- ownership & units ---------------- */
  rebuildOwners(match) {
    this.ownerDirty = false;
    for (const T of this.map.terrs) {
      const st = match.terr[T.id];
      const o = this.over[T.id], b = this.border[T.id];
      if (st.owner === -2) { o.material.color.set('#0b0a1c'); o.userData.op = 0.74; b.visible = false; continue; }
      b.visible = true;
      if (st.owner < 0) { o.material.color.set('#ffffff'); o.userData.op = 0.0; b.material.color.set('#ffffff'); b.userData.base = new THREE.Color('#bdb8d6'); b.userData.op = 0.35; continue; }
      const c = match.factions[st.owner].color;
      o.material.color.set(c); o.userData.op = 0.26;
      b.userData.base = new THREE.Color(c).multiplyScalar(2.2); b.userData.op = 1;
    }
    for (const c of this.cborder) c.visible = match.mode === 'world';
  }

  syncGarrisons(match) {
    for (const T of this.map.terrs) {
      const st = match.terr[T.id];
      const types = st.owner === -2 || this.hidden.has(T.id) ? [] : G.UNIT_ORDER.filter(k => st.units[k] > 0).sort((a, b) => G.UNITS[b].cost - G.UNITS[a].cost).slice(0, 3);
      const color = st.owner >= 0 ? match.factions[st.owner].color : G.NEUTRAL_COLOR;
      const key = types.join(',') + '|' + color;
      const cur = this.garrison[T.id];
      if (cur && cur.key === key) continue;
      if (cur) this.unitLayer.remove(cur.group);
      const group = new THREE.Group();
      const c = this.centerOf(T.id);
      const slots = [[0.15, 0.1], [-0.45, 0.42], [-0.4, -0.45]];
      types.forEach((t, i) => {
        const u = makeUnit(t, color);
        u.scale.multiplyScalar(ASSETS.ready ? 1.75 : 1.35);
        const [dx, dz] = slots[i];
        u.position.set(c.x + dx, c.y + (u.userData.air || 0), c.z + dz);
        u.rotation.y = Math.PI * 0.5 + (Math.random() - 0.5) * 0.6;
        u.userData.base = u.position.clone();
        group.add(u);
      });
      this.unitLayer.add(group);
      this.garrison[T.id] = { key, group };
    }
  }

  /* ---------------- effects ---------------- */
  sprite(pos, o) {
    const m = new THREE.SpriteMaterial({ map: o.smoke ? TEX.smoke : TEX.glow, color: new THREE.Color(o.color || '#ffffff').multiplyScalar(o.smoke ? 1 : (o.glow || 2.5)), transparent: true, opacity: o.op ?? 1, depthWrite: false, blending: o.smoke ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: !!o.smoke });
    const s = new THREE.Sprite(m);
    s.position.copy(pos); s.scale.setScalar(o.size || 0.3);
    s.userData = { v: o.v || new THREE.Vector3(), life: o.life || 0.6, t: 0, grow: o.grow || 0, g: o.g || 0, op0: o.op ?? 1, size: o.size || 0.3 };
    this.fxLayer.add(s); this.particles.push(s);
    return s;
  }
  flash(pos, intensity = 6, color = 0xffaa55) {
    const l = this.lights.find(l => l.userData.t <= 0) || this.lights[0];
    l.position.copy(pos).add(new THREE.Vector3(0, 0.4, 0)); l.color.set(color); l.userData.t = 0.35; l.userData.i = intensity;
  }
  explode(pos, big = 1) {
    const R = () => Math.random() - 0.5;
    this.sprite(pos.clone().add(new THREE.Vector3(0, 0.15, 0)), { color: '#fff3c8', size: 1.2 * big, life: 0.22, grow: 2 * big, glow: 3 });
    for (let i = 0; i < 14 * big; i++) this.sprite(pos.clone().add(new THREE.Vector3(R() * 0.2, 0.1, R() * 0.2)), { color: Math.random() < 0.5 ? '#ff7a2b' : '#ffcf5a', size: (0.25 + Math.random() * 0.35) * big, life: 0.45 + Math.random() * 0.4, v: new THREE.Vector3(R() * 2.4, 0.6 + Math.random() * 2, R() * 2.4).multiplyScalar(big), grow: 0.8, g: -2 });
    for (let i = 0; i < 6 * big; i++) this.sprite(pos.clone().add(new THREE.Vector3(R() * 0.3, 0.2, R() * 0.3)), { smoke: true, color: '#3a3438', size: (0.5 + Math.random() * 0.4) * big, life: 1.6 + Math.random(), v: new THREE.Vector3(R() * 0.4, 0.5 + Math.random() * 0.5, R() * 0.4), grow: 1.4 * big, op: 0.75 });
    for (let i = 0; i < 6 * big; i++) {
      const d = new THREE.Mesh(geo('debris', () => new THREE.BoxGeometry(0.05, 0.05, 0.05)), mats('#333').dark);
      d.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0));
      d.userData = { v: new THREE.Vector3(R() * 3, 1.5 + Math.random() * 2.5, R() * 3), life: 1.2, t: 0, debris: true, g: -9, floor: pos.y };
      this.fxLayer.add(d); this.particles.push(d);
    }
    const ring = new THREE.Mesh(geo('ring', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: TEX.ring, color: new THREE.Color('#ffd9a0').multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
    ring.userData = { ring: true, life: 0.6, t: 0, size: 2.2 * big };
    this.fxLayer.add(ring); this.particles.push(ring);
    this.flash(pos, 8 * big);
    this.shake = Math.min(0.25, this.shake + 0.06 * big);
    G.sfx.boom(Math.min(1, 0.4 * big));
  }
  boom(x, y, big = 1) { this.explode(this.from2D(x, y), big); }
  addFx(f) {
    f.t0 = performance.now();
    if (f.type === 'text') { f.pos = this.from2D(f.x, f.y).add(new THREE.Vector3(0, 0.8, 0)); this.texts.push(f); return; }
    if (f.type === 'ring') {
      const pos = this.from2D(f.x, f.y);
      const ring = new THREE.Mesh(geo('ring'), new THREE.MeshBasicMaterial({ map: TEX.ring, color: new THREE.Color(f.col).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      ring.position.copy(pos);
      ring.userData = { ring: true, life: f.dur / 1000, t: 0, size: f.size * S * 2.6 };
      this.fxLayer.add(ring); this.particles.push(ring);
      this.sprite(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), { color: f.col, size: 1.2, life: 0.5, grow: 1 });
      return;
    }
    if (f.type === 'arrow') { this.arrow(this.from2D(...f.from), this.from2D(...f.to), f.col, f.dur / 1000); }
  }
  arrow(a, b, color, life = 0.8) {
    const mid = a.clone().lerp(b, 0.5); mid.y += a.distanceTo(b) * 0.45 + 0.3;
    const curve = new THREE.QuadraticBezierCurve3(a.clone().setY(a.y + 0.3), mid, b.clone().setY(b.y + 0.3));
    const tex = TEX.dash.clone(); tex.needsUpdate = true; tex.repeat.set(6, 1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.045, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6), map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    m.userData = { arrow: true, life, t: 0, tex };
    this.fxLayer.add(m); this.particles.push(m);
  }
  updateParticles(dt) {
    const keep = [];
    for (const p of this.particles) {
      const u = p.userData; u.t += dt;
      if (u.t >= u.life) { this.fxLayer.remove(p); if (p.material && p.material.dispose && !p.userData.debris) p.material.dispose(); if (u.arrow) p.geometry.dispose(); continue; }
      const k = u.t / u.life;
      if (u.debris) {
        u.v.y += u.g * dt; p.position.addScaledVector(u.v, dt); p.rotation.x += dt * 8; p.rotation.z += dt * 6;
        if (p.position.y < u.floor) { p.position.y = u.floor; u.v.multiplyScalar(0.4); u.v.y = Math.abs(u.v.y) * 0.5; }
      } else if (u.ring) {
        const s = u.size * (0.2 + k); p.scale.set(s, 1, s); p.material.opacity = 1 - k;
      } else if (u.arrow) {
        u.tex.offset.x -= dt * 3; p.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      } else if (u.proj) {
        continue;
      } else {
        u.v.y += u.g * dt; p.position.addScaledVector(u.v, dt);
        u.v.multiplyScalar(1 - dt * 1.5);
        const s = u.size * (1 + u.grow * k); p.scale.setScalar(s);
        p.material.opacity = u.op0 * (1 - k) * (k < 0.1 ? k * 10 : 1);
      }
      keep.push(p);
    }
    this.particles = keep;
    for (const l of this.lights) { if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = Math.max(0, l.userData.t / 0.35) * l.userData.i; } else l.intensity = 0; }
  }

  /* moving squad of models between territories */
  convoy(from, to, units, color, dur = 0.9) {
    return new Promise(res => {
      const types = G.UNIT_ORDER.filter(k => units[k] > 0).sort((a, b) => G.UNITS[b].cost - G.UNITS[a].cost).slice(0, 3);
      const a = this.centerOf(from), b = this.centerOf(to);
      const models = types.map((t, i) => {
        const u = makeUnit(t, color);
        u.userData.off = new THREE.Vector3((i - 1) * 0.3, 0, (i % 2) * 0.3);
        u.userData.play && u.userData.play('move');
        this.fxLayer.add(u); return u;
      });
      const ang = Math.atan2(-(b.z - a.z), b.x - a.x);
      this.anims.push({
        t: 0, dur, update: (k) => {
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          models.forEach(u => {
            const p = a.clone().lerp(b, e).add(u.userData.off);
            p.y = G.lerp(a.y, b.y, e) + (u.userData.air || 0) + (u.userData.air ? Math.sin(e * Math.PI) * 0.5 : Math.sin(e * Math.PI) * 0.12);
            u.position.copy(p); u.rotation.y = ang;
            if (!u.userData.air && Math.random() < 0.3) this.sprite(p.clone().add(new THREE.Vector3(0, 0.05, 0)), { smoke: true, color: '#b9a58a', size: 0.18, life: 0.6, grow: 1.5, op: 0.35, v: new THREE.Vector3(0, 0.2, 0) });
          });
        },
        done: () => { models.forEach(u => this.fxLayer.remove(u)); res(); }
      });
    });
  }

  /* ---------------- cinematic 3D battle on the map ---------------- */
  battle(opts) {
    return new Promise(resolve => {
      const ov = document.getElementById('battle');
      ov.classList.add('show'); document.body.classList.add('cine');
      document.getElementById('battle-title').textContent = `${opts.att.name}  ⚔  ${opts.def.name}`;
      document.getElementById('battle-place').textContent = opts.place;
      const banner = document.getElementById('battle-banner');
      const saveCam = { ...this.cam }, saveYaw = this.yaw;
      const T = opts.tid;
      const C = this.centerOf(T);
      const src = opts.from !== undefined ? this.centerOf(opts.from) : C.clone().add(new THREE.Vector3(-3, 0, 2));
      const dir = new THREE.Vector3(C.x - src.x, 0, C.z - src.z).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      this.hidden.add(T);
      if (this.garrison[T]) { this.unitLayer.remove(this.garrison[T].group); delete this.garrison[T]; }
      const tHex = this.map.hexes[this.map.terrs[T].center];
      this.camTarget = { x: (C.x - dir.x * 0.7) / S, y: (C.z - dir.z * 0.7) / S + 14, z: 3.1 };
      const yaw0 = this.yaw, yawT = G.clamp(Math.atan2(perp.x, perp.z) * 0.25, -0.5, 0.5);
      const squad = [];
      const spawn = (units, side, color) => {
        const types = G.UNIT_ORDER.filter(k => units[k] > 0);
        const per = Math.max(1, Math.floor(9 / Math.max(1, types.length)));
        const list = [];
        types.forEach(t => { const n = Math.min(units[t], per, t === 'inf' ? 3 : 4); for (let i = 0; i < n; i++) list.push({ t, i, of: n }); });
        list.forEach((it, idx) => {
          const u = makeUnit(it.t, color);
          u.scale.multiplyScalar(1.45);
          const row = Math.floor(idx / 4), colI = idx % 4;
          const base = side === 'A' ? C.clone().addScaledVector(dir, -1.55 - row * 0.45) : C.clone().addScaledVector(dir, 0.15 + row * 0.4);
          base.addScaledVector(perp, (colI - 1.5) * 0.42);
          base.y = (side === 'A' ? G.lerp(src.y, C.y, 0.7) : C.y) + (u.userData.air || 0) * 0.8;
          const start = side === 'A' ? base.clone().addScaledVector(dir, -1.4) : base.clone();
          u.position.copy(start);
          u.rotation.y = Math.atan2(-(side === 'A' ? dir.z : -dir.z), side === 'A' ? dir.x : -dir.x);
          u.userData.side = side; u.userData.home = base; u.userData.start = start; u.userData.alive = true;
          if (side === 'A' && u.userData.play) { u.userData.play('move'); setTimeout(() => u.userData.alive && u.userData.play('idle'), 1000); }
          this.fxLayer.add(u); squad.push(u);
        });
      };
      spawn(opts.att.units, 'A', opts.att.color);
      spawn(opts.def.units, 'D', opts.def.color);
      // fortification walls
      const walls = [];
      for (let l = 0; l < (opts.fort || 0); l++) {
        for (let k = -2; k <= 2; k++) {
          const w = mesh(geo('wall', () => new THREE.BoxGeometry(0.12, 0.18, 0.38)), mats('#7a7466').mid);
          w.position.copy(C).addScaledVector(dir, -0.45 - l * 0.2).addScaledVector(perp, k * 0.4); w.position.y = C.y + 0.09;
          w.rotation.y = Math.atan2(-dir.z, dir.x);
          this.fxLayer.add(w); walls.push(w);
        }
      }
      const initial = { A: G.cloneU(opts.att.units), D: G.cloneU(opts.def.units) };
      const res = opts.result;
      const RD = 1.25, APPROACH = 1.0;
      const total = APPROACH + res.rounds.length * RD;
      let t = 0, applied = -1, ended = 0, finished = false, nextShot = 0;
      const shots = [];
      const muzzle = u => u.position.clone().add(new THREE.Vector3(0, u.userData.air ? 0 : 0.25, 0));
      const finish = () => {
        if (finished) return; finished = true;
        squad.concat(walls).forEach(u => this.fxLayer.remove(u));
        shots.forEach(s => this.fxLayer.remove(s.m));
        this.anims = this.anims.filter(a => a !== anim);
        this.hidden.delete(T);
        this.camTarget = { ...saveCam }; this.yaw = saveYaw;
        ov.classList.remove('show'); document.body.classList.remove('cine'); banner.className = 'battle-banner';
        document.getElementById('battle-skip').onclick = null;
        resolve();
      };
      document.getElementById('battle-skip').onclick = () => { G.sfx.click(); finish(); };
      const wall0 = performance.now();
      let prevT = 0;
      const anim = {
        t: 0, dur: 1e9, update: (k) => {
          t = (performance.now() - wall0) / 1000; const dt = Math.min(0.1, t - prevT); prevT = t;
          this.yaw = G.lerp(yaw0, yawT, Math.min(1, t / 3));
          // approach
          for (const u of squad) {
            if (!u.userData.alive) continue;
            if (u.userData.side === 'A') { const e = Math.min(1, t / APPROACH); u.position.lerpVectors(u.userData.start, u.userData.home, 1 - (1 - e) * (1 - e)); }
            if (u.userData.air) u.position.y = u.userData.home.y + Math.sin(t * 2 + u.userData.ph) * 0.06;
            const rotor = u.getObjectByName('rotor'); if (rotor) rotor.rotation.y += dt * 30;
          }
          const round = Math.floor((t - APPROACH) / RD), inR = (t - APPROACH) - round * RD;
          if (t > APPROACH && round < res.rounds.length && inR < RD * 0.7 && t > nextShot) {
            nextShot = t + 0.045 + Math.random() * 0.06;
            const side = Math.random() < 0.5 ? 'A' : 'D';
            const sh = squad.filter(u => u.userData.alive && u.userData.side === side), tg = squad.filter(u => u.userData.alive && u.userData.side !== side);
            if (sh.length && tg.length) {
              const a = sh[Math.floor(Math.random() * sh.length)], b = tg[Math.floor(Math.random() * tg.length)];
              const ty = a.userData.type, heavy = ['tank', 'art', 'mech', 'heli', 'jet', 'aa'].includes(ty);
              const p0 = muzzle(a), p1 = b.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.12, (Math.random() - 0.5) * 0.25));
              const pm = new THREE.Mesh(geo('bolt', () => new THREE.CapsuleGeometry(0.018, 0.16, 2, 6).rotateZ(Math.PI / 2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(heavy ? '#ffd27a' : '#fff6d0').multiplyScalar(4), toneMapped: false }));
              pm.scale.setScalar(heavy ? 1.8 : 1);
              pm.position.copy(p0); pm.userData = { proj: true };
              this.fxLayer.add(pm);
              shots.push({ m: pm, p0, p1, t: 0, d: ty === 'art' ? 0.7 : heavy ? 0.3 : 0.18, arc: ty === 'art' ? 1.4 : 0, heavy, missile: ty === 'heli' || ty === 'jet' || ty === 'aa' });
              this.sprite(p0, { color: '#ffe9a8', size: heavy ? 0.45 : 0.22, life: 0.08 });
              a.position.addScaledVector(dir, a.userData.side === 'A' ? -0.02 : 0.02);
              if (a.userData.play && Math.random() < 0.3) { a.userData.play('shoot', true); setTimeout(() => a.userData.alive && a.userData.play('idle'), 700); }
              if (Math.random() < 0.5) G.sfx.shot();
            }
          }
          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i]; s.t += dt / s.d;
            if (s.t >= 1) {
              this.fxLayer.remove(s.m); shots.splice(i, 1);
              if (s.heavy) this.explode(s.p1, 0.45); else this.sprite(s.p1, { color: '#ffb35a', size: 0.25, life: 0.15 });
              continue;
            }
            const p = s.p0.clone().lerp(s.p1, s.t); p.y += Math.sin(s.t * Math.PI) * s.arc;
            s.m.lookAt(p); s.m.rotateY(Math.PI / 2);
            s.m.position.copy(p);
            if (s.missile && Math.random() < 0.6) this.sprite(p, { smoke: true, color: '#d8d0c8', size: 0.12, life: 0.5, grow: 2, op: 0.5 });
          }
          // apply casualties
          if (round > applied && round < res.rounds.length && inR > RD * 0.72) {
            applied = round;
            const cur = { A: res.rounds[round].A, D: res.rounds[round].D };
            for (const side of ['A', 'D']) {
              const byType = {};
              squad.filter(u => u.userData.side === side && u.userData.alive).forEach(u => (byType[u.userData.type] = byType[u.userData.type] || []).push(u));
              for (const ty in byType) {
                const tot = squad.filter(u => u.userData.side === side && u.userData.type === ty).length;
                const want = (cur[side][ty] || 0) <= 0 ? 0 : Math.max(1, Math.ceil(tot * cur[side][ty] / initial[side][ty]));
                const list = byType[ty];
                while (list.length > want) {
                  const u = list.pop(); u.userData.alive = false;
                  this.explode(u.position.clone(), u.userData.air ? 1 : 0.85);
                  if (!(u.userData.play && u.userData.play('die', true))) u.traverse(o => { if (o.isMesh) o.material = mats('#000').burnt; });
                  else u.userData.animDeath = true;
                  const fr = u.getObjectByName('fring'); if (fr) fr.visible = false;
                  u.userData.dieT = t;
                }
              }
            }
            if (round === 0 && walls.length && opts.result.win) walls.forEach(w => { this.explode(w.position.clone(), 0.3); w.visible = false; });
          }
          for (const u of squad) if (!u.userData.alive && u.userData.dieT !== undefined) {
            const k2 = t - u.userData.dieT;
            if (u.userData.air) { u.position.y -= dt * 2.5; u.rotation.z += dt * 3; if (u.position.y < C.y) u.visible = false; }
            else if (!u.userData.animDeath) { u.rotation.z = Math.min(0.6, k2); u.position.y -= dt * 0.08; }
            if (Math.random() < 0.15) this.sprite(u.position.clone().add(new THREE.Vector3(0, 0.15, 0)), { smoke: true, color: '#222', size: 0.25, life: 1.4, grow: 2, op: 0.5, v: new THREE.Vector3(0, 0.6, 0) });
          }
          if (t > total + 0.3 && !ended) {
            ended = t;
            banner.textContent = opts.banner; banner.className = 'battle-banner show ' + (opts.good ? 'good' : 'bad');
            opts.good ? G.sfx.win() : G.sfx.lose();
            if (opts.result.win) squad.filter(u => u.userData.alive && u.userData.side === 'A').forEach(u => u.userData.home = C.clone().add(u.position.clone().sub(C).multiplyScalar(0.5)).setY(u.position.y));
          }
          if (ended) for (const u of squad) if (u.userData.alive && u.userData.side === 'A' && opts.result.win) u.position.lerp(u.userData.home, dt * 2);
          if (ended && t - ended > 1.6) finish();
        }, done: () => {}
      };
      this.anims.push(anim);
    });
  }

  /* ---------------- per-frame ---------------- */
  frame(now, match, ui) {
    if (!this.map || !this.scene) return;
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    const time = now / 1000;
    if (this.camTarget) {
      const t = this.camTarget, k = 1 - Math.pow(0.02, dt);
      const c = this.cam; c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.z += (t.z - c.z) * k;
      if (Math.abs(t.z - c.z) < 0.002 && Math.abs(t.x - c.x) < 0.3 && Math.abs(t.y - c.y) < 0.3) this.camTarget = null;
    }
    this.shake *= Math.pow(0.02, dt);
    this.updateCamera();
    this.waterMat.uniforms.uTime.value = time;
    if (match) {
      if (this.ownerDirty) this.rebuildOwners(match);
      this.syncGarrisons(match);
      this.updateHighlights(match, ui, time);
    }
    // animate garrison units
    for (const s of (this.ships || [])) {
      const u = s.userData; u.a += u.spd * dt * 0.25;
      const x = u.cx + Math.cos(u.a) * u.rx, z = u.cz + Math.sin(u.a) * u.rz;
      const dx = -Math.sin(u.a) * u.rx * Math.sign(u.spd), dz = Math.cos(u.a) * u.rz * Math.sign(u.spd);
      s.position.set(x, 0.02 + Math.sin(time * 1.6 + u.a * 5) * 0.015, z);
      s.rotation.set(Math.sin(time * 1.3 + u.a) * 0.03, Math.atan2(dx, dz), 0);
      if (Math.random() < 0.25) this.sprite(new THREE.Vector3(x, 0.04, z), { smoke: true, color: '#ffffff', size: u.n === 'ship' ? 0.3 : 0.15, life: 1.4, grow: 2.5, op: 0.45 });
    }
    for (const u of this.fxLayer.children) if (u.userData.mixers) u.userData.mixers.forEach(m => m.update(dt));
    for (const tid in this.garrison) for (const u of this.garrison[tid].group.children) {
      const ud = u.userData;
      if (ud.mixers) ud.mixers.forEach(m => m.update(dt));
      const r = u.getObjectByName('rotor'); if (r) r.rotation.y += dt * 25;
      if (ud.air) {
        if (ud.type === 'jet') { const a = time * 0.7 + ud.ph; u.position.set(ud.base.x + Math.cos(a) * 0.55, ud.base.y + Math.sin(a * 2) * 0.05, ud.base.z + Math.sin(a) * 0.55); u.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0); u.rotateX(-0.45); }
        else u.position.y = ud.base.y + Math.sin(time * 2 + ud.ph) * 0.06;
      }
      const tu = u.getObjectByName('turret'); if (tu) tu.rotation.y = Math.sin(time * 0.5 + ud.ph) * 0.6;
      const sp = u.getObjectByName('spin'); if (sp) sp.rotation.y += dt * 3;
      const torso = u.getObjectByName('torso'); if (torso) torso.rotation.y = Math.sin(time * 0.6 + ud.ph) * 0.3;
    }
    this.scene.traverse && this.spinResources(dt);
    // ambient
    const am = this.ambient, ap = am.geometry.attributes.position, sp = am.userData.spd, kind = am.userData.kind;
    for (let i = 0; i < ap.count; i++) {
      let y = ap.getY(i);
      if (kind === 'snow' || kind === 'neon') { y -= dt * sp[i] * (kind === 'neon' ? 2.5 : 0.6); if (y < 0) y = 6; ap.setX(i, ap.getX(i) + Math.sin(time + i) * dt * 0.15); }
      else { y += dt * sp[i] * (kind === 'embers' ? 0.7 : 0.15); if (y > 6) y = 0.3; ap.setX(i, ap.getX(i) + Math.sin(time * 0.7 + i) * dt * 0.1); }
      ap.setY(i, y);
    }
    ap.needsUpdate = true;
    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x * 26 > this.bounds.x1 + 200) c.position.x = (this.bounds.x0 - 200) * S; }
    // anims
    this.anims = this.anims.filter(a => { a.t += dt; const k = Math.min(1, a.t / a.dur); a.update(k, dt); if (k >= 1) { a.done(); return false; } return true; });
    this.updateParticles(dt);
    if (this.quality === 'high') this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    if (this.ov) this.drawOverlay(match, ui, now);
  }
  spinResources(dt) { /* resource cores spin via name lookup on build; cheap noop placeholder */ }

  updateHighlights(match, ui, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    const sel = ui ? ui.sel : -1, tg = ui && ui.targets;
    for (const T of this.map.terrs) {
      const o = this.over[T.id], b = this.border[T.id];
      let op = o.userData.op || 0;
      let oc = null, bc = b.userData.base, bop = b.userData.op ?? 1;
      if (tg && tg.has(T.id)) {
        const kind = tg.get(T.id);
        oc = kind === 'attack' ? '#ff3b5c' : kind === 'ability' ? '#ffd23f' : '#3dfcff';
        op = 0.18 + 0.22 * pulse;
        bc = new THREE.Color(oc).multiplyScalar(2.5); bop = 1;
      }
      if (T.id === sel) { oc = '#ffffff'; op = 0.18 + 0.12 * pulse; bc = new THREE.Color('#ffffff').multiplyScalar(3); bop = 1; }
      if (ui && ui.hover === T.id && T.id !== sel && !oc) { op = Math.max(op, 0.12); }
      if (match.shields[T.id] !== undefined) { oc = '#7fe3ff'; op = 0.2 + 0.15 * pulse; }
      if (oc) o.material.color.set(oc);
      else if (match.terr[T.id].owner >= 0) o.material.color.set(match.factions[match.terr[T.id].owner].color);
      else if (match.terr[T.id].owner === -2) o.material.color.set('#0b0a1c');
      o.material.opacity = op;
      if (bc) b.material.color.copy(bc);
      b.material.opacity = bop;
    }
    // shield domes
    for (const tid in match.shields) {
      if (!this.shieldMeshes[tid]) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe3ff').multiplyScalar(1.5), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, wireframe: false }));
        m.position.copy(this.centerOf(+tid)); this.scene.add(m); this.shieldMeshes[tid] = m;
      }
      this.shieldMeshes[tid].material.opacity = 0.12 + 0.1 * pulse;
    }
    for (const tid in this.shieldMeshes) if (match.shields[tid] === undefined) { this.scene.remove(this.shieldMeshes[tid]); delete this.shieldMeshes[tid]; }
  }

  drawOverlay(match, ui, now) {
    const ctx = this.octx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    // cinematic vignette
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.4, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.w, this.h);
    if (!match) return;
    const z = this.cam.z, s = G.clamp(0.75 + (z - 0.5) * 0.3, 0.72, 1.15);
    const inBattle = document.getElementById('battle').classList.contains('show');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!inBattle) for (const T of this.map.terrs) {
      const st = match.terr[T.id];
      if (st.owner === -2) continue;
      const [x, y, pz] = this.project(this.centerOf(T.id, 1.05));
      if (pz > 1 || x < -40 || y < -40 || x > this.w + 40 || y > this.h + 40) continue;
      const n = G.countUnits(st.units);
      const color = st.owner >= 0 ? match.factions[st.owner].color : G.NEUTRAL_COLOR;
      const txt = String(n);
      ctx.font = `800 ${Math.round(12.5 * s)}px Rubik, system-ui, sans-serif`;
      const tw = Math.max(ctx.measureText(txt).width + 14 * s, 26 * s), hh = 19 * s;
      const cap = match.factions.some(f => f.capital === T.id && f.alive);
      // pill
      ctx.beginPath(); ctx.roundRect(x - tw / 2, y - hh / 2, tw, hh, hh / 2);
      ctx.fillStyle = 'rgba(8,5,20,0.82)'; ctx.fill();
      ctx.lineWidth = 2 * s; ctx.strokeStyle = color; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 0.5);
      // stem
      ctx.strokeStyle = G.alpha(color, 0.6); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y + hh / 2); ctx.lineTo(x, y + hh / 2 + 6 * s); ctx.stroke();
      let ix = x + tw / 2 + 3;
      if (cap) { ctx.save(); ctx.translate(x - 7 * s, y - hh / 2 - 13 * s); ctx.scale(0.58 * s, 0.58 * s); ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 8; ctx.fill(G.path('crown')); ctx.restore(); }
      for (let k = 0; k < st.fort; k++) { ctx.save(); ctx.translate(ix + k * 8 * s, y - 5 * s); ctx.scale(0.38 * s, 0.38 * s); ctx.fillStyle = '#d8e6ff'; ctx.fill(G.path('fort')); ctx.restore(); }
      if (st.mine > 0) { ctx.save(); ctx.translate(x - tw / 2 - 12 * s, y - 5 * s); ctx.scale(0.4 * s, 0.4 * s); ctx.fillStyle = '#ffd27a'; ctx.fill(G.path('mine')); ctx.restore(); }
      if (z > 1.05 || (ui && ui.sel === T.id)) {
        ctx.font = `700 ${Math.round(11 * s)}px Rubik, system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(T.name, x, y - hh / 2 - (cap ? 24 : 10) * s);
        ctx.fillStyle = '#fff'; ctx.fillText(T.name, x, y - hh / 2 - (cap ? 24 : 10) * s);
      }
    }
    // floating texts
    this.texts = this.texts.filter(f => {
      const t = (now - f.t0) / f.dur; if (t >= 1) return false;
      const [x, y] = this.project(f.pos);
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `900 ${f.size || 16}px Rubik, system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(f.text, x, y - t * 40); ctx.fillStyle = f.col; ctx.fillText(f.text, x, y - t * 40);
      ctx.globalAlpha = 1;
      return true;
    });
  }

  /* ---------------- still images for menus ---------------- */
  snapshotView(mode) {
    const b = this.bounds;
    if (mode === 'top') {
      const cam = new THREE.OrthographicCamera((b.x0 - 30) * S, (b.x1 + 30) * S, -(b.z0 - 30) * S, -(b.z1 + 30) * S, 0.1, 200);
      cam.position.set(0, 50, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      return cam;
    }
    this.cam.x = (b.x0 + b.x1) / 2; this.cam.y = (b.z0 + b.z1) / 2 + 30;
    this.cam.z = Math.min(this.w / (b.x1 - b.x0 + 40), this.h / ((b.z1 - b.z0) * 0.75 + 40)) * 1.05;
    this.updateCamera();
    return this.camera;
  }
}

/* -------- off-screen snapshot renderer for menus -------- */
let SNAP = null;
const snapCache = {};
G.snapshot3D = function (wi, w, h, mode = 'persp') {
  const key = wi + mode + w + 'x' + h;
  if (snapCache[key]) return snapCache[key];
  if (!SNAP) {
    const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px';
    document.body.appendChild(c);
    SNAP = new Renderer3D(c, { snapshot: true });
  }
  SNAP.quality = 'high';
  SNAP.resize(w, h);
  SNAP.setMap(G.getMap(wi));
  const cam = SNAP.snapshotView(mode);
  SNAP.renderPass.camera = cam;
  SNAP.waterMat.uniforms.uTime.value = 3;
  SNAP.clouds.forEach(c => c.visible = false); SNAP.ambient.visible = false; SNAP.border.forEach(b => b.visible = false);
  if (mode === 'top') { SNAP.scene.fog.near = 999; SNAP.scene.fog.far = 1000; SNAP.waterMat.uniforms.uFogNear.value = 999; SNAP.waterMat.uniforms.uFogFar.value = 1000; }
  SNAP.composer.render(0.016);
  SNAP.renderPass.camera = SNAP.camera;
  const out = document.createElement('canvas'); out.width = w * SNAP.dpr; out.height = h * SNAP.dpr;
  out.getContext('2d').drawImage(SNAP.renderer.domElement, 0, 0, out.width, out.height);
  out.bounds = SNAP.bounds;
  snapCache[key] = out;
  return out;
};

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
if (webglOK()) { G.Renderer2D = G.Renderer; G.Renderer = Renderer3D; G.has3D = true; }
G.THREE = THREE;
G.__makeUnit = makeUnit;
