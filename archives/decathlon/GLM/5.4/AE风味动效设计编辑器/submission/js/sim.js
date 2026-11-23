/* ============================================================
   sim.js — 粒子：发射器、力场、空间场、网格碰撞、拖尾、次级发射
   确定性：固定步长从入点开始模拟，任意跳转结果一致
   ============================================================ */
(function (global) {
  'use strict';

  const DT = 1 / 60;
  const cache = new Map();

  function particleParams(comp, layer, state, t) {
    const P = (path, d) => { const v = state.getProp(layer, path, t); return v === undefined || v === null ? d : v; };
    const p = layer.particles;
    return {
      seed: P(['particles', 'seed'], 1),
      rate: P(['particles', 'rate'], 120),
      lifetime: P(['particles', 'lifetime'], 1.5),
      lifetimeVar: P(['particles', 'lifetimeVar'], 0.4),
      speed: P(['particles', 'speed'], 200),
      speedVar: P(['particles', 'speedVar'], 0.5),
      size: P(['particles', 'size'], 6),
      sizeVar: P(['particles', 'sizeVar'], 0.4),
      sizeEnd: P(['particles', 'sizeEnd'], 0.2),
      color: P(['particles', 'color'], '#ffcf7a'),
      colorEnd: P(['particles', 'colorEnd'], '#ff3300'),
      opacity: P(['particles', 'opacity'], 1),
      opacityEnd: P(['particles', 'opacityEnd'], 0),
      emitterType: p.emitter.type,
      emitterSource: p.emitter.source,
      radius: P(['particles', 'emitter', 'radius'], 10),
      spread: P(['particles', 'emitter', 'spread'], 0.6),
      dir: P(['particles', 'emitter', 'dir'], [0, -1, 0]),
      alongNormal: P(['particles', 'emitter', 'alongNormal'], 1),
      gravity: P(['particles', 'forces', 'gravity'], [0, 500, 0]),
      drag: P(['particles', 'forces', 'drag'], 0.6),
      wind: P(['particles', 'forces', 'wind'], [0, 0, 0]),
      fieldIds: p.forces.fields || [],
      collisionOn: p.collision.on,
      collisionLayers: p.collision.layers || [],
      bounce: P(['particles', 'collision', 'bounce'], 0.55),
      friction: P(['particles', 'collision', 'friction'], 0.35),
      colRadius: P(['particles', 'collision', 'radius'], 3),
      hitColor: P(['particles', 'collision', 'onHit', 'color'], '#ffffff'),
      hitLife: P(['particles', 'collision', 'onHit', 'lifetime'], 0.8),
      hitEmit: Math.round(P(['particles', 'collision', 'onHit', 'emit'], 0)),
      trailOn: p.trail.on !== false,
      trailLen: P(['particles', 'trail', 'length'], 0.18),
      trailWidth: P(['particles', 'trail', 'width'], 1.6),
      trailFade: P(['particles', 'trail', 'fade'], 1),
      maxParticles: p.maxParticles || 4000
    };
  }

  /* ---------------- 发射几何 ---------------- */
  function buildEmitterData(comp, layer, state, t) {
    const p = particleParams(comp, layer, state, t);
    const src = comp.layers.find(l => l.id === p.emitterSource);
    const data = { type: p.emitterType, pos: [0, 0, 0], dir: [0, -1, 0], tris: null, path: null, grid: null, src };
    const wm = state.worldMatrix(layer);
    data.pos = [wm[12], wm[13], wm[14]];
    if (p.emitterType === 'surface' || p.emitterType === 'volume') {
      if (src && src.type === 'solid') {
        const m = NODES.solidMesh(comp, src, state, t);
        if (m) {
          const sw = state.worldMatrix(src);
          const verts = new Float32Array(m.verts.length);
          for (let i = 0; i < m.verts.length; i += 3) {
            const x = m.verts[i], y = m.verts[i + 1], z = m.verts[i + 2];
            verts[i] = sw[0] * x + sw[4] * y + sw[8] * z + sw[12];
            verts[i + 1] = sw[1] * x + sw[5] * y + sw[9] * z + sw[13];
            verts[i + 2] = sw[2] * x + sw[6] * y + sw[10] * z + sw[14];
          }
          data.verts = verts;
          data.idx = m.idx;
          // 面积权重
          const areas = [];
          let total = 0;
          for (let i = 0; i < m.idx.length; i += 3) {
            const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3;
            const ax = verts[a], ay = verts[a + 1], az = verts[a + 2];
            const bx = verts[b], by = verts[b + 1], bz = verts[b + 2];
            const cx = verts[c], cy = verts[c + 1], cz = verts[c + 2];
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            const ar = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
            areas.push(ar); total += ar;
          }
          data.areas = areas; data.totalArea = total;
          data.grid = buildGrid(verts, m.idx, 24);
        }
      } else if (src && src.type === 'shape') {
        const contours = R2.shapeLayerPaths(comp, src, state, t);
        const m = state.worldMatrix(src);
        const pts = [];
        for (const c of contours) {
          const f = PT.flattenContour(c, 1.0);
          for (const p of f) {
            const x = p[0], y = p[1];
            pts.push([m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13], m[2] * x + m[6] * y + m[14]]);
          }
        }
        data.points = pts;
      }
    } else if (p.emitterType === 'curve') {
      if (src && src.type === 'shape') {
        const contours = R2.shapeLayerPaths(comp, src, state, t);
        const m = state.worldMatrix(src);
        const pts = [];
        for (const c of contours) {
          const f = PT.flattenContour(c, 1.5);
          for (const q of f) pts.push([m[0] * q[0] + m[4] * q[1] + m[12], m[1] * q[0] + m[5] * q[1] + m[13], m[2] * q[0] + m[6] * q[1] + m[14]]);
        }
        data.points = pts;
      }
    }
    return data;
  }

  function buildGrid(verts, idx, cell) {
    const map = new Map();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const x0 = Math.min(verts[a], verts[b], verts[c]), x1 = Math.max(verts[a], verts[b], verts[c]);
      const y0 = Math.min(verts[a + 1], verts[b + 1], verts[c + 1]), y1 = Math.max(verts[a + 1], verts[b + 1], verts[c + 1]);
      const z0 = Math.min(verts[a + 2], verts[b + 2], verts[c + 2]), z1 = Math.max(verts[a + 2], verts[b + 2], verts[c + 2]);
      for (let x = Math.floor(x0 / cell); x <= Math.floor(x1 / cell); x++)
        for (let y = Math.floor(y0 / cell); y <= Math.floor(y1 / cell); y++)
          for (let z = Math.floor(z0 / cell); z <= Math.floor(z1 / cell); z++) {
            const k = key(x, y, z);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(i);
          }
    }
    return { map, cell, key };
  }

  /* ---------------- 碰撞 ---------------- */
  function collide(particle, colMeshes, radius, bounce, friction) {
    for (const cm of colMeshes) {
      if (!cm.grid) continue;
      const cell = cm.grid.cell;
      const cx = Math.floor(particle.pos[0] / cell), cy = Math.floor(particle.pos[1] / cell), cz = Math.floor(particle.pos[2] / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const list = cm.grid.map.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz));
        if (!list) continue;
        for (const ti of list) {
          const a = ti * 3, b = ti + 3, c = ti + 6;
          const A = [cm.verts[a], cm.verts[a + 1], cm.verts[a + 2]];
          const B = [cm.verts[b], cm.verts[b + 1], cm.verts[b + 2]];
          const C = [cm.verts[c], cm.verts[c + 1], cm.verts[c + 2]];
          const r = closestPointTri(particle.pos, A, B, C);
          const d = Math.hypot(particle.pos[0] - r[0], particle.pos[1] - r[1], particle.pos[2] - r[2]);
          if (d < radius) {
            // 法线
            const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
            const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            // 推离表面
            const push = radius - d + 0.01;
            particle.pos[0] += nx * push; particle.pos[1] += ny * push; particle.pos[2] += nz * push;
            const vn = particle.vel[0] * nx + particle.vel[1] * ny + particle.vel[2] * nz;
            if (vn < 0) {
              const tx = particle.vel[0] - vn * nx, ty = particle.vel[1] - vn * ny, tz = particle.vel[2] - vn * nz;
              particle.vel[0] = tx * (1 - friction) - vn * nx * bounce;
              particle.vel[1] = ty * (1 - friction) - vn * ny * bounce;
              particle.vel[2] = tz * (1 - friction) - vn * nz * bounce;
              if (!particle.hit) {
                particle.hit = true;
                particle.hitNormal = [nx, ny, nz];
              }
            }
          }
        }
      }
    }
  }
  function closestPointTri(p, a, b, c) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const d1 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2];
    const d2 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2];
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
    const d3 = ab[0] * bp[0] + ab[1] * bp[1] + ab[2] * bp[2];
    const d4 = ac[0] * bp[0] + ac[1] * bp[1] + ac[2] * bp[2];
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
    const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const d5 = ab[0] * cp[0] + ab[1] * cp[1] + ab[2] * cp[2];
    const d6 = ac[0] * cp[0] + ac[1] * cp[1] + ac[2] * cp[2];
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
    const den = 1 / (va + vb + vc || 1e-9);
    const v = vb * den, w = vc * den;
    return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  }

  /* ---------------- 主模拟 ---------------- */
  function simulate(comp, layer, state, t, opts = {}) {
    const key = layer.id + '|' + comp.id;
    const params = particleParams(comp, layer, state, t);
    const hash = JSON.stringify([params, t < 0.001 ? 0 : 1]);
    let c = cache.get(key);
    // 缓存失效：参数变化
    if (c && c.paramKey !== JSON.stringify(params)) c = null;
    if (!c) {
      c = { time: layer.inPoint, particles: [], emitAcc: 0, paramKey: JSON.stringify(params), trails: new Map() };
      cache.set(key, c);
    }
    const stepFrom = c.time;
    const steps = Math.max(0, Math.floor((t - stepFrom) / DT + 1e-6));
    if (t < stepFrom - 1e-6) {
      // 倒退：从头开始
      c = { time: layer.inPoint, particles: [], emitAcc: 0, paramKey: JSON.stringify(params), trails: new Map() };
      cache.set(key, c);
    }
    const particles = c.particles;
    let emitAcc = c.emitAcc;
    const tStart = c.time;
    const colLayers = params.collisionLayers.map(id => comp.layers.find(l => l.id === id)).filter(l => l && l.type === 'solid');
    let colMeshes = null;
    const fields = (params.fieldIds || []).map(id => comp.layers.find(l => l.id === id)).filter(l => l && l.type === 'field');
    const fieldObjs = fields.map(f => FIELDS.fieldFromLayer(state, f, t));

    const nSteps = Math.max(0, Math.floor((t - tStart) / DT + 1e-6));
    for (let s = 0; s < nSteps; s++) {
      const tt = tStart + s * DT;
      // 每 4 步重建碰撞体与发射器
      if (!colMeshes || s % 4 === 0) {
        colMeshes = [];
        for (const cl of colLayers) {
          const m = NODES.solidMesh(comp, cl, state, tt);
          if (!m) continue;
          const wm = state.worldMatrix(cl);
          const verts = new Float32Array(m.verts.length);
          for (let i = 0; i < m.verts.length; i += 3) {
            const x = m.verts[i], y = m.verts[i + 1], z = m.verts[i + 2];
            verts[i] = wm[0] * x + wm[4] * y + wm[8] * z + wm[12];
            verts[i + 1] = wm[1] * x + wm[5] * y + wm[9] * z + wm[13];
            verts[i + 2] = wm[2] * x + wm[6] * y + wm[10] * z + wm[14];
          }
          colMeshes.push({ verts, grid: buildGrid(verts, m.idx, 26) });
        }
      }
      // 更新粒子
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.age += DT;
        if (pt.age >= pt.life) { particles.splice(i, 1); continue; }
        // 力
        const f = [params.gravity[0] + params.wind[0], params.gravity[1] + params.wind[1], params.gravity[2] + params.wind[2]];
        if (fieldObjs.length) {
          const d = FIELDS.evalFields(fieldObjs, pt.pos, tt);
          f[0] += d[0] * 60; f[1] += d[1] * 60; f[2] += d[2] * 60;
        }
        pt.vel[0] += f[0] * DT; pt.vel[1] += f[1] * DT; pt.vel[2] += f[2] * DT;
        // 阻力
        const dragK = Math.max(0, 1 - params.drag * DT);
        pt.vel[0] *= dragK; pt.vel[1] *= dragK; pt.vel[2] *= dragK;
        pt.pos[0] += pt.vel[0] * DT; pt.pos[1] += pt.vel[1] * DT; pt.pos[2] += pt.vel[2] * DT;
        if (params.collisionOn && colMeshes.length) {
          collide(pt, colMeshes, params.colRadius, params.bounce, params.friction);
          if (pt.hit && !pt.hitProcessed) {
            pt.hitProcessed = true;
            pt.colorOverride = params.hitColor;
            pt.life = Math.min(pt.life, pt.age + params.hitLife * (pt.life - pt.age));
            if (params.hitEmit > 0) {
              for (let k = 0; k < params.hitEmit; k++) {
                const r = new U.RNG(pt.seed * 31 + k);
                particles.push({
                  pos: pt.pos.slice(), vel: [pt.hitNormal[0] * 80 + r.range(-60, 60), pt.hitNormal[1] * 80 + r.range(-60, 60), pt.hitNormal[2] * 80 + r.range(-60, 60)],
                  age: 0, life: r.range(0.25, 0.6), size0: pt.size0 * 0.6, size1: 0.1,
                  col0: U.mixColor(params.hitColor, '#ffffff', 0.5), col1: params.hitColor, seed: pt.seed + k,
                  hit: true, hitProcessed: true
                });
              }
            }
          }
        }
        // 拖尾记录
        if (params.trailOn) {
          let tr = c.trails.get(pt.id);
          if (!tr) { tr = []; c.trails.set(pt.id, tr); }
          tr.push(pt.pos[0], pt.pos[1], pt.pos[2]);
          const maxLen = Math.max(2, Math.round(params.trailLen * 60)) * 3;
          if (tr.length > maxLen) tr.splice(0, tr.length - maxLen);
        }
      }
      // 发射
      emitAcc += params.rate * DT;
      let nEmit = Math.floor(emitAcc);
      emitAcc -= nEmit;
      if (particles.length + nEmit > params.maxParticles) nEmit = Math.max(0, params.maxParticles - particles.length);
      if (nEmit > 0) {
        const em = buildEmitterData(comp, layer, state, tt);
        for (let k = 0; k < nEmit; k++) {
          const idx = c.emitIndex = (c.emitIndex || 0) + 1;
          const rng = new U.RNG(params.seed * 7919 + idx);
          const e = spawnParticle(em, params, rng, comp, state, tt);
          e.id = idx;
          particles.push(e);
        }
      }
    }
    c.time = tStart + nSteps * DT;
    c.emitAcc = emitAcc;
    // 输出缓冲
    return buildBuffers(particles, params, c.trails, t);
  }

  function spawnParticle(em, p, rng, comp, state, t) {
    let pos = [0, 0, 0], dir = [0, -1, 0];
    if (em.type === 'point' || !em.src) {
      const r = p.radius * Math.cbrt(rng.next());
      const th = rng.next() * Math.PI * 2, ph = Math.acos(rng.range(-1, 1));
      pos = [em.pos[0] + Math.sin(ph) * Math.cos(th) * r, em.pos[1] + Math.sin(ph) * Math.sin(th) * r, em.pos[2] + Math.cos(ph) * r];
      dir = p.dir.slice();
    } else if (em.type === 'curve' && em.points && em.points.length) {
      pos = em.points[Math.floor(rng.next() * em.points.length)].slice();
      dir = p.dir.slice();
    } else if (em.type === 'surface' && em.verts && em.areas) {
      // 面积加权随机三角形
      let target = rng.next() * em.totalArea;
      let ti = 0;
      for (let i = 0; i < em.areas.length; i++) { target -= em.areas[i]; if (target <= 0) { ti = i; break; } }
      const a = em.idx[ti * 3] * 3, b = em.idx[ti * 3 + 1] * 3, c = em.idx[ti * 3 + 2] * 3;
      const r1 = rng.next(), r2 = rng.next();
      const sq = Math.sqrt(r1);
      const u = 1 - sq, v = sq * r1, w = sq * (1 - r1);
      pos = [
        em.verts[a] * u + em.verts[b] * v + em.verts[c] * w,
        em.verts[a + 1] * u + em.verts[b + 1] * v + em.verts[c + 1] * w,
        em.verts[a + 2] * u + em.verts[b + 2] * v + em.verts[c + 2] * w
      ];
      const ux = em.verts[b] - em.verts[a], uy = em.verts[b + 1] - em.verts[a + 1], uz = em.verts[b + 2] - em.verts[a + 2];
      const vx = em.verts[c] - em.verts[a], vy = em.verts[c + 1] - em.verts[a + 1], vz = em.verts[c + 2] - em.verts[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const an = p.alongNormal;
      dir = [nx * an + p.dir[0] * (1 - an), ny * an + p.dir[1] * (1 - an), nz * an + p.dir[2] * (1 - an)];
    } else if (em.type === 'volume' && em.verts) {
      const i = Math.floor(rng.next() * (em.verts.length / 3)) * 3;
      pos = [em.verts[i] + rng.range(-3, 3), em.verts[i + 1] + rng.range(-3, 3), em.verts[i + 2] + rng.range(-3, 3)];
      dir = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
    } else {
      pos = em.pos.slice();
      dir = p.dir.slice();
    }
    // 随机扩散
    const spread = p.spread;
    const dl = Math.hypot(...dir) || 1;
    dir = dir.map(v => v / dl);
    const rx = rng.gauss() * spread, ry = rng.gauss() * spread, rz = rng.gauss() * spread;
    dir = [dir[0] + rx, dir[1] + ry, dir[2] + rz];
    const dl2 = Math.hypot(...dir) || 1;
    dir = dir.map(v => v / dl2);
    const speed = p.speed * (1 + p.speedVar * rng.range(-1, 1));
    const life = Math.max(0.05, p.lifetime * (1 + p.lifetimeVar * rng.range(-1, 1)));
    const s0 = p.size * (1 + p.sizeVar * rng.range(-1, 1));
    return {
      pos, vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed],
      age: 0, life, size0: s0, size1: p.sizeEnd * s0,
      col0: p.color, col1: p.colorEnd, seed: Math.floor(rng.next() * 1e6),
      hit: false, hitProcessed: false, id: 0
    };
  }

  function buildBuffers(particles, p, trails, t) {
    const n = particles.length;
    const buf = new Float32Array(n * 11);
    const c0 = U.hex2rgb(p.color), c1 = U.hex2rgb(p.colorEnd);
    for (let i = 0; i < n; i++) {
      const pt = particles[i];
      const u = U.clamp(pt.age / pt.life, 0, 1);
      const size = U.lerp(pt.size0, pt.size1, u);
      const col = pt.colorOverride ? U.hex2rgb(pt.colorOverride) : [U.lerp(c0[0], c1[0], u), U.lerp(c0[1], c1[1], u), U.lerp(c0[2], c1[2], u)];
      const op = U.clamp(p.opacity * (1 - p.opacityEnd * u), 0, 1);
      const o = i * 11;
      buf[o] = pt.pos[0]; buf[o + 1] = pt.pos[1]; buf[o + 2] = pt.pos[2];
      buf[o + 3] = col[0]; buf[o + 4] = col[1]; buf[o + 5] = col[2]; buf[o + 6] = op;
      buf[o + 7] = size;
      buf[o + 8] = pt.vel[0]; buf[o + 9] = pt.vel[1]; buf[o + 10] = pt.vel[2];
    }
    // 拖尾条带（三角带展开）
    let trailBuf = null;
    if (p.trailOn && trails) {
      const verts = [];
      const pushV = (x, y, z, r, g, b, a) => { verts.push(x, y, z, r * a, g * a, b * a, a); };
      for (const pt of particles) {
        const tr = trails.get(pt.id);
        if (!tr || tr.length < 6) continue;
        const u = U.clamp(pt.age / pt.life, 0, 1);
        const op = U.clamp(p.opacity * (1 - p.opacityEnd * u), 0, 1);
        const col = pt.colorOverride ? U.hex2rgb(pt.colorOverride) : [U.lerp(c0[0], c1[0], u), U.lerp(c0[1], c1[1], u), U.lerp(c0[2], c1[2], u)];
        const count = tr.length / 3;
        for (let i = 0; i < count - 1; i++) {
          const a = i * 3, b = (i + 1) * 3;
          const f0 = i / (count - 1), f1 = (i + 1) / (count - 1);
          const w0 = p.trailWidth * (0.15 + 0.85 * f0) * (pt.size0 / 6) * 0.5;
          const w1 = p.trailWidth * (0.15 + 0.85 * f1) * (pt.size0 / 6) * 0.5;
          const ax = tr[a], ay = tr[a + 1], az = tr[a + 2];
          const bx = tr[b], by = tr[b + 1], bz = tr[b + 2];
          let dx = bx - ax, dy = by - ay, dz = bz - az;
          const dl = Math.hypot(dx, dy, dz) || 1;
          dx /= dl; dy /= dl; dz /= dl;
          // 取与视线近似垂直的方向
          let px = -dy, py = dx, pz = 0;
          const pl = Math.hypot(px, py, pz) || 1;
          px /= pl; py /= pl; pz /= pl;
          const al0 = op * f0 * f0 * p.trailFade;
          const al1 = op * f1 * f1 * p.trailFade;
          // 两个三角形
          pushV(ax + px * w0, ay + py * w0, az + pz * w0, col[0], col[1], col[2], al0);
          pushV(ax - px * w0, ay - py * w0, az - pz * w0, col[0], col[1], col[2], al0);
          pushV(bx + px * w1, by + py * w1, bz + pz * w1, col[0], col[1], col[2], al1);
          pushV(ax - px * w0, ay - py * w0, az - pz * w0, col[0], col[1], col[2], al0);
          pushV(bx - px * w1, by - py * w1, bz - pz * w1, col[0], col[1], col[2], al1);
          pushV(bx + px * w1, by + py * w1, bz + pz * w1, col[0], col[1], col[2], al1);
        }
      }
      if (verts.length) trailBuf = new Float32Array(verts);
    }
    return { count: n, buf, trailBuf };
  }

  function clearCache() { cache.clear(); }

  global.SIM = { simulate, particleParams, clearCache, DT };
})(window);
