/* Neon Warfront – offline cache */
const CACHE = 'neon-warfront-v3';
const FILES = ['./', './index.html', './style.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/util.js', './js/data.js', './js/mapgen.js', './js/render.js', './js/battle.js', './js/audio.js', './js/game.js', './js/ai.js', './js/ui.js', './js/main.js', './js/render3d.js', './vendor/three.module.min.js', './vendor/addons/utils/BufferGeometryUtils.js', './vendor/addons/postprocessing/EffectComposer.js', './vendor/addons/postprocessing/RenderPass.js', './vendor/addons/postprocessing/UnrealBloomPass.js', './vendor/addons/postprocessing/OutputPass.js', './vendor/addons/postprocessing/ShaderPass.js', './vendor/addons/postprocessing/Pass.js', './vendor/addons/postprocessing/MaskPass.js', './vendor/addons/shaders/CopyShader.js', './vendor/addons/shaders/LuminosityHighPassShader.js', './vendor/addons/shaders/OutputShader.js', './vendor/addons/loaders/GLTFLoader.js', './vendor/addons/utils/SkeletonUtils.js', './models/tank.glb', './models/art.glb', './models/aa.glb', './models/heli.glb', './models/jet.glb', './models/mech.glb', './models/inf.glb', './models/commando.glb', './models/palm1.glb', './models/palm2.glb', './models/pine1.glb', './models/pine2.glb', './models/tree1.glb', './models/tree2.glb', './models/cactus1.glb', './models/cactus2.glb', './models/deadtree.glb', './models/mountain1.glb', './models/mountain2.glb', './models/gold.glb', './models/ship.glb', './models/boat.glb'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
