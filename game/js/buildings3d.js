/* ===== Neon Warfront – 3D buildings on the strategic map =====
   Housing, factories (smoking chimneys), office towers, training bases (barracks, flag, sandbags),
   military vehicle plants (hangar + crane) and airbases (runway, tower, parked jets). */
const G = window.G;
const R3 = G.__r3d;
if (R3) install(R3);

function install({ THREE, makeUnit, mats, geo, mesh, ASSETS, S, topY, Renderer3D }) {
  const P = Renderer3D.prototype;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const M = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x8d8a86, roughness: 0.9 }),
    darkc: new THREE.MeshStandardMaterial({ color: 0x55524f, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.7, metalness: 0.3 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x5b6142, roughness: 0.85 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xa89670, roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x8a4f3a, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.7 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xd8a52a, roughness: 0.6, metalness: 0.3 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x5d7c9a, roughness: 0.15, metalness: 0.8 }),
    white: new THREE.MeshBasicMaterial({ color: 0xe8e8e8 })
  };
  const B = (w, h, d) => geo(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
  const fromModel = (name, height, tint) => {
    const A = ASSETS.scenery[name]; if (!A) return null;
    const g = new THREE.Group();
    for (const part of A.parts) {
      let mat = part.mat;
      if (tint) { mat = mat.clone(); mat.color.lerp(new THREE.Color(tint), 0.35); }
      const m = new THREE.Mesh(part.geo, mat); m.applyMatrix4(part.m); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    g.scale.setScalar(height);
    return g;
  };
  const flag = (color) => {
    const g = new THREE.Group();
    g.add(mesh(geo('pole', () => new THREE.CylinderGeometry(0.006, 0.006, 0.42, 5).translate(0, 0.21, 0)), M.steel));
    const f = mesh(geo('flagq', () => new THREE.PlaneGeometry(0.16, 0.1).translate(0.08, 0, 0)), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }), 0, 0.36, 0);
    f.name = 'flag'; g.add(f);
    return g;
  };
  const MAKE = {
    house(color, lvl, wi) {
      const g = new THREE.Group();
      const names = ['b_house2', 'b_building3_small', 'b_house1'];
      for (let i = 0; i < lvl + 1; i++) {
        const m = fromModel(names[i % names.length], 0.36, [null, '#e9cf9c', '#dfe8f5', '#5a4646', '#7a6cff'][wi]);
        if (m) { m.position.set((i - lvl / 2) * 0.32, 0, (i % 2) * 0.18); m.rotation.y = i * 1.3; g.add(m); }
        else { const b = mesh(B(0.2, 0.16, 0.18), M.brick); b.position.x = (i - lvl / 2) * 0.3; g.add(b); }
      }
      return g;
    },
    factory(color, lvl) {
      const g = new THREE.Group(); g.userData.chimneys = [];
      for (let i = 0; i < lvl; i++) {
        const x = (i - (lvl - 1) / 2) * 0.62;
        g.add(mesh(B(0.52, 0.2, 0.36), M.concrete, x, 0, 0));
        for (let k = 0; k < 3; k++) { const r = mesh(geo('saw', () => new THREE.CylinderGeometry(0.1, 0.1, 0.36, 3, 1).rotateX(Math.PI / 2).translate(0, 0, 0)), M.roof, x - 0.17 + k * 0.17, 0.22, 0); r.rotation.z = Math.PI / 2; g.add(r); }
        for (let c = 0; c < 2; c++) {
          const ch = mesh(geo('chim', () => new THREE.CylinderGeometry(0.03, 0.04, 0.48, 8).translate(0, 0.24, 0)), M.brick, x + 0.18, 0, -0.1 + c * 0.2);
          g.add(ch); g.userData.chimneys.push(V(x + 0.18, 0.5, -0.1 + c * 0.2));
        }
        g.add(mesh(B(0.06, 0.12, 0.12), M.darkc, x - 0.28, 0, 0.1));
      }
      return g;
    },
    office(color, lvl, wi) {
      const g = new THREE.Group();
      const m = fromModel(wi === 4 ? 'b_6story_stack' : 'b_4story', 0.85, '#7fa0c8');
      if (m) g.add(m);
      else { g.add(mesh(B(0.26, 0.8, 0.26), M.glass)); }
      g.add(mesh(B(0.3, 0.02, 0.3), M.white, 0, wi === 4 ? 0.86 : 0.86, 0));
      return g;
    },
    barracks(color) {
      const g = new THREE.Group();
      g.add(mesh(B(0.62, 0.14, 0.22), M.olive, 0, 0, -0.08));
      g.add(mesh(geo('broof', () => new THREE.CylinderGeometry(0.12, 0.12, 0.62, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.14, 0)), M.olive, 0, 0, -0.08));
      g.add(mesh(B(0.5, 0.11, 0.2), M.olive, 0.05, 0, 0.22));
      for (let k = -2; k <= 2; k++) g.add(mesh(geo('sbag', () => new THREE.CapsuleGeometry(0.025, 0.08, 2, 6).rotateZ(Math.PI / 2)), M.sand, k * 0.1, 0.03, 0.42));
      const f = flag(color); f.position.set(-0.36, 0, 0.36); g.add(f);
      return g;
    },
    warfactory(color) {
      const g = new THREE.Group();
      g.add(mesh(geo('hangar', () => new THREE.CylinderGeometry(0.28, 0.28, 0.8, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)), M.roof, 0, 0, 0));
      g.add(mesh(B(0.04, 0.24, 0.5), M.darkc, 0.4, 0, 0));
      g.add(mesh(B(0.012, 0.6, 0.012), M.yellow, -0.3, 0, 0.42));
      const arm = mesh(B(0.5, 0.02, 0.02), M.yellow, -0.1, 0.58, 0.42); arm.name = 'crane'; g.add(arm);
      const f = flag(color); f.position.set(0.48, 0, -0.32); g.add(f);
      return g;
    },
    airbase(color) {
      const g = new THREE.Group();
      const tex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#2c2d30'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#e6e6e6'; for (let i = 8; i < 248; i += 24) x.fillRect(i, 14, 12, 4); x.fillRect(0, 1, 256, 2); x.fillRect(0, 29, 256, 2); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
      const run = new THREE.Mesh(geo('runway', () => new THREE.PlaneGeometry(1.5, 0.26).rotateX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      run.position.y = 0.012; run.receiveShadow = true; g.add(run);
      g.add(mesh(geo('tower', () => new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8).translate(0, 0.21, 0)), M.concrete, 0.3, 0, 0.34));
      g.add(mesh(geo('cab', () => new THREE.CylinderGeometry(0.07, 0.06, 0.08, 8).translate(0, 0.46, 0)), M.glass, 0.3, 0, 0.34));
      g.add(mesh(geo('ahangar', () => new THREE.CylinderGeometry(0.16, 0.16, 0.42, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)), M.roof, -0.45, 0, 0.34));
      const jet = makeUnit('jet', color); jet.scale.multiplyScalar(0.9); jet.position.set(-0.1, 0.06, 0); const fr = jet.getObjectByName('fring'); if (fr) fr.visible = false; g.add(jet);
      const fl = flag(color); fl.position.set(0.55, 0, 0.3); g.add(fl);
      return g;
    }
  };
  const ORDER = ['barracks', 'warfactory', 'airbase', 'factory', 'office', 'house'];

  P.syncBuildings = function (match) {
    if (!this.map || !this.scene) return;
    if (!this.bldLayer || this.bldLayer.parent !== this.scene) { this.bldLayer = new THREE.Group(); this.scene.add(this.bldLayer); this.bldMap = {}; }
    const map = this.map;
    for (const T of map.terrs) {
      const st = match.terr[T.id];
      const hide = st.owner === -2 || this.hidden.has(T.id);
      const color = st.owner >= 0 ? match.factions[st.owner].color : G.NEUTRAL_COLOR;
      const key = hide ? 'x' : color + JSON.stringify(st.b || {}) + (ASSETS.ready ? 'a' : '');
      const cur = this.bldMap[T.id];
      if (cur && cur.key === key) continue;
      if (cur) this.bldLayer.remove(cur.group);
      const group = new THREE.Group(); group.userData.chimneys = [];
      if (!hide && st.b) {
        // building plots: the hexes nearest the centre, skipping the centre (units) and mountains
        const c = map.hexes[T.center];
        const plots = T.hexes.filter(i => i !== T.center && map.hexes[i].terr !== 'mountain').map(i => map.hexes[i])
          .sort((a, b) => ((a.x - c.x) ** 2 + (a.y - c.y) ** 2) - ((b.x - c.x) ** 2 + (b.y - c.y) ** 2));
        let pi = 0;
        for (const k of ORDER) {
          const lvl = st.b[k] || 0; if (!lvl) continue;
          const hx = plots[pi % Math.max(1, plots.length)] || c; pi++;
          const obj = MAKE[k](color, lvl, map.wi);
          const off = plots.length ? 0 : 0.45;
          obj.position.set(hx.x * S + off, topY(hx), hx.y * S + off);
          obj.rotation.y = ((hx.i * 7) % 4) * Math.PI / 2;
          obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          group.add(obj);
          if (obj.userData.chimneys) obj.userData.chimneys.forEach(p => group.userData.chimneys.push({ obj, p }));
        }
      }
      this.bldLayer.add(group);
      this.bldMap[T.id] = { key, group };
    }
  };

  const origFrame = P.frame;
  P.frame = function (now, match, ui) {
    if (match && this.scene) {
      this.syncBuildings(match);
      // factory smoke and flags in the wind
      const t = now / 1000;
      if (this.puff && (!this._smokeT || now - this._smokeT > 350)) {
        this._smokeT = now;
        for (const id in this.bldMap) for (const ch of this.bldMap[id].group.userData.chimneys) {
          if (Math.random() < 0.55) this.puff('smoke', ch.obj.localToWorld(ch.p.clone()), { size: 0.08, grow: 3, life: 3.2, vel: V(0.06, 0.22, 0.02), op: 0.5, tint: 0x9a9690, drag: 0.2, rise: 0.04 });
        }
      }
      if (this.bldLayer) this.bldLayer.traverse(o => { if (o.name === 'flag') o.rotation.y = Math.sin(t * 3 + o.id) * 0.35; if (o.name === 'crane') o.rotation.y = Math.sin(t * 0.3 + o.id) * 0.8; });
    }
    return origFrame.call(this, now, match, ui);
  };

  const origBattle = P.battle;
  P.battle = function (opts) {   // keep buildings in the fight zone out of the camera's way
    if (this.bldMap && this.bldMap[opts.tid]) this.bldMap[opts.tid].group.visible = false;
    return origBattle.call(this, opts).then(r => { if (this.bldMap && this.bldMap[opts.tid]) this.bldMap[opts.tid].group.visible = true; return r; });
  };
}
