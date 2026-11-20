'use strict';
/* ===== Neon Warfront – map renderer ===== */

G.Renderer = class {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, z: 1 };
    this.fx = [];
    this.clouds = [];
    this.ownerDirty = true;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    if (this.map) this.clampCam();
  }

  setMap(map) {
    this.map = map;
    this.theme = G.WORLDS[map.wi];
    this.terrainLayer = G.drawTerrain(map, 1.5);
    this.ownerLayer = document.createElement('canvas');
    this.ownerLayer.width = Math.ceil(map.width);
    this.ownerLayer.height = Math.ceil(map.height);
    this.paths = map.terrs.map(T => {
      const p = new Path2D();
      for (const [a, b] of T.edges) { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); }
      return p;
    });
    this.cpaths = map.terrs.map(T => {
      const p = new Path2D();
      for (const [a, b] of T.cedges) { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); }
      return p;
    });
    this.fills = map.terrs.map(T => {
      const p = new Path2D();
      for (const i of T.hexes) G.hexPath(p, map, map.hexes[i]);
      return p;
    });
    // city lights + sparkles
    const R = G.rng(map.seed + 99);
    this.lights = [];
    for (const hx of map.hexes) if (hx.land && hx.terr === 'city') {
      for (let k = 0; k < 2; k++) this.lights.push([hx.x + R.range(-12, 12), hx.y * G.HEX.SQ - hx.h - R.range(4, 16), R(), R.pick([this.theme.accent, '#ffd27a', '#7fe3ff'])]);
    }
    this.sparkles = [];
    for (let k = 0; k < 260; k++) this.sparkles.push([R.range(-300, map.width + 300), R.range(-300, map.height + 300), R(), R.range(6, 18)]);
    this.clouds = [];
    for (let k = 0; k < 7; k++) this.clouds.push({ x: R.range(-200, map.width), y: R.range(0, map.height), s: R.range(90, 200), v: R.range(4, 10) });
    this.ownerDirty = true;
  }

  focusBounds(tids, instant = true) {
    const m = this.map;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of tids) for (const i of m.terrs[t].hexes) {
      const hx = m.hexes[i];
      x0 = Math.min(x0, hx.x - m.r); x1 = Math.max(x1, hx.x + m.r);
      y0 = Math.min(y0, hx.y * G.HEX.SQ - m.r); y1 = Math.max(y1, hx.y * G.HEX.SQ + m.r);
    }
    const padTop = 70, padBot = 150;
    const z = Math.min(this.w / (x1 - x0 + 40), (this.h - padTop - padBot) / (y1 - y0 + 40));
    const target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (padTop - padBot) / 2 / z, z: G.clamp(z, 0.35, 2.2) };
    this.homeCam = target;
    if (instant) Object.assign(this.cam, target);
    else this.camTarget = target;
  }

  minZoom() { return Math.min(this.w / this.map.width, this.h / this.map.height) * 0.8; }

  clampCam() {
    const c = this.cam, m = this.map;
    c.z = G.clamp(c.z, this.minZoom(), 3.2);
    c.x = G.clamp(c.x, 0, m.width);
    c.y = G.clamp(c.y, 0, m.height);
  }

  toScreen(mx, my) { const c = this.cam; return [(mx - c.x) * c.z + this.w / 2, (my - c.y) * c.z + this.h / 2]; }
  toMap(sx, sy) { const c = this.cam; return [(sx - this.w / 2) / c.z + c.x, (sy - this.h / 2) / c.z + c.y]; }

  pick(sx, sy) {
    const [mx, my] = this.toMap(sx, sy);
    const m = this.map, SQ = G.HEX.SQ;
    let best = -1, bd = Infinity;
    for (const hx of m.hexes) {
      if (!hx.land) continue;
      const dx = hx.x - mx, dy = (hx.y * SQ - hx.h) - my;
      const d = dx * dx + dy * dy * 1.4;
      if (d < bd) { bd = d; best = hx.tid; }
    }
    return bd < (m.r * 1.1) ** 2 ? best : -1;
  }

  zoomAt(sx, sy, f) {
    const [mx, my] = this.toMap(sx, sy);
    this.cam.z *= f;
    this.clampCam();
    const [mx2, my2] = this.toMap(sx, sy);
    this.cam.x += mx - mx2; this.cam.y += my - my2;
    this.clampCam();
    this.camTarget = null;
  }

  rebuildOwners(match) {
    const ctx = this.ownerLayer.getContext('2d');
    ctx.clearRect(0, 0, this.ownerLayer.width, this.ownerLayer.height);
    const m = this.map;
    for (const T of m.terrs) {
      const st = match.terr[T.id];
      if (st.owner === -2) { ctx.fillStyle = 'rgba(4,3,18,0.62)'; ctx.fill(this.fills[T.id]); continue; }
      if (st.owner < 0) { ctx.fillStyle = 'rgba(30,26,46,0.18)'; ctx.fill(this.fills[T.id]); continue; }
      const col = match.factions[st.owner].color;
      const g = ctx.createRadialGradient(T.cx, T.cy, 4, T.cx, T.cy, 90);
      g.addColorStop(0, G.alpha(col, 0.42));
      g.addColorStop(1, G.alpha(col, 0.22));
      ctx.fillStyle = g;
      ctx.fill(this.fills[T.id]);
    }
    this.ownerDirty = false;
  }

  addFx(f) { f.t0 = performance.now(); this.fx.push(f); }

  boom(x, y, big = 1) {
    this.addFx({ type: 'ring', x, y, dur: 700, col: '#ffd27a', size: 40 * big });
    for (let i = 0; i < 18 * big; i++) {
      const a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 60 * big;
      this.addFx({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, dur: 500 + Math.random() * 500, col: Math.random() < 0.5 ? '#ff7a2b' : '#ffe08a' });
    }
  }

  frame(now, match, ui) {
    const ctx = this.ctx, m = this.map, th = this.theme, c = this.cam;
    if (!m) return;
    if (this.camTarget) {
      const t = this.camTarget, k = 0.12;
      c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.z += (t.z - c.z) * k;
      if (Math.abs(t.z - c.z) < 0.002 && Math.abs(t.x - c.x) < 0.5) this.camTarget = null;
    }
    if (this.ownerDirty && match) this.rebuildOwners(match);
    const time = now / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // --- ocean ---
    const sg = ctx.createRadialGradient(this.w / 2, this.h / 2, 50, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.8);
    sg.addColorStop(0, th.sea[1]); sg.addColorStop(1, th.sea[0]);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.w / 2, this.h / 2); ctx.scale(c.z, c.z); ctx.translate(-c.x, -c.y);

    // sparkles on water
    ctx.lineCap = 'round';
    for (const s of this.sparkles) {
      const a = 0.5 + 0.5 * Math.sin(time * 1.3 + s[2] * 30);
      ctx.strokeStyle = th.lavaSea ? `rgba(255,120,40,${0.25 * a})` : `rgba(255,255,255,${0.16 * a})`;
      ctx.lineWidth = 1.4;
      const ox = Math.sin(time * 0.4 + s[2] * 10) * 6;
      ctx.beginPath(); ctx.moveTo(s[0] + ox, s[1]); ctx.lineTo(s[0] + ox + s[3], s[1]); ctx.stroke();
    }

    ctx.drawImage(this.terrainLayer, 0, 0, m.width, m.height);
    if (match) ctx.drawImage(this.ownerLayer, 0, 0, m.width, m.height);

    // city lights
    if (th.night > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const L of this.lights) {
        const a = th.night * (0.6 + 0.4 * Math.sin(time * 2 + L[2] * 20));
        const g = ctx.createRadialGradient(L[0], L[1], 0, L[0], L[1], 14);
        g.addColorStop(0, G.alpha(L[3], 0.55 * a)); g.addColorStop(1, G.alpha(L[3], 0));
        ctx.fillStyle = g; ctx.fillRect(L[0] - 14, L[1] - 14, 28, 28);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    if (match) this.drawBorders(ctx, match, ui, time);

    // clouds (soft)
    for (const cl of this.clouds) {
      cl.x += cl.v * 0.016; if (cl.x > m.width + 250) cl.x = -250;
      const g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.s);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(cl.x - cl.s, cl.y - cl.s, cl.s * 2, cl.s * 2);
    }

    // world-space fx
    this.drawFx(ctx, now, true);
    ctx.restore();

    if (match) this.drawBadges(ctx, match, ui, time);
    this.drawFx(ctx, now, false);

    // cinematic grade
    const tg = ctx.createLinearGradient(0, 0, 0, this.h);
    tg.addColorStop(0, G.alpha(th.sky[3], 0.22));
    tg.addColorStop(0.35, G.alpha(th.sky[2], 0.0));
    tg.addColorStop(1, G.alpha(th.sky[1], 0.25));
    ctx.fillStyle = tg; ctx.fillRect(0, 0, this.w, this.h);
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,8,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.w, this.h);
  }

  drawBorders(ctx, match, ui, time) {
    const m = this.map;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const T of m.terrs) {
      const st = match.terr[T.id];
      if (st.owner === -2) continue;
      if (st.owner < 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
        ctx.stroke(this.paths[T.id]);
        continue;
      }
      const col = match.factions[st.owner].color;
      ctx.strokeStyle = G.alpha(col, 0.28); ctx.lineWidth = 6;
      ctx.stroke(this.paths[T.id]);
      ctx.strokeStyle = G.alpha(col, 0.95); ctx.lineWidth = 1.6;
      ctx.stroke(this.paths[T.id]);
    }
    if (match.mode === 'world') {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.2;
      for (const T of m.terrs) ctx.stroke(this.cpaths[T.id]);
      ctx.setLineDash([]);
    }
    // shields
    for (const tid in match.shields) {
      const T = m.terrs[tid];
      const a = 0.25 + 0.15 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(120,220,255,${a})`; ctx.fill(this.fills[tid]);
    }
    if (!ui) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    if (ui.targets) for (const [tid, kind] of ui.targets) {
      const col = kind === 'attack' ? '#ff3b5c' : kind === 'ability' ? '#ffd23f' : '#3dfcff';
      ctx.fillStyle = G.alpha(col, 0.12 + 0.18 * pulse); ctx.fill(this.fills[tid]);
      ctx.strokeStyle = G.alpha(col, 0.9); ctx.lineWidth = 2.4; ctx.stroke(this.paths[tid]);
    }
    if (ui.sel >= 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * pulse})`; ctx.fill(this.fills[ui.sel]);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.2; ctx.stroke(this.paths[ui.sel]);
    }
    if (ui.hover >= 0 && ui.hover !== ui.sel) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke(this.paths[ui.hover]);
    }
  }

  drawBadges(ctx, match, ui, time) {
    const m = this.map, z = this.cam.z;
    const s = G.clamp(z * 0.95, 0.75, 1.35);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const T of m.terrs) {
      const st = match.terr[T.id];
      if (st.owner === -2) continue;
      const [x, y] = this.toScreen(T.cx, T.cy);
      if (x < -40 || y < -40 || x > this.w + 40 || y > this.h + 40) continue;
      const n = G.countUnits(st.units);
      const col = st.owner >= 0 ? match.factions[st.owner].color : G.NEUTRAL_COLOR;
      const top = G.topUnit(st.units);
      const R = 13 * s;
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * 1.1, R * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      // body
      const g = ctx.createLinearGradient(x, y - R, x, y + R);
      g.addColorStop(0, '#2a2440'); g.addColorStop(1, '#0d0a18');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.2 * s; ctx.stroke();
      if (top) {
        ctx.save(); ctx.translate(x - 7 * s, y - R - 13 * s); ctx.scale(0.58 * s, 0.58 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.translate(1.5, 1.5); ctx.fill(G.path(top)); ctx.translate(-1.5, -1.5);
        ctx.fillStyle = col; ctx.fill(G.path(top));
        ctx.restore();
      }
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(12 * s)}px Rubik, system-ui, sans-serif`;
      ctx.fillText(n > 999 ? '999+' : String(n), x, y + 0.5);
      // capital crown / fort pips
      let px = x + R * 0.95;
      if (match.factions.some(f => f.capital === T.id && f.alive)) {
        ctx.save(); ctx.translate(x + R * 0.4, y - R * 1.15); ctx.scale(0.5 * s, 0.5 * s);
        ctx.fillStyle = '#ffd23f'; ctx.fill(G.path('crown')); ctx.restore();
      }
      if (st.fort > 0) {
        for (let k = 0; k < st.fort; k++) {
          ctx.save(); ctx.translate(px - 2, y - 6 * s + k * 7 * s); ctx.scale(0.3 * s, 0.3 * s);
          ctx.fillStyle = '#d8e6ff'; ctx.fill(G.path('fort')); ctx.restore();
        }
      }
      if (st.mine > 0) {
        ctx.save(); ctx.translate(x - R * 1.55, y - 4 * s); ctx.scale(0.36 * s, 0.36 * s);
        ctx.fillStyle = '#ffd27a'; ctx.fill(G.path('mine')); ctx.restore();
        if (st.mine > 1) { ctx.font = `700 ${Math.round(8 * s)}px Rubik`; ctx.fillStyle = '#ffd27a'; ctx.fillText(st.mine, x - R * 1.3, y + 8 * s); }
      }
      if (z > 0.85 || (ui && ui.sel === T.id)) {
        ctx.font = `700 ${Math.round(10.5 * s)}px Rubik, system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(T.name, x, y + R + 10 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(T.name, x, y + R + 10 * s);
      }
    }
  }

  drawFx(ctx, now, world) {
    const keep = [];
    for (const f of this.fx) {
      const t = (now - f.t0) / f.dur;
      if (t >= 1) continue;
      keep.push(f);
      const isWorld = f.type !== 'text';
      if (isWorld !== world) continue;
      if (f.type === 'ring') {
        ctx.strokeStyle = G.alpha(f.col, 1 - t); ctx.lineWidth = 3 * (1 - t) + 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (0.2 + t), 0, Math.PI * 2); ctx.stroke();
        if (t < 0.3) { ctx.fillStyle = G.alpha('#fff3c0', (0.3 - t) * 2); ctx.beginPath(); ctx.arc(f.x, f.y, f.size * 0.4, 0, Math.PI * 2); ctx.fill(); }
      } else if (f.type === 'spark') {
        const tt = t * f.dur / 1000;
        ctx.fillStyle = G.alpha(f.col, 1 - t);
        ctx.beginPath(); ctx.arc(f.x + f.vx * tt, f.y + f.vy * tt + 40 * tt * tt, 2.2 * (1 - t) + 0.5, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'arrow') {
        const [x0, y0] = f.from, [x1, y1] = f.to;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.35;
        const e = Math.min(1, t * 1.8);
        ctx.strokeStyle = G.alpha(f.col, 0.9 * (1 - Math.max(0, t - 0.6) / 0.4));
        ctx.lineWidth = 4; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -now / 30;
        ctx.beginPath();
        for (let k = 0; k <= 24 * e; k++) {
          const u = k / 24, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, cc = u * u;
          const px = a * x0 + b * mx + cc * x1, py = a * y0 + b * my + cc * y1;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke(); ctx.setLineDash([]);
        if (e >= 1) { ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(x1, y1, 6, 0, Math.PI * 2); ctx.fill(); }
      } else if (f.type === 'text') {
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.globalAlpha = 1 - t * t;
        ctx.font = `900 ${f.size || 16}px Rubik, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(f.text, sx, sy - t * 40);
        ctx.fillStyle = f.col; ctx.fillText(f.text, sx, sy - t * 40);
        ctx.globalAlpha = 1;
      }
    }
    if (!world) this.fx = keep;
  }
};

G.hexPath = function (p, map, hx, dy = 0) {
  for (let k = 0; k < 6; k++) {
    const [x, y] = map.corner(hx, k);
    k ? p.lineTo(x, y + dy) : p.moveTo(x, y + dy);
  }
  p.closePath();
};

/* ---------- static terrain painter ---------- */
G.drawTerrain = function (map, RS) {
  const th = G.WORLDS[map.wi];
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(map.width * RS); cv.height = Math.ceil(map.height * RS);
  const ctx = cv.getContext('2d');
  ctx.scale(RS, RS);
  const SQ = G.HEX.SQ, r = map.r;
  const R = G.rng(map.seed + 7);

  // shallow lagoon glow
  ctx.save();
  try { ctx.filter = 'blur(7px)'; } catch (e) {}
  for (const hx of map.hexes) {
    if (hx.land || !hx.shallow) continue;
    const p = new Path2D(); G.hexPath(p, map, hx, 4);
    ctx.fillStyle = G.alpha(th.sea[2], th.lavaSea ? 0.55 : 0.5);
    ctx.fill(p);
  }
  ctx.restore();
  // foam/ground shadow
  ctx.save();
  try { ctx.filter = 'blur(3px)'; } catch (e) {}
  for (const hx of map.hexes) {
    if (!hx.land || !hx.coast) continue;
    const p = new Path2D(); G.hexPath(p, map, { ...hx, h: -6 });
    ctx.fillStyle = th.lavaSea ? 'rgba(255,140,60,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.fill(p);
  }
  ctx.restore();

  const byRow = map.hexes.filter(h => h.land).sort((a, b) => a.row - b.row || a.col - b.col);
  for (const hx of byRow) {
    const tc = th.terrain[hx.terr];
    const top = [], gnd = [];
    for (let k = 0; k < 6; k++) {
      const [x, y] = map.corner(hx, k);
      top.push([x, y]); gnd.push([x, y + hx.h + 5]);
    }
    // side walls (corners 0..3 lower half)
    const sg = ctx.createLinearGradient(0, top[0][1], 0, gnd[2][1]);
    sg.addColorStop(0, tc.side); sg.addColorStop(1, G.shade(tc.side, -0.45));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]); ctx.lineTo(top[1][0], top[1][1]); ctx.lineTo(top[2][0], top[2][1]); ctx.lineTo(top[3][0], top[3][1]);
    ctx.lineTo(gnd[3][0], gnd[3][1]); ctx.lineTo(gnd[2][0], gnd[2][1]); ctx.lineTo(gnd[1][0], gnd[1][1]); ctx.lineTo(gnd[0][0], gnd[0][1]);
    ctx.closePath(); ctx.fill();
    // top face
    const cy = hx.y * SQ - hx.h;
    const tg = ctx.createLinearGradient(hx.x - r, cy - r * SQ, hx.x + r, cy + r * SQ);
    const v = (hx.rnd - 0.5) * 0.14;
    tg.addColorStop(0, G.shade(tc.top, 0.12 + v));
    tg.addColorStop(1, G.shade(tc.top, -0.08 + v));
    ctx.fillStyle = tg;
    ctx.beginPath();
    top.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.8; ctx.stroke();
    G.drawFeature(ctx, th, hx, hx.x, cy, r, R, map.wi);
  }
  return cv;
};

G.drawFeature = function (ctx, th, hx, x, y, r, R, wi) {
  const t = hx.terr;
  if (t === 'mountain') {
    const peaks = 1 + (R() < 0.6 ? 1 : 0);
    for (let p = 0; p < peaks; p++) {
      const px = x + (p ? R.range(-9, 9) : R.range(-3, 3)), py = y + (p ? 4 : 2);
      const hgt = r * (0.75 + hx.el * 0.5) * (p ? 0.7 : 1), wd = r * (p ? 0.55 : 0.75);
      const base = th.terrain.mountain;
      ctx.fillStyle = G.shade(base.top, 0.15);
      ctx.beginPath(); ctx.moveTo(px - wd, py); ctx.lineTo(px, py - hgt); ctx.lineTo(px, py); ctx.fill();
      ctx.fillStyle = G.shade(base.side, -0.05);
      ctx.beginPath(); ctx.moveTo(px + wd, py); ctx.lineTo(px, py - hgt); ctx.lineTo(px, py); ctx.fill();
      if (wi === 2 || hx.el > 0.75 || wi === 0) {
        ctx.fillStyle = wi === 3 ? '#ff6a2a' : '#ffffff';
        ctx.beginPath(); ctx.moveTo(px - wd * 0.3, py - hgt * 0.7); ctx.lineTo(px, py - hgt); ctx.lineTo(px + wd * 0.3, py - hgt * 0.7);
        ctx.lineTo(px + wd * 0.1, py - hgt * 0.62); ctx.lineTo(px - wd * 0.1, py - hgt * 0.74); ctx.fill();
      }
      if (wi === 3 && !p) {
        const g = ctx.createRadialGradient(px, py - hgt, 0, px, py - hgt, 14);
        g.addColorStop(0, 'rgba(255,140,40,0.9)'); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.fillRect(px - 14, py - hgt - 14, 28, 28);
      }
    }
  } else if (t === 'forest') {
    for (let k = 0; k < 4; k++) G.tree(ctx, th, x + R.range(-r * 0.55, r * 0.55), y + R.range(-r * 0.35, r * 0.35), R, wi);
  } else if (t === 'city') {
    const n = wi === 4 ? 5 : 4;
    const blds = [];
    for (let k = 0; k < n; k++) blds.push([x + R.range(-r * 0.55, r * 0.5), y + R.range(-r * 0.3, r * 0.32)]);
    blds.sort((a, b) => a[1] - b[1]);
    for (const [bx, by] of blds) {
      const bw = R.range(6, 10), bh = R.range(10, wi === 4 ? 40 : 26), dd = bw * 0.45;
      const base = th.terrain.city;
      ctx.fillStyle = G.shade(base.side, -0.1);
      ctx.fillRect(bx, by - bh, bw, bh);
      ctx.fillStyle = G.shade(base.side, -0.35);
      ctx.beginPath(); ctx.moveTo(bx + bw, by - bh); ctx.lineTo(bx + bw + dd, by - bh - dd * 0.6); ctx.lineTo(bx + bw + dd, by - dd * 0.6); ctx.lineTo(bx + bw, by); ctx.fill();
      ctx.fillStyle = G.shade(base.top, 0.1);
      ctx.beginPath(); ctx.moveTo(bx, by - bh); ctx.lineTo(bx + dd, by - bh - dd * 0.6); ctx.lineTo(bx + bw + dd, by - bh - dd * 0.6); ctx.lineTo(bx + bw, by - bh); ctx.fill();
      // windows
      const wc = th.night > 0.2 ? [th.accent, '#ffd27a', '#7fe3ff'] : ['#bfe8ff', '#fff2c2'];
      for (let wy = by - bh + 3; wy < by - 2; wy += 3.4) for (let wx = bx + 1.5; wx < bx + bw - 1; wx += 2.6) {
        if (R() < (th.night > 0.2 ? 0.55 : 0.35)) { ctx.fillStyle = R.pick(wc); ctx.fillRect(wx, wy, 1.3, 1.6); }
      }
      if (wi === 4 && R() < 0.5) { ctx.fillStyle = R.pick(['#ff2d95', '#3dfcff', '#a66bff']); ctx.fillRect(bx, by - bh, bw, 1.4); }
    }
  } else if (t === 'resource') {
    if (wi === 1 || wi === 0) { // oil derrick
      ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x, y - 18); ctx.lineTo(x + 6, y + 4); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4); ctx.moveTo(x - 2, y - 11); ctx.lineTo(x + 2, y - 11); ctx.stroke();
      ctx.fillStyle = '#ffb340'; ctx.beginPath(); ctx.arc(x, y - 19, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(x + 6, y - 3, 8, 6); ctx.fillStyle = '#7a6a55'; ctx.fillRect(x + 6, y - 5, 8, 2);
    } else if (wi === 2) { // crystals
      for (let k = 0; k < 3; k++) {
        const cx = x + (k - 1) * 6, hh = 10 + k * 3 % 7;
        ctx.fillStyle = k % 2 ? '#bff3ff' : '#62d4f5';
        ctx.beginPath(); ctx.moveTo(cx - 3, y + 2); ctx.lineTo(cx, y - hh); ctx.lineTo(cx + 3, y + 2); ctx.fill();
      }
    } else if (wi === 3) { // lava pool
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
      g.addColorStop(0, '#fff0a0'); g.addColorStop(0.35, '#ff7a1f'); g.addColorStop(1, 'rgba(255,40,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    } else { // energy core
      ctx.fillStyle = '#1c1f38'; ctx.beginPath(); ctx.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(x, y - 8, 0, x, y - 8, 12);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#3dfcff'); g.addColorStop(1, 'rgba(61,252,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 12, y - 20, 24, 24);
    }
  } else if (t === 'beach') {
    if (wi === 0 && R() < 0.45) G.palm(ctx, x + R.range(-8, 8), y + R.range(-4, 4), R);
    if (wi === 2 && R() < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (t === 'plain') {
    if (wi === 1) { // dunes
      ctx.strokeStyle = 'rgba(150,90,30,0.45)'; ctx.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) { const yy = y + (k - 0.5) * 8 + R.range(-2, 2); ctx.beginPath(); ctx.moveTo(x - 12, yy); ctx.quadraticCurveTo(x, yy - 5, x + 12, yy); ctx.stroke(); }
    } else if (wi === 3 && R() < 0.45) { // lava cracks
      ctx.strokeStyle = '#ff6a1f'; ctx.lineWidth = 1.3; ctx.shadowColor = '#ff4a10'; ctx.shadowBlur = 6;
      ctx.beginPath(); let px = x - 10, py = y + R.range(-4, 4); ctx.moveTo(px, py);
      for (let k = 0; k < 4; k++) { px += 5; py += R.range(-4, 4); ctx.lineTo(px, py); }
      ctx.stroke(); ctx.shadowBlur = 0;
    } else if (wi === 4) { // roads/grid
      ctx.strokeStyle = 'rgba(120,140,255,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
    } else if (R() < 0.5) {
      ctx.fillStyle = 'rgba(30,80,30,0.35)';
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + R.range(-12, 12), y + R.range(-7, 7), 1.3, 0, Math.PI * 2); ctx.fill(); }
      if (wi === 0 && R() < 0.25) G.palm(ctx, x + R.range(-6, 6), y, R);
    }
  }
};

G.tree = function (ctx, th, x, y, R, wi) {
  const c = th.terrain.forest;
  if (wi === 2) { // pine with snow
    ctx.fillStyle = G.shade(c.top, -0.2);
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x, y - 14); ctx.lineTo(x + 5, y); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x - 2, y - 9); ctx.lineTo(x, y - 14); ctx.lineTo(x + 2, y - 9); ctx.fill();
  } else if (wi === 0) {
    G.palm(ctx, x, y, R);
  } else if (wi === 4) { // neon trees
    ctx.fillStyle = '#1a3d30'; ctx.fillRect(x - 0.6, y - 6, 1.2, 6);
    ctx.fillStyle = R() < 0.5 ? '#3dff8f' : '#2fd0a0';
    ctx.beginPath(); ctx.arc(x, y - 8, 4, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = G.shade(c.side, -0.2); ctx.fillRect(x - 0.8, y - 5, 1.6, 5);
    ctx.fillStyle = G.shade(c.top, R.range(-0.15, 0.1));
    ctx.beginPath(); ctx.arc(x, y - 7, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = G.shade(c.top, 0.25); ctx.beginPath(); ctx.arc(x - 1.5, y - 8.5, 1.8, 0, Math.PI * 2); ctx.fill();
  }
};

G.palm = function (ctx, x, y, R) {
  const lean = R.range(-4, 4);
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.3, y - 8, x + lean, y - 15); ctx.stroke();
  ctx.strokeStyle = '#1f8a4a'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
  const tx = x + lean, ty = y - 15;
  for (let k = 0; k < 6; k++) {
    const a = Math.PI + k * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 5, ty + Math.sin(a) * 5 - 2, tx + Math.cos(a) * 8, ty + Math.sin(a) * 4 + 3);
    ctx.stroke();
  }
};

G.countUnits = u => { let n = 0; for (const k in u) n += u[k]; return n; };
G.topUnit = u => { let best = null; for (const k of G.UNIT_ORDER) if (u[k] > 0) best = k; return best; };
