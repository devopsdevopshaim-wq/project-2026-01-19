'use strict';
/* ===== Neon Warfront – combat ===== */

G.mods = function (match, fi) {
  if (fi === 0) {
    const has = id => G.meta.has(id);
    return {
      atk: 1 + (has('atk2') ? 0.2 : has('atk1') ? 0.1 : 0),
      hp: 1 + (has('def2') ? 0.2 : has('def1') ? 0.1 : 0)
    };
  }
  if (fi < 0) return { atk: 1, hp: 1 };
  const d = { easy: -0.12, normal: 0, hard: 0.12 }[match.diff] || 0;
  const b = 1 + match.world * 0.03 + d;
  return { atk: b, hp: b };
};

G.cloneU = u => { const o = {}; for (const k in u) if (u[k] > 0) o[k] = u[k]; return o; };

G.unitPower = function (units, mods) {
  let a = 0, h = 0;
  for (const k in units) { a += units[k] * G.UNITS[k].atk * mods.atk; h += units[k] * G.UNITS[k].hp * mods.hp; }
  return { a, h, p: Math.sqrt(a * h) };
};

G.defBonus = function (match, tid, attUnits) {
  const T = G.map.terrs[tid], st = match.terr[tid];
  let fort = st.fort * 0.25;
  if (attUnits.art) fort *= Math.max(0.2, 1 - attUnits.art * 0.15);
  return 1 + G.TTYPES[T.type].def + fort;
};

G._damage = function (X, Y, mul) {
  const pools = {}; let tot = 0;
  for (const k in Y) { const c = G.UNITS[k].cls; const hp = Y[k] * G.UNITS[k].hp; pools[c] = (pools[c] || 0) + hp; tot += hp; }
  const out = {};
  if (!tot) return out;
  for (const k in X) {
    const u = G.UNITS[k], dmg = X[k] * u.atk * mul;
    for (const c in pools) out[c] = (out[c] || 0) + dmg * (pools[c] / tot) * G.COUNTER[u.cls][c];
  }
  return out;
};

G._apply = function (Y, dmg, hpMul, rand, extra) {
  const loss = {};
  const types = Object.keys(Y).sort((a, b) => G.UNITS[a].cost - G.UNITS[b].cost);
  for (const c in dmg) {
    let d = dmg[c];
    for (const t of types) {
      if (G.UNITS[t].cls !== c || d <= 0) continue;
      const hp = G.UNITS[t].hp * hpMul * (extra && extra[t] || 1);
      let kills = Math.min(Y[t], Math.floor(d / hp));
      d -= kills * hp;
      if (kills < Y[t] && rand() < d / hp) { kills++; d = 0; }
      if (kills > 0) { Y[t] -= kills; loss[t] = (loss[t] || 0) + kills; }
    }
  }
  for (const t in Y) if (Y[t] <= 0) delete Y[t];
  return loss;
};

G.resolveBattle = function (match, attUnits, attOwner, tid, rand = Math.random) {
  const st = match.terr[tid];
  const A = G.cloneU(attUnits), D = G.cloneU(st.units);
  const am = G.mods(match, attOwner), dm = G.mods(match, st.owner);
  const bonus = G.defBonus(match, tid, A);
  const T = G.map.terrs[tid];
  const extraD = (T.type === 'mountain' || T.type === 'city') ? { commando: 1.4 } : null;
  const rounds = [];
  const K = 0.55;
  for (let r = 0; r < 6; r++) {
    if (!G.countUnits(A) || !G.countUnits(D)) break;
    const dA = G._damage(A, D, am.atk * K * (0.8 + rand() * 0.4));
    const dD = G._damage(D, A, dm.atk * K * 1.05 * (0.8 + rand() * 0.4));
    const lossD = G._apply(D, dA, dm.hp * bonus, rand, extraD);
    const lossA = G._apply(A, dD, am.hp, rand);
    rounds.push({ lossA, lossD, A: G.cloneU(A), D: G.cloneU(D) });
  }
  const aLeft = G.countUnits(A), dLeft = G.countUnits(D);
  return { rounds, A, D, win: aLeft > 0 && dLeft === 0, bonus };
};

G.winChance = function (match, attUnits, attOwner, tid, n = 160) {
  if (!G.countUnits(match.terr[tid].units)) return 1;
  let w = 0;
  for (let i = 0; i < n; i++) if (G.resolveBattle(match, attUnits, attOwner, tid).win) w++;
  return w / n;
};

/* ===== cinematic battle scene ===== */
G.BattleScene = {
  play(opts) {
    if (G.ctl.rend && G.ctl.rend.battle) return G.ctl.rend.battle(opts);
    return new Promise(resolve => {
      const ov = document.getElementById('battle');
      const cv = document.getElementById('battle-cv');
      ov.classList.add('show');
      const ctx = cv.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let W, H;
      const resize = () => { W = ov.clientWidth; H = ov.clientHeight; cv.width = W * dpr; cv.height = H * dpr; };
      resize();
      const th = G.WORLDS[opts.world];
      const R = G.rng((Math.random() * 1e9) | 0);
      // backdrop silhouettes
      const sil = [];
      for (let x = 0; x < 1.2; x += 0.035) sil.push([x, R.range(0.05, 0.18) * (opts.world === 4 ? 1.8 : 1), R()]);
      const res = opts.result;
      const sprites = [];
      const mk = (side, units) => {
        const list = [];
        const types = G.UNIT_ORDER.filter(t => units[t] > 0);
        const ground = types.filter(t => G.UNITS[t].cls !== 'air'), air = types.filter(t => G.UNITS[t].cls === 'air');
        const lay = (arr, y0, y1) => arr.forEach((t, ri) => {
          const k = Math.min(units[t], 7);
          const y = arr.length > 1 ? G.lerp(y0, y1, ri / (arr.length - 1)) : (y0 + y1) / 2;
          for (let i = 0; i < k; i++) {
            const fx = 0.06 + i * 0.05 + (ri % 2) * 0.025;
            list.push({ side, t, x: side === 'A' ? fx : 1 - fx, y: y + R.range(-0.015, 0.015), alive: true, die: 0, ph: R() * 6, idx: i });
          }
        });
        lay(ground, 0.62, 0.84);
        lay(air, 0.3, 0.42);
        return list;
      };
      sprites.push(...mk('A', opts.att.units), ...mk('D', opts.def.units));
      const parts = [], shots = [];
      let shake = 0;
      const startHP = { A: G.unitPower(opts.att.units, { atk: 1, hp: 1 }).h, D: G.unitPower(opts.def.units, { atk: 1, hp: 1 }).h };
      let cur = { A: G.cloneU(opts.att.units), D: G.cloneU(opts.def.units) };
      const RD = 950;
      const t0 = performance.now();
      const total = res.rounds.length * RD + 400;
      let applied = -1, done = false, endT = 0;
      const skip = document.getElementById('battle-skip');
      const finish = () => {
        if (done) return; done = true;
        ov.classList.remove('show');
        skip.onclick = null;
        window.removeEventListener('resize', resize);
        resolve();
      };
      skip.onclick = () => { G.sfx.click(); finish(); };
      window.addEventListener('resize', resize);
      document.getElementById('battle-title').textContent = `${opts.att.name}  ⚔  ${opts.def.name}`;
      document.getElementById('battle-place').textContent = opts.place;

      const sx = s => s.x * W, sy = s => s.y * H;
      const syncVisible = side => {
        const u = cur[side];
        for (const s of sprites) {
          if (s.side !== side || !s.alive) continue;
          const vis = Math.min(u[s.t] || 0, 7);
          if (s.idx >= vis) { s.alive = false; s.die = performance.now(); boomAt(sx(s), sy(s), 1); }
        }
      };
      const boomAt = (x, y, big) => {
        shake = Math.min(14, shake + 4 * big);
        for (let i = 0; i < 16 * big; i++) {
          const a = R() * Math.PI * 2, v = R.range(40, 220) * big;
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: R.range(0.4, 0.9), t: 0, c: R.pick(['#ffe08a', '#ff7a2b', '#ff3b1f', '#fff']), s: R.range(2, 5) });
        }
        for (let i = 0; i < 5; i++) parts.push({ x, y, vx: R.range(-30, 30), vy: R.range(-60, -20), life: 1.4, t: 0, c: 'smoke', s: R.range(10, 22) });
        if (Math.random() < 0.6) G.sfx.boom(0.5);
      };

      const loop = now => {
        if (done) return;
        const el = now - t0;
        const dt = 1 / 60;
        const round = Math.floor(el / RD);
        const inR = el % RD;
        // fire shots during first 60% of round
        if (round < res.rounds.length && inR < RD * 0.65 && Math.random() < 0.55) {
          const side = Math.random() < 0.5 ? 'A' : 'D';
          const shooters = sprites.filter(s => s.side === side && s.alive);
          const targets = sprites.filter(s => s.side !== side && s.alive);
          if (shooters.length && targets.length) {
            const a = R.pick(shooters), b = R.pick(targets);
            const air = G.UNITS[a.t].cls === 'air';
            shots.push({ x0: sx(a), y0: sy(a), x1: sx(b) + R.range(-14, 14), y1: sy(b) + R.range(-10, 10), t: 0, d: air || a.t === 'art' ? 0.45 : 0.22, col: side === 'A' ? opts.att.color : opts.def.color, arc: a.t === 'art' ? 1 : 0, big: ['tank', 'art', 'mech', 'jet', 'heli'].includes(a.t) });
            a.flash = now;
            if (Math.random() < 0.5) G.sfx.shot();
          }
        }
        if (round > applied && inR > RD * 0.68 && round < res.rounds.length) {
          applied = round;
          cur = { A: res.rounds[round].A, D: res.rounds[round].D };
          syncVisible('A'); syncVisible('D');
        }
        if (el > total && !endT) {
          endT = now;
          const b = document.getElementById('battle-banner');
          b.textContent = opts.banner; b.className = 'battle-banner show ' + (opts.good ? 'good' : 'bad');
          opts.good ? G.sfx.win() : G.sfx.lose();
        }
        if (endT && now - endT > 1400) { document.getElementById('battle-banner').className = 'battle-banner'; finish(); return; }

        // ---- draw ----
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.direction = 'ltr';
        const shx = (Math.random() - 0.5) * shake, shy = (Math.random() - 0.5) * shake;
        shake *= 0.9;
        ctx.save(); ctx.translate(shx, shy);
        const sk = ctx.createLinearGradient(0, 0, 0, H * 0.6);
        th.sky.forEach((c, i) => sk.addColorStop(i / (th.sky.length - 1), c));
        ctx.fillStyle = sk; ctx.fillRect(-20, -20, W + 40, H + 40);
        // sun
        const sunY = H * 0.42, sunX = W * 0.5;
        const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.3);
        sg.addColorStop(0, G.alpha(th.sky[4], 0.95)); sg.addColorStop(0.25, G.alpha(th.sky[3], 0.5)); sg.addColorStop(1, G.alpha(th.sky[3], 0));
        ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
        // silhouettes
        ctx.fillStyle = G.shade(th.sky[0], -0.2, 0.9);
        ctx.beginPath(); ctx.moveTo(0, H * 0.56);
        for (const [x, h, k] of sil) {
          const X = x * W, top = H * (0.56 - h);
          if (opts.world >= 3 || k < 0.4) { ctx.lineTo(X, H * 0.56); ctx.lineTo(X, top); ctx.lineTo(X + W * 0.028, top); ctx.lineTo(X + W * 0.028, H * 0.56); }
          else ctx.lineTo(X + W * 0.017, top);
        }
        ctx.lineTo(W, H * 0.56); ctx.closePath(); ctx.fill();
        // ground
        const tc = th.terrain[G.map.terrs[opts.tid].type] || th.terrain.plain;
        const gg = ctx.createLinearGradient(0, H * 0.55, 0, H);
        gg.addColorStop(0, G.shade(tc.top, -0.25)); gg.addColorStop(1, G.shade(tc.side, -0.5));
        ctx.fillStyle = gg; ctx.fillRect(-20, H * 0.555, W + 40, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
        for (let i = 0; i < 10; i++) { const y = H * 0.56 + (i * i) * H * 0.0045; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        // fort wall
        if (opts.fort > 0) {
          ctx.fillStyle = '#5a5548';
          for (let i = 0; i < 6; i++) {
            const y = H * (0.6 + i * 0.045);
            for (let l = 0; l < opts.fort; l++) { ctx.beginPath(); ctx.ellipse(W * (0.66 - l * 0.018), y, W * 0.012, H * 0.013, 0, 0, Math.PI * 2); ctx.fill(); }
          }
        }
        // sprites
        const S = Math.min(W, H) * 0.06;
        const sorted = sprites.slice().sort((a, b) => a.y - b.y);
        for (const s of sorted) {
          let x = sx(s), y = sy(s);
          const cls = G.UNITS[s.t].cls;
          const bob = cls === 'air' ? Math.sin(now / 300 + s.ph) * 6 : Math.sin(now / 500 + s.ph) * 1.2;
          let a = 1;
          if (!s.alive) { const k = (now - s.die) / 700; if (k > 1) continue; a = 1 - k; y += k * 20; }
          const col = s.side === 'A' ? opts.att.color : opts.def.color;
          const sz = S * (s.t === 'mech' ? 1.5 : cls === 'armor' || cls === 'art' ? 1.2 : 1);
          ctx.save();
          ctx.globalAlpha = a;
          ctx.translate(x, y + bob);
          // shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.ellipse(0, sz * 0.5 + (cls === 'air' ? 40 : 0), sz * 0.5, sz * 0.12, 0, 0, Math.PI * 2); ctx.fill();
          if (s.side === 'D') ctx.scale(-1, 1);
          ctx.scale(sz / 24, sz / 24); ctx.translate(-12, -12);
          ctx.shadowColor = col; ctx.shadowBlur = 14;
          ctx.fillStyle = s.alive ? col : '#ff5a1f';
          ctx.fill(G.path(s.t));
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; ctx.stroke(G.path(s.t));
          if (s.flash && now - s.flash < 80) { ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(24, 12, 4, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
        // unit count labels
        ctx.font = `800 ${Math.round(S * 0.32)}px Rubik, sans-serif`; ctx.textAlign = 'center';
        for (const side of ['A', 'D']) {
          const u = cur[side];
          const seen = {};
          for (const s of sprites) if (s.side === side && s.idx === 0 && !seen[s.t]) {
            seen[s.t] = 1;
            const n = u[s.t] || 0;
            ctx.fillStyle = n ? '#fff' : 'rgba(255,255,255,0.35)';
            const lx = side === 'A' ? sx(s) - S * 0.6 : sx(s) + S * 0.6;
            ctx.fillText('×' + n, lx, sy(s) + S * 0.85);
          }
        }
        // shots
        for (let i = shots.length - 1; i >= 0; i--) {
          const p = shots[i];
          p.t += dt / p.d;
          if (p.t >= 1) { boomAt(p.x1, p.y1, p.big ? 0.7 : 0.35); shots.splice(i, 1); continue; }
          const u = p.t;
          const x = G.lerp(p.x0, p.x1, u), y = G.lerp(p.y0, p.y1, u) - (p.arc ? Math.sin(u * Math.PI) * H * 0.25 : 0);
          const u2 = Math.max(0, u - 0.08);
          const x2 = G.lerp(p.x0, p.x1, u2), y2 = G.lerp(p.y0, p.y1, u2) - (p.arc ? Math.sin(u2 * Math.PI) * H * 0.25 : 0);
          ctx.strokeStyle = '#fff8d0'; ctx.lineWidth = p.big ? 3 : 1.8;
          ctx.shadowColor = p.col; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // particles
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.t += dt; if (p.t > p.life) { parts.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.c === 'smoke' ? -10 : 300) * dt;
          const k = 1 - p.t / p.life;
          if (p.c === 'smoke') { ctx.fillStyle = `rgba(40,35,45,${0.35 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (2 - k), 0, Math.PI * 2); ctx.fill(); }
          else { ctx.fillStyle = G.alpha(p.c, k); ctx.beginPath(); ctx.arc(p.x, p.y, p.s * k, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
        // HUD bars
        const hpA = G.unitPower(cur.A, { atk: 1, hp: 1 }).h / (startHP.A || 1);
        const hpD = G.unitPower(cur.D, { atk: 1, hp: 1 }).h / (startHP.D || 1);
        const bw = W * 0.36, by = 70;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W * 0.05, by, bw, 10); ctx.fillRect(W * 0.95 - bw, by, bw, 10);
        ctx.fillStyle = opts.att.color; ctx.fillRect(W * 0.05, by, bw * hpA, 10);
        ctx.fillStyle = opts.def.color; ctx.fillRect(W * 0.95 - bw * hpD, by, bw * hpD, 10);
        ctx.font = '700 13px Rubik, sans-serif'; ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.fillText(opts.att.name + ' (תוקף)', W * 0.05, by - 10);
        ctx.textAlign = 'right'; ctx.fillText(opts.def.name + ' (מגן)', W * 0.95, by - 10);
        // letterbox
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 24); ctx.fillRect(0, H - 24, W, 24);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }
};
