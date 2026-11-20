'use strict';
/* ===== Neon Warfront – boot ===== */
(function () {
  G.meta.load();
  G.Title.init();
  G.ctl.init();
  G.ui.show('title');

  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { G.sfx.unlock(); G.sfx.click(); G.ui.go(b.dataset.go); }));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { G.sfx.click(); G.ui.back(); }));
  document.addEventListener('pointerdown', () => G.sfx.unlock(), { once: true });

  window.addEventListener('resize', () => {
    if (G.ctl.rend) G.ctl.rend.resize();
    if (G.ui.current === 'countries') G.drawCountryMap(G.ui.world, -1);
  });

  const loop = now => {
    if (G.ui.current === 'game' && G.ctl.m) G.ctl.rend.frame(now, G.ctl.m, { sel: G.ctl.ui.sel, targets: G.ctl.ui.targets, hover: G.ctl.ui.hover });
    else if (G.ui.current === 'title') G.Title.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // PWA: offline + install
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    const b = document.getElementById('btn-install');
    b.hidden = false;
    b.onclick = async () => { b.hidden = true; deferred.prompt(); deferred = null; };
  });
  // save when app goes to background (mobile)
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.ctl.m && !G.ctl.m.over && !G.ctl.busy) G.saveMatch(G.ctl.m); });
})();
