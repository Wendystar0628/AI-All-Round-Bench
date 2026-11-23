/* AE Forge Editor - deterministic particle simulation with fields, collisions, trails */
(function (global) {
  'use strict';
  const M4 = AEMath.M4;
  const A = global.AEAnim;
  const { clamp, mulberry32 } = AEMath;

  const MAX_P = 520;
  const STRIDE = 10; // x y z vx vy vz life maxLife size gen
  const FRAME_FLOATS = MAX_P * STRIDE;

  const cache = new Map();

  function emitterList(layer) {
    const p = layer.particles;
    if (!p) return [];
    const list = [];
    const main = Object.assign({}, p, { pos: p.pos || [0, 0, 0] });
    list.push(main);
    for (const e of (p.emitters || [])) list.push(Object.assign({}, p, e));
    return list;
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function getSim(comp, layer) {
    const key = comp.id + '|' + layer.id + '|' + (global.AEProject.simRevision || 0);
    let sim = cache.get(key);
    if (!sim) {
      sim = {
        key, layerId: layer.id, compId: comp.id,
        frames: new Float32Array(4096 * FRAME_FLOATS),
        counts: new Uint16Array(4096),
        step: -1, maxStep: 0, done: false,
        particles: [],
        emitAcc: [],
      };
      cache.set(key, sim);
      if (cache.size > 8) {
        const first = cache.keys().next().value;
        if (first !== key) cache.delete(first);
      }
    }
    return sim;
  }

  function worldMatrixOf(comp, layer, time) {
    return global.AEProject.worldMatrix(comp, layer, time);
  }

  function sampleGeometryPoint(comp, layer, time, rnd) {
    const src = global.AEProject.layer(comp, layer.emitterLayerId);
    if (!src) return null;
    let mesh = null;
    if (global.AE3D) mesh = global.AE3D.getLayerMesh(comp, src, time, true);
    if (!mesh || !mesh.pos || mesh.count < 3) return null;
    const tri = Math.floor(rnd() * (mesh.count / 3)) * 9;
    let a = rnd(), b = rnd();
    if (a + b > 1) { a = 1 - a; b = 1 - b; }
    const c = 1 - a - b;
    const p = [
      mesh.pos[tri] * a + mesh.pos[tri + 3] * b + mesh.pos[tri + 6] * c,
      mesh.pos[tri + 1] * a + mesh.pos[tri + 4] * b + mesh.pos[tri + 7] * c,
      mesh.pos[tri + 2] * a + mesh.pos[tri + 5] * b + mesh.pos[tri + 8] * c,
    ];
    const wm = worldMatrixOf(comp, src, time);
    return M4.transformPoint(wm, p);
  }

  function spawnParticle(comp, layer, em, rnd, t, gen) {
    const p = layer.particles;
    const pos0 = em.pos || [0, 0, 0];
    let wp = [pos0[0], pos0[1], pos0[2]];
    if (em.emitter === 'geometry' && em.emitterLayerId) {
      const gp = sampleGeometryPoint(comp, layer, t, rnd);
      if (gp) wp = gp;
    } else {
      const wm = worldMatrixOf(comp, layer, t);
      wp = M4.transformPoint(wm, [pos0[0], pos0[1], pos0[2]]);
    }
    const speed = (em.speed || 200) * (1 + (rnd() - 0.5) * (p.speedRandom || 0));
    let dir = em.direction || [0, 1, 0];
    // random cone spread around direction
    const spread = (em.spread === undefined ? 60 : em.spread) * Math.PI / 180;
    const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const right = AEMath.V3.norm(AEMath.V3.cross(dir, up));
    const up2 = AEMath.V3.cross(right, dir);
    const ang = rnd() * Math.PI * 2;
    const rad = Math.sqrt(rnd()) * spread;
    const dx = dir[0] * Math.cos(rad) + (right[0] * Math.cos(ang) + up2[0] * Math.sin(ang)) * Math.sin(rad);
    const dy = dir[1] * Math.cos(rad) + (right[1] * Math.cos(ang) + up2[1] * Math.sin(ang)) * Math.sin(rad);
    const dz = dir[2] * Math.cos(rad) + (right[2] * Math.cos(ang) + up2[2] * Math.sin(ang)) * Math.sin(rad);
    const jitter = em.emitter === 'geometry' ? 4 : 0;
    return {
      x: wp[0] + (rnd() - 0.5) * jitter, y: wp[1] + (rnd() - 0.5) * jitter, z: wp[2] + (rnd() - 0.5) * jitter,
      vx: dx * speed + (em.inheritVelocity ? 0 : 0),
      vy: dy * speed, vz: dz * speed,
      life: (p.life || 1) * (0.7 + rnd() * 0.6),
      maxLife: p.life || 1,
      size: (p.size || 5) * (0.6 + rnd() * 0.8),
      gen: gen || 0,
      seed: rnd() * 1000,
    };
  }

  function collide(p, prev, collider) {
    if (!collider) return false;
    if (collider.type === 'plane') {
      const n = collider.normal || [0, 1, 0];
      const pt = collider.point || [0, 0, 0];
      const d0 = (prev[0] - pt[0]) * n[0] + (prev[1] - pt[1]) * n[1] + (prev[2] - pt[2]) * n[2];
      const d1 = (p.x - pt[0]) * n[0] + (p.y - pt[1]) * n[1] + (p.z - pt[2]) * n[2];
      if (d0 > 0 && d1 <= 0) {
        const vn = p.vx * n[0] + p.vy * n[1] + p.vz * n[2];
        const e = collider.restitution === undefined ? 0.35 : collider.restitution;
        p.vx -= (1 + e) * vn * n[0];
        p.vy -= (1 + e) * vn * n[1];
        p.vz -= (1 + e) * vn * n[2];
        const fr = collider.friction === undefined ? 0.7 : collider.friction;
        p.vx *= fr; p.vz *= fr;
        p.x = pt[0] + (p.x - pt[0]) + n[0] * 0.5;
        p.y = pt[1] + n[1] * 0.5;
        p.z = pt[2] + n[2] * 0.5;
        p.bounces = (p.bounces || 0) + 1;
        return true;
      }
    } else if (collider.type === 'box') {
      const mn = collider.min, mx = collider.max;
      if (p.x > mn[0] && p.x < mx[0] && p.y > mn[1] && p.y < mx[1] && p.z > mn[2] && p.z < mx[2]) {
        // find nearest face
        const d = [
          Math.abs(p.x - mn[0]), Math.abs(p.x - mx[0]),
          Math.abs(p.y - mn[1]), Math.abs(p.y - mx[1]),
          Math.abs(p.z - mn[2]), Math.abs(p.z - mx[2]),
        ];
        let best = 0;
        for (let i = 1; i < 6; i++) if (d[i] < d[best]) best = i;
        const n = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]][best];
        const vn = p.vx * n[0] + p.vy * n[1] + p.vz * n[2];
        const e = collider.restitution === undefined ? 0.4 : collider.restitution;
        p.vx -= (1 + e) * vn * n[0];
        p.vy -= (1 + e) * vn * n[1];
        p.vz -= (1 + e) * vn * n[2];
        p.x += n[0] * 1.5; p.y += n[1] * 1.5; p.z += n[2] * 1.5;
        p.bounces = (p.bounces || 0) + 1;
        return true;
      }
    }
    return false;
  }

  function collectFields(comp, time) {
    const fields = [];
    for (const l of comp.layers) {
      if (l.type !== 'shape' || !l.field || !l.field.enabled) continue;
      const ctx = global.AEProject.makeCtx(comp, l, time);
      const pos = A.evalProp(l.transform.position, time, ctx);
      const wm = global.AEProject.worldMatrix(comp, l, time);
      const wp = M4.transformPoint(wm, [0, 0, 0]);
      fields.push({
        pos: wp,
        radius: l.field.radius || 400,
        strength: l.field.strength || 1,
        kind: l.field.kind || 'swirl',
        seed: l.id.length,
      });
    }
    return fields;
  }

  function applyFields(p, fields, dt) {
    for (const f of fields) {
      const dx = f.pos[0] - p.x, dy = f.pos[1] - p.y, dz = f.pos[2] - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > f.radius || d < 1e-3) continue;
      const fall = 1 - d / f.radius;
      const s = f.strength * fall * fall * 60;
      if (f.kind === 'repel') {
        p.vx -= dx / d * s * dt; p.vy -= dy / d * s * dt; p.vz -= dz / d * s * dt;
      } else if (f.kind === 'attract') {
        p.vx += dx / d * s * dt; p.vy += dy / d * s * dt; p.vz += dz / d * s * dt;
      } else if (f.kind === 'swirl') {
        p.vx += (-dy / d) * s * dt; p.vy += (dx / d) * s * dt; p.vz += 0.4 * s * dt;
      } else if (f.kind === 'noise') {
        p.vx += Math.sin(p.y * 0.01 + f.seed) * s * dt;
        p.vy += Math.cos(p.x * 0.01 + f.seed) * s * dt;
      }
    }
  }

  function simulateTo(comp, layer, time, dt) {
    const sim = getSim(comp, layer);
    const p = layer.particles;
    if (!p) return sim;
    const targetStep = Math.max(0, Math.round(time / dt));
    const maxStep = Math.min(targetStep, 5400);
    if (sim.maxStep >= maxStep && sim.layerId === layer.id) {
      return sim;
    }
    if (sim.maxStep > maxStep) {
      // reset
      sim.particles.length = 0;
      sim.maxStep = -1;
      sim.step = -1;
      for (const em of emitterList(layer)) em._acc = 0;
      sim.counts.fill(0);
    }
    const emitters = emitterList(layer);
    const colliders = p.colliders || [];
    const fields = collectFields(comp, time);
    let step = sim.maxStep;
    while (step < maxStep) {
      step++;
      const t = step * dt;
      // emit
      for (let ei = 0; ei < emitters.length; ei++) {
        const em = emitters[ei];
        if (em.enabled === false) continue;
        const rnd = mulberry32((hashString(layer.id) + ei * 7919 + step * 104729) >>> 0);
        const startT = em.start === undefined ? (em.emitTime || 0) : em.start;
        const endT = em.end === undefined ? (em.end === undefined ? 1e9 : em.end) : em.end;
        const rate = (t >= startT && t <= endT) ? (em.rate || 0) : 0;
        sim.acc = sim.acc || [];
        sim.acc[ei] = (sim.acc[ei] || 0) + rate * dt;
        let count = Math.floor(sim.acc[ei]);
        sim.acc[ei] -= count;
        if (em.bursts) {
          for (const b of em.bursts) {
            if (Math.abs(t - (b.t || 0)) < dt * 0.5) count += (b.count || 0);
          }
        }
        if (em.burst && em.emitTime != null) {
          if (Math.abs(t - em.emitTime) < dt * 0.5) count += em.burst;
        }
        if (em.emitter === 'geometry' && rate > 0) count = Math.min(count, 6);
        for (let k = 0; k < count; k++) {
          if (sim.particles.length >= MAX_P) break;
          sim.particles.push(spawnParticle(comp, layer, em, rnd, t, 0));
        }
      }
      // integrate
      const alive = [];
      for (const q of sim.particles) {
        const prev = [q.x, q.y, q.z];
        q.life -= dt;
        if (q.life <= 0) continue;
        const dragF = Math.pow(1 - clamp(p.drag === undefined ? 0.02 : p.drag, 0, 0.95), dt * 60);
        q.vy += (p.gravity || 0) * dt;
        applyFields(q, fields, dt);
        q.vx *= dragF; q.vy *= dragF; q.vz *= dragF;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        if (p.collision !== false) {
          for (const c of colliders) {
            if (collide(q, prev, c)) {
              if (p.secondary && q.gen < 1 && q.bounces < 2 && sim.particles.length < MAX_P - 2) {
                const rnd = mulberry32((q.seed * 1000 + step) >>> 0);
                const n = 1 + (rnd() > 0.6 ? 1 : 0);
                for (let s = 0; s < n; s++) {
                  const child = {
                    x: q.x, y: q.y, z: q.z,
                    vx: q.vx * 0.5 + (rnd() - 0.5) * 140,
                    vy: Math.abs(q.vy) * 0.4 + rnd() * 120,
                    vz: q.vz * 0.5 + (rnd() - 0.5) * 140,
                    life: q.life * 0.6, maxLife: q.life * 0.6,
                    size: q.size * 0.7, gen: 1, seed: rnd() * 1000,
                  };
                  alive.push(child);
                }
              }
              break;
            }
          }
        }
        alive.push(q);
      }
      sim.particles = alive;
      // record frame
      const base = step * FRAME_FLOATS;
      const data = sim.frames;
      let n = 0;
      for (const q of sim.particles) {
        if (n >= MAX_P) break;
        const o = base + n * STRIDE;
        data[o] = q.x; data[o + 1] = q.y; data[o + 2] = q.z;
        data[o + 3] = q.vx; data[o + 4] = q.vy; data[o + 5] = q.vz;
        data[o + 6] = q.life; data[o + 7] = q.maxLife; data[o + 8] = q.size; data[o + 9] = q.gen;
        n++;
      }
      sim.counts[step] = n;
      sim.step = step;
      sim.maxStep = step;
    }
    sim.time = time;
    return sim;
  }

  function frameAt(sim, time, dt) {
    const step = clamp(Math.round(time / dt), 0, sim.maxStep);
    return { data: sim.frames.subarray(step * FRAME_FLOATS, step * FRAME_FLOATS + FRAME_FLOATS), count: sim.counts[step] };
  }

  // Build render data for a particle layer at time
  function buildRenderData(comp, layer, time, opts) {
    opts = opts || {};
    const p = layer.particles;
    if (!p) return null;
    const dt = 1 / 60;
    const sim = simulateTo(comp, layer, time, dt);
    const frame = frameAt(sim, time, dt);
    const data = frame.data;
    const n = frame.count;
    const quads = [];
    const lines = [];
    const wm = global.AEProject.worldMatrix(comp, layer, time);
    const trailFrames = Math.max(0, Math.round((p.trail || 0) / dt));
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const life = data[o + 6], maxLife = data[o + 7] || 1;
      const k = clamp(life / maxLife, 0, 1);
      const size = data[o + 8] * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, k * 1.2)));
      const alpha = Math.pow(k, 0.6);
      quads.push({ p: [data[o], data[o + 1], data[o + 2]], size: Math.max(0.4, size), alpha, k });
      if (trailFrames > 0) {
        let prevStep = Math.max(0, Math.round(time / dt));
        const segs = [];
        for (let s = 1; s <= trailFrames; s++) {
          const st = prevStep - s;
          if (st < 0) break;
          const sd = sim.frames.subarray(st * FRAME_FLOATS, st * FRAME_FLOATS + FRAME_FLOATS);
          const idx = sim.counts[st] > i ? i : -1;
          if (idx < 0) {
            // particle index may shift; fall back to matching by nearest position
            break;
          }
          segs.push([sd[idx * STRIDE], sd[idx * STRIDE + 1], sd[idx * STRIDE + 2]]);
        }
        if (segs.length > 1) lines.push({ pts: [[data[o], data[o + 1], data[o + 2]]].concat(segs), alpha: alpha * 0.5 });
      }
    }
    return { quads, lines, count: n };
  }

  global.AEParticles = { simulateTo, buildRenderData, frameAt, getSim, MAX_P, STRIDE, reset() { cache.clear(); } };
})(window);