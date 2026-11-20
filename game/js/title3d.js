/* ===== Neon Warfront – 3D title screen =====
   A slow orbit over the Neon Coast at sunset with a skirmish going on below. */
const G = window.G;
const R3 = G.__r3d;

if (R3) {
  const { THREE, makeUnit, S, topY, Renderer3D, ASSETS } = R3;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);

  const T3 = G.title3D = {
    ok: false,
    init() {
      const host = document.getElementById('scr-title');
      const cv = document.createElement('canvas');
      cv.id = 'title-3d';
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      host.insertBefore(cv, host.firstChild.nextSibling);
      this.cv = cv;
      this.rend = new Renderer3D(cv, { noOverlay: true });
      const map = G.getMap(0);
      this.rend.setMap(map);
      const r = this.rend;
      r.renderer.toneMappingExposure = 0.82;
      r.border.forEach(b => b.visible = false); r.cborder.forEach(b => b.visible = false);
      // pick the city closest to the middle of the island
      const b = r.bounds, mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
      const cities = map.terrs.filter(t => t.type === 'city');
      const pick = (cities.length ? cities : map.terrs).slice().sort((a, b2) => {
        const ha = map.hexes[a.center], hb = map.hexes[b2.center];
        return ((ha.x - mx) ** 2 + (ha.y - mz) ** 2) - ((hb.x - mx) ** 2 + (hb.y - mz) ** 2);
      })[0];
      this.center = r.centerOf(pick.id);
      const nb = pick.adj.map(a => r.centerOf(a)).sort((p, q) => p.distanceTo(this.center) - q.distanceTo(this.center));
      this.front = nb[0] || this.center.clone().add(V(2, 0, 0));
      this.rend.cine = { pos: this.center.clone().add(V(0, 4, 6)), look: this.center.clone() };
      this.units = []; this.t0 = performance.now(); this.next = 0;
      document.getElementById('title-cv').style.display = 'none';
      if (ASSETS.ready) this.spawn(); else document.addEventListener('assets3d', () => this.spawn(), { once: true });
      this.ok = true;
    },
    spawn() {
      const r = this.rend, A = this.center, B = this.front;
      const dir = B.clone().sub(A).setY(0).normalize(), perp = V(-dir.z, 0, dir.x);
      const yaw = d => Math.atan2(-d.z, d.x);
      const place = (type, color, at, face) => {
        const u = makeUnit(type, color); u.scale.multiplyScalar(1.5);
        u.position.copy(at); if (u.userData.air) u.position.y += u.userData.air;
        u.rotation.y = yaw(face);
        const fr = u.getObjectByName('fring'); if (fr) fr.visible = false;
        u.userData.home = u.position.clone();
        r.fxLayer.add(u); this.units.push(u);
        return u;
      };
      const blue = G.PLAYER_FACTION.color, red = G.AI_FACTIONS[0].color;
      const ours = [], theirs = [];
      [['tank', -0.6], ['tank', 0.6], ['mech', 0], ['inf', -1.1], ['inf', 1.1]].forEach(([t, k], i) =>
        ours.push(place(t, blue, A.clone().addScaledVector(perp, k).addScaledVector(dir, i > 2 ? -0.5 : 0), dir)));
      [['tank', -0.5], ['aa', 0.6], ['inf', 0], ['tank', 1.2]].forEach(([t, k]) =>
        theirs.push(place(t, red, B.clone().addScaledVector(perp, k), dir.clone().negate())));
      this.sides = [ours, theirs];
      // jets circling overhead
      this.jets = [0, 1].map(i => { const j = makeUnit('jet', i ? red : blue); j.scale.multiplyScalar(1.6); const fr = j.getObjectByName('fring'); if (fr) fr.visible = false; r.fxLayer.add(j); j.userData.a = i * Math.PI; return j; });
    },
    frame(now) {
      if (!this.ok) return;
      const r = this.rend, t = (now - this.t0) / 1000;
      if (r.w !== this.cv.clientWidth || r.h !== this.cv.clientHeight) r.resize();
      // slow orbit
      const a = t * 0.035, R = 8.5, C = this.center.clone().lerp(this.front, 0.5);
      r.cine.pos.set(C.x + Math.cos(a) * R, C.y + 2.4 + Math.sin(t * 0.07) * 0.25, C.z + Math.sin(a) * R);
      r.cine.look.copy(C).add(V(0, 1.1, 0));
      // skirmish
      if (this.sides && t > this.next) {
        this.next = t + rnd(0.6, 1.4);
        const s = Math.random() < 0.5 ? 0 : 1;
        const shooters = this.sides[s], targets = this.sides[1 - s];
        const a1 = shooters[Math.floor(Math.random() * shooters.length)], b1 = targets[Math.floor(Math.random() * targets.length)];
        const ty = a1.userData.type;
        const kind = ty === 'inf' ? 'bullet' : ty === 'aa' ? 'flak' : 'shell';
        const to = b1.position.clone().add(V(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)));
        if (kind === 'flak') { const j = this.jets[s === 0 ? 1 : 0]; to.copy(j.position).add(V(rnd(-0.4, 0.4), rnd(-0.2, 0.2), rnd(-0.4, 0.4))); }
        const from = a1.position.clone().add(V(0, 0.3, 0));
        if (kind === 'bullet') for (let i = 0; i < 4; i++) setTimeout(() => r.fire({ from, to: to.clone().add(V(rnd(-0.1, 0.1), 0, rnd(-0.1, 0.1))), kind, tracer: i === 1, onHit: p => r.puff('smoke', p, { size: 0.06, grow: 2.5, life: 0.8, tint: r.dustColor(), op: 0.7, vel: V(0, 0.25, 0) }) }), i * 90);
        else r.fire({ from, to, kind, onHit: p => kind === 'flak' ? r.puff('smoke', p, { size: 0.18, grow: 1.6, life: 1.8, tint: 0x232323, op: 0.85 }) : r.dirtImpact(p, 0.55) });
        if (G.ui.current === 'title') G.sfx.shot(ty);
      }
      if (this.jets) this.jets.forEach((j, i) => {
        j.userData.a += 0.004 * (i ? -1 : 1);
        const aa = j.userData.a, C2 = this.center.clone().lerp(this.front, 0.5), RR = 3.4 + i * 0.8;
        j.position.set(C2.x + Math.cos(aa) * RR, C2.y + 2.3 + i * 0.4, C2.z + Math.sin(aa) * RR);
        j.rotation.set(0, Math.atan2(Math.cos(aa), -Math.sin(aa)) * (i ? -1 : 1) + (i ? Math.PI : 0), 0); j.rotateX(i ? 0.5 : -0.5);
      });
      // quieter sounds on the title: skip explosion audio when not on title
      r.frame(now, null, null);
    }
  };
  const boot = () => { try { T3.init(); } catch (e) { console.warn('3D title unavailable', e); T3.ok = false; const c = document.getElementById('title-cv'); if (c) c.style.display = ''; } };
  setTimeout(boot, 0);
}
