/* 粒子模拟：多个发射器（点 / 曲线 / 几何表面）、重力与空间场、平面与变形网格碰撞、次级发射、拖尾。
 * 模拟以固定步长 DT 在世界空间中推进，状态只前进、结果逐步保存：同一时刻的取样结果与推进路径无关。
 * 随机数只来自（种子, 发射器, 序号, 通道）的哈希，因而可复现。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const M = U.mat;
  const Model = AE.Model;
  const Anim = AE.Anim;
  const G = AE.Graph;
  const Shapes = AE.Shapes;
  const P = AE.Path;
  const Particles = (AE.Particles = {});

  const DT = 1 / 60;
  Particles.DT = DT;
  const sims = new Map();
  // 只借用 Renderer 的世界矩阵计算（不依赖具体渲染实例）
  const WO = { worldOf: null };
  function worldAt(comp, layer, t) {
    if (!WO.worldOf) WO.worldOf = AE.Renderer.prototype.worldOf;
    return WO.worldOf.call(WO, comp, layer, t, { world: new Map(), visiting: new Set() });
  }

  // 发射器（默认属性）
  Particles.newEmitter = (name, opts) => {
    opts = opts || {};
    return {
      id: U.uid('e'),
      name: name || '发射器',
      on: true,
      src: { kind: opts.kind || 'point', layer: opts.layer || null, graph: opts.graph || null, node: opts.node || null },
      pos: Model.vec(opts.pos || [0, 0, 0]),
      dir: Model.vec(opts.dir || [0, -1, 0]),
      rate: Model.num(opts.rate !== undefined ? opts.rate : 60),
      speed: Model.num(opts.speed !== undefined ? opts.speed : 300),
      spread: Model.num(opts.spread !== undefined ? opts.spread : 30),
      life: Model.num(opts.life !== undefined ? opts.life : 1.2),
      seed: opts.seed || 1,
    };
  };

  // 模拟的签名：粒子设置、节点图与合成图层（不含时间）变化时重建
  function signature(project, comp, layer) {
    return JSON.stringify([layer.particles, project.graphs || [], comp.layers.map((l) => [l.id, l.tr, l.type, l.parent, l.geo, l.contents, l.text, l.enabled, l.inPoint, l.outPoint])]);
  }

  function coneDir(d, spreadRad, u, v) {
    const cosT = 1 - u * (1 - Math.cos(spreadRad));
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = 2 * Math.PI * v;
    const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const x = U.vnorm(U.vcross(d, a));
    const y = U.vcross(d, x);
    return U.vnorm(U.vadd(U.vadd(U.vmul(d, cosT), U.vmul(x, sinT * Math.cos(phi))), U.vmul(y, sinT * Math.sin(phi))));
  }

  // 三角形与点的近似碰撞：返回法线与接触点
  function triHit(tri, p, R) {
    const n = tri.n;
    const d = U.vdot(U.vsub(p, tri.a), n);
    if (Math.abs(d) > R) return null;
    const q = U.vsub(p, U.vmul(n, d));
    // 重心坐标判断投影点是否落在三角形内（略放宽）
    const v0 = U.vsub(tri.c, tri.a), v1 = U.vsub(tri.b, tri.a), v2 = U.vsub(q, tri.a);
    const d00 = U.vdot(v0, v0), d01 = U.vdot(v0, v1), d11 = U.vdot(v1, v1), d20 = U.vdot(v2, v0), d21 = U.vdot(v2, v1);
    const den = d00 * d11 - d01 * d01;
    if (Math.abs(den) < 1e-12) return null;
    const vv = (d11 * d20 - d01 * d21) / den;
    const w = (d00 * d21 - d01 * d20) / den;
    const uu = 1 - vv - w;
    const eps = -0.02;
    if (uu < eps || vv < eps || w < eps) return null;
    return { n: d >= 0 ? n : U.vmul(n, -1), q, d };
  }

  // 把一组三角形放入空间网格（按包围盒）
  function buildGrid(tris, cell, pad) {
    const grid = new Map();
    tris.forEach((t) => {
      const x0 = Math.min(t.a[0], t.b[0], t.c[0]) - pad, x1 = Math.max(t.a[0], t.b[0], t.c[0]) + pad;
      const y0 = Math.min(t.a[1], t.b[1], t.c[1]) - pad, y1 = Math.max(t.a[1], t.b[1], t.c[1]) + pad;
      const z0 = Math.min(t.a[2], t.b[2], t.c[2]) - pad, z1 = Math.max(t.a[2], t.b[2], t.c[2]) + pad;
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
        for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++)
          for (let k = Math.floor(z0 / cell); k <= Math.floor(z1 / cell); k++) {
            const key = i + ',' + j + ',' + k;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(t);
          }
    });
    return { grid, cell };
  }

  // 世界空间的网格三角形（来自几何图层或节点输出）
  function worldTriangles(project, comp, colliderRef, T) {
    let geo = null, mW = null;
    if (colliderRef.layer) {
      const gl = Model.findLayer(comp, colliderRef.layer);
      if (!gl) return null;
      geo = G.geometryOf(project, comp, gl, T);
      mW = worldAt(comp, gl, T);
    } else if (colliderRef.graph) {
      geo = G.evalRef(project, comp, colliderRef, T, null);
      mW = null;
    }
    if (!geo || geo.kind !== 'mesh') return null;
    const pos = geo.pos;
    const tris = [];
    const W = (i) => (mW ? M.transformPoint(mW, [pos[i], pos[i + 1], pos[i + 2]]) : [pos[i], pos[i + 1], pos[i + 2]]);
    for (let i = 0; i < pos.length; i += 9) {
      const a = W(i), b = W(i + 3), c = W(i + 6);
      const n = U.vnorm(U.vcross(U.vsub(b, a), U.vsub(c, a)));
      if (!isFinite(n[0])) continue;
      tris.push({ a, b, c, n });
    }
    return tris;
  }

  // ---------- 模拟对象 ----------
  function newSim(sig) {
    return { sig, k: -1, active: [], all: [], spawnAcc: {}, nextIndex: 0, grids: {}, count: 0 };
  }

  // 推进模拟到包含时间 t 的步
  function advance(project, comp, layer, sim, t) {
    const props = layer.particles;
    const needK = Math.floor(t / DT + 1e-9);
    const maxP = Math.max(10, Math.round(props.maxParticles || 4000));
    while (sim.k < needK) {
      const k = sim.k + 1;
      sim.k = k;
      const T = k * DT;
      const alive = [];
      // 1) 更新已有粒子
      if (k > 0) stepParticles(project, comp, layer, sim, T, k);
      // 2) 发射
      const inLayer = T >= layer.inPoint - 1e-9 && T < layer.outPoint - 1e-9;
      if (inLayer && sim.count < maxP) {
        (props.emitters || []).forEach((e, ei) => {
          if (!e.on) return;
          const rate = Math.max(0, Anim.value(comp, layer, e.rate, T));
          sim.spawnAcc[e.id] = (sim.spawnAcc[e.id] || 0) + rate * DT;
          while (sim.spawnAcc[e.id] >= 1 && sim.count < maxP) {
            sim.spawnAcc[e.id] -= 1;
            spawn(project, comp, layer, sim, e, ei, T, k);
          }
        });
      }
      // 3) 记录样本（新生粒子在本步已有位置）
      sim.active.forEach((p) => {
        if (p.dead) return;
        p.samples.push(p.pos[0], p.pos[1], p.pos[2]);
        alive.push(p);
      });
      sim.active = alive.filter((p) => !p.dead);
      void k;
    }
  }

  function spawn(project, comp, layer, sim, e, ei, T, k) {
    const idx = sim.nextIndex++;
    const sd = (layer.particles.seed || 1) * 131 + (e.seed || 1);
    const r = (c) => U.hash(sd, ei, idx, c);
    const src = e.src || { kind: 'point' };
    let pos = [0, 0, 0], nrm = null;
    if (src.kind === 'curve' && src.layer) {
      const sl = Model.findLayer(comp, src.layer);
      const draws = sl ? Shapes.evaluate(comp, sl, T) : [];
      const contours = draws.flatMap((d) => d.contours || []);
      const segs = [];
      let total = 0;
      contours.forEach((c) => {
        const m = c.pts.length;
        for (let i = 0; i < (c.closed ? m : m - 1); i++) {
          const a = c.pts[i], b = c.pts[(i + 1) % m];
          total += Math.hypot(b[0] - a[0], b[1] - a[1]);
          segs.push({ a, b, end: total });
        }
      });
      if (total > 0 && sl) {
        const rr = r(1) * total;
        const s = segs.find((q) => q.end >= rr) || segs[segs.length - 1];
        const f = r(2);
        pos = M.transformPoint(worldAt(comp, sl, T), [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f, 0]);
      }
    } else if (src.kind === 'surface') {
      const ref = src.layer ? { layer: src.layer } : { graph: src.graph, node: src.node };
      let geo = null, W = null;
      if (src.layer) {
        const gl = Model.findLayer(comp, src.layer);
        geo = gl ? G.geometryOf(project, comp, gl, T) : null;
        W = gl ? worldAt(comp, gl, T) : null;
      } else {
        geo = G.evalRef(project, comp, ref, T, layer);
        W = worldAt(comp, layer, T);
      }
      if (geo && geo.kind === 'mesh') {
        const pts = G.samplePoints(geo, 1, Math.floor(r(3) * 1e6));
        if (pts.length) {
          const q = pts[0];
          pos = W ? M.transformPoint(W, q.p) : q.p.slice();
          nrm = U.vnorm(W ? M.transformDir(W, q.n) : q.n);
        }
      }
    } else {
      pos = M.transformPoint(worldAt(comp, layer, T), Anim.value(comp, layer, e.pos, T));
    }
    let base = Anim.value(comp, layer, e.dir, T);
    if (nrm) base = nrm;
    base = U.vnorm(base.some((x) => x) ? base : [0, -1, 0]);
    const spread = U.deg2rad(Math.max(0, Anim.value(comp, layer, e.spread, T)));
    const dir = coneDir(base, spread, r(4), r(5));
    const speed = Anim.value(comp, layer, e.speed, T) * (0.7 + 0.6 * r(6));
    const life = Math.max(0.05, Anim.value(comp, layer, e.life, T)) * (0.8 + 0.4 * r(7));
    const pr = layer.particles;
    const p = {
      id: idx,
      b: k,
      life,
      lifeSteps: Math.max(1, Math.round(life / DT)),
      pos: pos.slice(),
      vel: U.vmul(dir, speed),
      age: 0,
      samples: [],
      size0: Anim.value(comp, layer, pr.size, T),
      size1: Anim.value(comp, layer, pr.sizeEnd, T),
      col0: Anim.value(comp, layer, pr.color, T),
      col1: Anim.value(comp, layer, pr.colorEnd, T),
      hit: -1,
      hitT: 0,
      dead: false,
      seed: sd + idx,
    };
    sim.active.push(p);
    sim.all.push(p);
    sim.count++;
    return p;
  }

  function stepParticles(project, comp, layer, sim, T, k) {
    const pr = layer.particles;
    const g = Anim.value(comp, layer, pr.gravity, T);
    const drag = Math.max(0, Anim.value(comp, layer, pr.drag, T));
    const rest = U.clamp(Anim.value(comp, layer, pr.restitution, T), 0, 1);
    const fric = U.clamp(Anim.value(comp, layer, pr.friction, T), 0, 1);
    const hitLife = pr.hitLife ? Math.max(0.05, Anim.value(comp, layer, pr.hitLife, T)) : 1;
    // 空间场（同一场也作用于几何顶点）
    const fields = (pr.fields || []).map((ref) => G.fieldRef(project, comp, ref, T, layer)).filter(Boolean);
    // 碰撞体
    const planes = [];
    const meshes = [];
    (pr.colliders || []).forEach((c) => {
      if (c.kind === 'plane') {
        planes.push({ p: Anim.value(comp, layer, c.pos, T), n: U.vnorm(Anim.value(comp, layer, c.normal, T)) });
      } else if (c.kind === 'geo') {
        const tris = worldTriangles(project, comp, c, T);
        if (tris && tris.length) meshes.push(buildGrid(tris, 24, 3));
      }
    });
    const R = 2.5;
    sim.active.forEach((p) => {
      if (p.dead) return;
      // 力
      let a = U.vadd([0, 0, 0], g);
      const pp = p.pos;
      fields.forEach((f) => {
        const fv = f(pp, T);
        a = U.vadd(a, fv);
      });
      p.vel = U.vadd(p.vel, U.vmul(a, DT));
      p.vel = U.vmul(p.vel, Math.max(0, 1 - drag * DT));
      const prev = p.pos.slice();
      p.pos = U.vadd(p.pos, U.vmul(p.vel, DT));
      p.age += DT;
      // 平面碰撞
      planes.forEach((pl) => {
        const dPrev = U.vdot(U.vsub(prev, pl.p), pl.n);
        const d = U.vdot(U.vsub(p.pos, pl.p), pl.n);
        if (dPrev >= 0 && d < R) {
          p.pos = U.vadd(p.pos, U.vmul(pl.n, R - d));
          bounce(p, pl.n, rest, fric, k, hitLife);
        }
      });
      // 网格碰撞
      meshes.forEach((mg) => {
        const cell = mg.cell;
        const key = Math.floor(p.pos[0] / cell) + ',' + Math.floor(p.pos[1] / cell) + ',' + Math.floor(p.pos[2] / cell);
        const list = mg.grid.get(key);
        if (!list) return;
        for (const tri of list) {
          const hit = triHit(tri, p.pos, R);
          if (!hit) continue;
          if (U.vdot(p.vel, hit.n) >= 0) continue;
          p.pos = U.vadd(hit.q, U.vmul(hit.n, R));
          bounce(p, hit.n, rest, fric, k, hitLife);
          break;
        }
      });
      if (p.age >= p.life || k - p.b >= p.lifeSteps) p.dead = true;
    });
    // 次级发射：碰撞位置生成额外粒子
    const sec = pr.secondary;
    if (sec && sec.on) {
      sim.active.slice().forEach((p) => {
        if (p.hit === k) {
          const n = Math.round(Anim.value(comp, layer, sec.count, T));
          for (let i = 0; i < n && sim.count < (pr.maxParticles || 4000); i++) {
            const r = (c) => U.hash(p.seed, i, c);
            const ndir = coneDir(p.hitN || [0, -1, 0], U.deg2rad(70), r(1), r(2));
            const q = {
              id: sim.nextIndex++,
              b: k,
              life: Math.max(0.05, Anim.value(comp, layer, sec.life, T)),
              lifeSteps: Math.max(1, Math.round(Anim.value(comp, layer, sec.life, T) / DT)),
              pos: p.pos.slice(),
              vel: U.vmul(ndir, Anim.value(comp, layer, sec.speed, T) * (0.6 + 0.8 * r(3))),
              age: 0,
              samples: [],
              size0: p.size0 * 0.6,
              size1: 0.5,
              col0: Anim.value(comp, layer, pr.colorEnd, T),
              col1: [0.4, 0.1, 0.02],
              hit: -1,
              hitT: 0,
              dead: false,
              seed: p.seed + i + 77,
            };
            q.pos = U.vadd(q.pos, U.vmul(ndir, 1));
            sim.active.push(q);
            sim.all.push(q);
            sim.count++;
          }
        }
      });
    }
    sim.active = sim.active.filter((p) => !p.dead);
  }

  function bounce(p, n, rest, fric, k, hitLife) {
    const vn = U.vdot(p.vel, n);
    if (vn < 0) {
      const vt = U.vsub(p.vel, U.vmul(n, vn));
      p.vel = U.vadd(U.vmul(vt, 1 - fric), U.vmul(n, -vn * rest));
    }
    if (p.hit < 0) {
      p.hit = k;
      p.hitN = n;
      // 首次碰撞：寿命按倍率缩放（不少于当前年龄，避免瞬间消失）
      if (hitLife !== 1) {
        p.life = Math.max(p.age + 0.02, p.life * hitLife);
        p.lifeSteps = Math.max(1, Math.round(p.life / DT));
      }
    }
  }

  // 取样：返回当前时刻的粒子精灵（世界坐标）
  Particles.sprites = (project, comp, layer, t, ctx) => {
    const pr = layer.particles;
    if (!pr) return null;
    const sig = signature(project, comp, layer);
    let sim = sims.get(layer.id);
    if (!sim || sim.sig !== sig) {
      sim = newSim(sig);
      sims.set(layer.id, sim);
    }
    const tt = Math.max(0, Math.min(t, comp.duration + 1));
    // 多推进一步：插值需要下一步的样本，保证结果只取决于时刻本身，与推进路径无关
    advance(project, comp, layer, sim, tt + DT);
    const kt = tt / DT;
    const k = Math.floor(kt + 1e-9);
    const frac = U.clamp(kt - k, 0, 1);
    const trailOn = !!(pr.trail && pr.trail.on);
    const trailLen = trailOn ? Math.max(1, Math.round(Anim.value(comp, layer, pr.trail.length, t))) : 0;
    const trailW = trailOn ? Anim.value(comp, layer, pr.trail.width, t) : 0;
    const trailFade = trailOn ? U.clamp(Anim.value(comp, layer, pr.trail.fade, t) / 100, 0, 1) : 0;
    const glow = pr.glow === undefined ? 1 : pr.glow;
    const maxN = sim.all.length * (1 + trailLen) + 4;
    const pos = new Float32Array(maxN * 3);
    const col = new Float32Array(maxN * 4);
    const size = new Float32Array(maxN);
    let n = 0;
    const put = (x, y, z, r, g, b, a, s) => {
      pos[n * 3] = x;
      pos[n * 3 + 1] = y;
      pos[n * 3 + 2] = z;
      col[n * 4] = r;
      col[n * 4 + 1] = g;
      col[n * 4 + 2] = b;
      col[n * 4 + 3] = a * glow;
      size[n] = s;
      n++;
    };
    const posAt = (p, s) => {
      const i = (s - p.b) * 3;
      return [p.samples[i], p.samples[i + 1], p.samples[i + 2]];
    };
    for (const p of sim.all) {
      if (k < p.b || k - p.b >= p.samples.length / 3) continue;
      const local = k - p.b;
      const last = p.samples.length / 3 - 1;
      const a = posAt(p, k);
      const b = local < last ? posAt(p, k + 1) : a;
      const x = a[0] + (b[0] - a[0]) * frac, y = a[1] + (b[1] - a[1]) * frac, z = a[2] + (b[2] - a[2]) * frac;
      const age = (local + frac) * DT;
      const ratio = U.clamp(age / p.life, 0, 1);
      const sz = U.lerp(p.size0, p.size1, ratio);
      const c = [0, 1, 2].map((i) => U.lerp(p.col0[i], p.col1[i], ratio));
      let alpha = 1 - U.smoothstep(0.65, 1, ratio);
      if (p.hit >= 0 && k >= p.hit) {
        const since = (k - p.hit) * DT;
        const hot = 1 - U.smoothstep(0, 0.5, since);
        c[0] = U.lerp(c[0], 1, hot);
        c[1] = U.lerp(c[1], 0.95, hot);
        c[2] = U.lerp(c[2], 0.7, hot);
      }
      // 拖尾：沿实际轨迹向后取样
      if (trailLen > 0) {
        for (let j = 1; j <= trailLen; j++) {
          const sj = local - j;
          if (sj < 0) break;
          const q = posAt(p, p.b + sj);
          const f = 1 - j / (trailLen + 1);
          const ta = alpha * Math.pow(f, 1 + trailFade * 2) * 0.8;
          put(q[0], q[1], q[2], c[0], c[1], c[2], ta, Math.max(0.5, sz * (0.35 + 0.65 * f)) * (trailW / 4 || 1));
        }
      }
      put(x, y, z, c[0], c[1], c[2], alpha, sz);
    }
    if (!n) return null;
    return { pos: pos.subarray(0, n * 3), col: col.subarray(0, n * 4), size: size.subarray(0, n), count: n };
  };

  // 清理（工程关闭时）
  Particles.reset = () => sims.clear();
  void P;
})();
