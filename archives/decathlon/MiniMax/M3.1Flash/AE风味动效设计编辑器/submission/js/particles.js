/* ============================================================
   particles.js — 粒子系统：发射源 / 物理 / 空间场 / 碰撞 / 拖尾
   模拟是确定性的：同一参数与同一时间点结果一致（可重复取样）
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const PT = AE.particles = {};

  const STEP = 1 / 60;
  const cache = new Map();

  PT.reset = function () { cache.clear(); };

  function hashParams(layer, ctx) {
    const p = layer.props;
    const g = p.pGravity ? p.pGravity.v : 900;
    const r = p.pRate ? p.pRate.v : 120;
    const parts = [layer.id, r, p.pLife ? p.pLife.v : 1, p.pSpeed ? p.pSpeed.v : 0,
    p.pSpread ? p.pSpread.v : 0, p.pDrag ? p.pDrag.v : 0, g,
    p.pSeed ? p.pSeed.v : 0, p.pEmitter ? p.pEmitter.v : 'point',
    ctx.sourceHash || ''];
    return U.hashStr(parts.join('|')).toString(36);
  }

  /**
   * 计算粒子系统在某时刻的状态
   * ctx: { getProp(layer,name,t), source(mesh|curve), collider(mesh), time }
   */
  PT.build = function (layer, comp, time, ctx) {
    const key = hashParams(layer, ctx);
    let sim = cache.get(layer.id);
    if (!sim || sim.key !== key) {
      sim = { key, frames: [], step: 0, meta: [], max: 2000 };
      cache.set(layer.id, sim);
    }
    const targetStep = Math.max(0, Math.round(time / STEP));
    // 前进模拟（只前进，不回退 → 取样不会重复触发事件）
    while (sim.step <= targetStep) {
      stepSim(sim, layer, comp, ctx, sim.step * STEP);
      sim.step++;
    }
    return sampleSim(sim, time, layer, ctx);
  };

  function getP(layer, name, t, ctx) {
    if (ctx && ctx.getProp) return ctx.getProp(layer, name, t);
    const pr = layer.props[name];
    return pr ? pr.v : 0;
  }

  function stepSim(sim, layer, comp, ctx, t) {
    const rate = getP(layer, 'pRate', t, ctx);
    const lifeBase = getP(layer, 'pLife', t, ctx);
    const speed = getP(layer, 'pSpeed', t, ctx);
    const spread = getP(layer, 'pSpread', t, ctx);
    const seed = getP(layer, 'pSeed', t, ctx);
    const emitterType = getP(layer, 'pEmitter', t, ctx);
    const rng = U.mulberry32(U.hashStr(layer.id + '|' + seed) ^ Math.round(t * 1000));

    // 发射
    let acc = rate * STEP;
    let emitCount = 0;
    const source = ctx.source ? ctx.source(t) : null;
    if (source && source.points && source.points.length) {
      while (acc >= 1 && sim.meta.length < sim.max) {
        acc -= 1; emitCount++;
        const p = sampleSource(source, rng, emitterType);
        if (!p) break;
        const jitter = (rng() - 0.5) * spread * Math.PI / 180;
        const baseDir = p.dir || [0, 0, 1];
        let dir = rotateAroundY(baseDir, jitter);
        if (p.cone) {
          const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
          dir = normalize(add(dir, [Math.cos(a) * r * 0.9, (rng() - 0.5) * r * 0.9, Math.sin(a) * r * 0.9]));
        }
        const sp = speed * (0.55 + rng() * 0.9);
        const life = lifeBase * (0.6 + rng() * 0.8);
        sim.meta.push({
          born: sim.step, life, size: getP(layer, 'pSize', t, ctx), sizeEnd: getP(layer, 'pSizeEnd', t, ctx),
          r1: rng(), r2: rng(), r3: rng(), r4: rng(), sp
        });
      }
    }

    // 更新
    const count = sim.meta.length;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const alive = new Uint8Array(count);
    const prev = sim.frames.length ? sim.frames[sim.frames.length - 1] : null;
    const prevVel = sim.lastVel || null;

    const gravity = getP(layer, 'pGravity', t, ctx);
    const drag = getP(layer, 'pDrag', t, ctx);
    const collider = ctx.collider ? ctx.collider(t) : null;
    const fields = ctx.fields || [];
    const trailLen = getP(layer, 'pTrail', t, ctx);

    for (let i = 0; i < count; i++) {
      const m = sim.meta[i];
      const age = sim.step - m.born;
      if (age < 0) { alive[i] = 0; continue; }
      if (age * STEP > m.life) { alive[i] = 0; continue; }
      let px, py, pz, vx, vy, vz;
      if (prev && i * 3 + 2 < prev.length) {
        px = prev[i * 3]; py = prev[i * 3 + 1]; pz = prev[i * 3 + 2];
        vx = prevVel ? prevVel[i * 3] : 0; vy = prevVel ? prevVel[i * 3 + 1] : 0; vz = prevVel ? prevVel[i * 3 + 2] : 0;
      } else {
        // 新发射
        const src = sampleSource(source, U.mulberry32(U.hashStr(layer.id + '|' + seed + '|' + i)), emitterType);
        if (!src) { alive[i] = 0; continue; }
        px = src.point[0]; py = src.point[1]; pz = src.point[2];
        const dir = src.dir || [0, 0, 1];
        vx = dir[0] * m.sp; vy = dir[1] * m.sp; vz = dir[2] * m.sp;
      }
      // 力
      let ax = 0, ay = -gravity, az = 0;
      for (const f of fields) {
        const d = AE.fields.sample(f, [px, py, pz], ctx);
        ax += d[0]; ay += d[1]; az += d[2];
      }
      vx += ax * STEP; vy += ay * STEP; vz += az * STEP;
      const damp = Math.max(0, 1 - drag * STEP);
      vx *= damp; vy *= damp; vz *= damp;
      let nx = px + vx * STEP, ny = py + vy * STEP, nz = pz + vz * STEP;

      // 碰撞
      if (collider && collider.positions && collider.positions.length) {
        const dx = nx - px, dy = ny - py, dz = nz - pz;
        const dlen = Math.hypot(dx, dy, dz);
        if (dlen > 1e-6) {
          const hit = AE.geom.raycast(collider, [px, py, pz], [dx / dlen, dy / dlen, dz / dlen]);
          if (hit && hit.t <= dlen) {
            const n = hit.normal;
            const vn = vx * n[0] + vy * n[1] + vz * n[2];
            if (vn < 0) {
              vx = (vx - n[0] * vn) * 0.45 - n[0] * vn * 0.55;
              vy = (vy - n[1] * vn) * 0.45 - n[1] * vn * 0.55;
              vz = (vz - n[2] * vn) * 0.45 - n[2] * vn * 0.55;
            }
            nx = hit.point[0] + n[0] * 1.2;
            ny = hit.point[1] + n[1] * 1.2;
            nz = hit.point[2] + n[2] * 1.2;
            m.hit = true;
          }
        }
      }
      pos[i * 3] = nx; pos[i * 3 + 1] = ny; pos[i * 3 + 2] = nz;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      alive[i] = 1;
    }
    sim.frames.push(pos);
    sim.lastVel = vel;
    sim.alive = alive;
  }

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function rotateAroundY(v, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  }

  function sampleSource(source, rng, type) {
    if (!source) return null;
    if (source.points && source.points.length) {
      if (type === 'surface' && source.triangles) {
        const tris = source.triangles;
        const total = source.totalArea || 1;
        let r = rng() * total;
        for (let i = 0; i < tris.length; i += 3) {
          const a = tris[i], b = tris[i + 1], c = tris[i + 2];
          const ax = source.positions[a * 3], ay = source.positions[a * 3 + 1], az = source.positions[a * 3 + 2];
          const bx = source.positions[b * 3], by = source.positions[b * 3 + 1], bz = source.positions[b * 3 + 2];
          const cx = source.positions[c * 3], cy = source.positions[c * 3 + 1], cz = source.positions[c * 3 + 2];
          const area = triArea(ax, ay, az, bx, by, bz, cx, cy, cz);
          if (r <= area) {
            let u = rng(), v = rng();
            if (u + v > 1) { u = 1 - u; v = 1 - v; }
            const px = ax + (bx - ax) * u + (cx - ax) * v;
            const py = ay + (by - ay) * u + (cy - ay) * v;
            const pz = az + (bz - az) * u + (cz - az) * v;
            let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
            let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            return { point: [px, py, pz], dir: [nx, ny, nz], cone: true };
          }
          r -= area;
        }
        return null;
      }
      // 点 / 曲线
      if (type === 'curve' && source.points.length > 1) {
        const seg = source.points.length - 1;
        const idx = Math.min(seg - 1, Math.floor(rng() * seg));
        const f = rng();
        const a = source.points[idx], b = source.points[idx + 1];
        return {
          point: [U.lerp(a[0], b[0], f), U.lerp(a[1], b[1], f), U.lerp(a[2] || 0, b[2] || 0, f)],
          dir: source.dirs ? source.dirs[idx] : [0, 0, 1], cone: true
        };
      }
      const p = source.points[0];
      return { point: [p[0], p[1], p[2] || 0], dir: source.dirs ? source.dirs[0] : [0, 0, 1], cone: true };
    }
    return null;
  }
  function triArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    return Math.hypot(nx, ny, nz) * 0.5;
  }

  function sampleSim(sim, time, layer, ctx) {
    const f = time / STEP;
    const i0 = Math.max(0, Math.min(sim.frames.length - 1, Math.floor(f)));
    const i1 = Math.min(sim.frames.length - 1, i0 + 1);
    const a = sim.frames[i0] || new Float32Array(0);
    const b = sim.frames[i1] || a;
    const frac = U.clamp(f - i0, 0, 1);
    const count = sim.meta.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);
    const sizes = new Float32Array(count);
    const alive = new Uint8Array(count);
    const c0 = U.color.hex2rgb(getP(layer, 'pColor', time, ctx));
    const c1 = U.color.hex2rgb(getP(layer, 'pColorEnd', time, ctx));
    const op = getP(layer, 'pOpacity', time, ctx) / 100;
    for (let i = 0; i < count; i++) {
      const m = sim.meta[i];
      const age = (i0 + frac) * STEP - m.born * STEP;
      if (age < 0) continue;
      const lifeT = U.clamp(age / m.life, 0, 1);
      const ax = a[i * 3], ay = a[i * 3 + 1], az = a[i * 3 + 2];
      const bx = b[i * 3] !== undefined ? b[i * 3] : ax;
      const by = b[i * 3 + 1] !== undefined ? b[i * 3 + 1] : ay;
      const bz = b[i * 3 + 2] !== undefined ? b[i * 3 + 2] : az;
      positions[i * 3] = U.lerp(ax, bx, frac);
      positions[i * 3 + 1] = U.lerp(ay, by, frac);
      positions[i * 3 + 2] = U.lerp(az, bz, frac);
      const col = U.color.mix(c0, c1, lifeT);
      colors[i * 4] = col[0]; colors[i * 4 + 1] = col[1]; colors[i * 4 + 2] = col[2];
      colors[i * 4 + 3] = op * (1 - Math.pow(lifeT, 1.6));
      sizes[i] = U.lerp(m.size, m.sizeEnd, lifeT);
      alive[i] = 1;
    }
    // 拖尾：取历史帧
    const trailLen = getP(layer, 'pTrail', time, ctx);
    const trails = [];
    if (trailLen > 0) {
      const steps = Math.max(1, Math.round(trailLen / STEP));
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue;
        const pts = [];
        for (let k = 0; k <= steps; k++) {
          const fi = i0 - k;
          if (fi < 0 || fi >= sim.frames.length) break;
          const fr = sim.frames[fi];
          if (!fr || fr[i * 3] === undefined) break;
          const m = sim.meta[i];
          if ((fi - m.born) * STEP < 0) break;
          pts.push([fr[i * 3], fr[i * 3 + 1], fr[i * 3 + 2]]);
        }
        if (pts.length > 1) trails.push({ pts, particle: i });
      }
    }
    return { count, positions, colors, sizes, alive, trails, meta: sim.meta };
  }
})(window);
