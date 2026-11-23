// js/scene1-physics.js — 3D Stable Neo-Hookean XPBD Soft Bodies, 6-DOF Rigid Balls & Griffith Stress Fracture
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const { clamp, Quat, symmetricEigen3x3, closestPointOnTriangle } = App.Math;
  const { createFlutedDomeMesh, createCushionMesh, createPrismTowerMesh, JellyBody } = App.Scene1Mesh;

  const GRAVITY = -9.81;
  const TABLE_HALF_X = 3.55;
  const TABLE_HALF_Z = 2.25;

  class RigidBall {
    constructor(opts) {
      this.id = opts.id || 0;
      this.pos = opts.pos.slice();
      this.prevPos = opts.pos.slice();
      this.vel = opts.vel ? opts.vel.slice() : [0, 0, 0];
      this.quat = [0, 0, 0, 1];
      this.angVel = opts.angVel ? opts.angVel.slice() : [0, 0, 0];
      this.radius = opts.radius || 0.30;
      this.mass = opts.mass || 2.2;
      this.invMass = 1.0 / this.mass;
      this.inertia = 0.4 * this.mass * this.radius * this.radius;
      this.invInertia = 1.0 / this.inertia;
      this.restitution = opts.restitution !== undefined ? opts.restitution : 0.48;
      // material: 0 = tungsten steel, 1 = speckled granite stone, 2 = burnished brass
      this.material = opts.material !== undefined ? opts.material : 0;
      this.inJellyContact = false;
      this.prevVy = this.vel[1];
      this.peakDownSpeed = 0;
      this.active = true;
    }
  }

  class Scene1Physics {
    constructor() {
      this.jellies = [];
      this.balls = [];
      this.simTime = 0;
      this.nextBallId = 1;
      this.scheduledDrops = []; // For interactive multi-hit trigger

      // User-adjustable parameters (Section 4.2)
      this.params = {
        stiffness: 1.0,    // 0.25 (very soft) .. 2.5 (firm)
        toughness: 0.62,   // 0.15 (fragile) .. 1.0 (very tough)
        ballMass: 2.3,     // 0.6 .. 6.0 kg
        dropHeight: 2.65   // 1.3 .. 4.5 m
      };

      // Spatial hash for inter-jelly and fractured-chunk collision
      this._hashTable = new Map();
      this._hashCellSize = 0.14;
      // Pre-allocate larger render buffer for 11x8x11 high-detail hero mesh + fracture faces
      this.renderVerts = new Float32Array(420000);
      this.renderVertCount = 0;
      this.jellyRanges = [];

      // Cache base meshes so reset is instant (< 3 ms)
      // Hero ruby dome at 10x8x10 (4,000 isotropic non-inverted tets, strictly even grid = exact center vertex, zero concavity folds!)
      this._baseMeshes = {
        hero: createFlutedDomeMesh({ rBase: 0.86, rTop: 0.60, height: 0.90, lobes: 8, fluteAmp: 0.018, nx: 10, ny: 8, nz: 10 }),
        cushion: createCushionMesh({ sx: 1.12, sy: 0.72, sz: 1.02, nx: 7, ny: 5, nz: 7 }),
        prism: createPrismTowerMesh({ rBase: 0.64, rTop: 0.54, height: 1.02, nx: 7, ny: 7, nz: 7 })
      };

      this.reset();
    }

    reset(customOpts) {
      this.simTime = 0;
      this.balls = [];
      this.scheduledDrops = [];
      this.nextBallId = 1;
      const opts = customOpts || {};

      // Three distinct jellies on the architectural bench:
      // 0: Center Hero Ruby Fluted Pudding (medium, focal subject)
      // 1: Left Amber Citrus Cushion (softer, tougher — deep squash & catch!)
      // 2: Right Emerald Lime Tall Prism (firmer, bouncier — strong deflection!)
      this.jellies = [
        new JellyBody({
          id: 0,
          name: 'ruby',
          mesh: this._baseMeshes.hero,
          offset: opts.heroOffset || [0.0, 0.008, 0.0],
          absorption: [0.22, 4.95, 4.35],
          scatterColor: [0.96, 0.08, 0.16],
          baseTint: [0.82, 0.04, 0.11],
          stiffnessScale: 1.0,
          toughnessScale: 1.0,
          density: 1.14,
          dampingScale: 1.0
        }),
        new JellyBody({
          id: 1,
          name: 'amber',
          mesh: this._baseMeshes.cushion,
          offset: opts.leftOffset || [-1.85, 0.008, 0.22],
          absorption: [0.18, 1.55, 5.20],
          scatterColor: [0.98, 0.54, 0.04],
          baseTint: [0.88, 0.42, 0.02],
          stiffnessScale: 0.56,
          toughnessScale: 1.30,
          density: 1.08,
          dampingScale: 1.05
        }),
        new JellyBody({
          id: 2,
          name: 'emerald',
          mesh: this._baseMeshes.prism,
          offset: opts.rightOffset || [1.75, 0.008, -0.10],
          absorption: [4.65, 0.28, 2.75],
          scatterColor: [0.05, 0.84, 0.36],
          baseTint: [0.03, 0.66, 0.26],
          stiffnessScale: 1.85,
          toughnessScale: 1.40,
          density: 1.18,
          dampingScale: 0.88
        })
      ];

      // Quiet static gravity settle (so jellies stand in natural equilibrium at frame 0!)
      for (let k = 0; k < 22; k++) {
        this._stepInternal(1 / 60, true);
      }
      // Zero out residual tiny velocities after static settle
      for (const j of this.jellies) {
        j.vel.fill(0, 0, j.numVertices * 3);
        j.prevPos.set(j.pos.subarray(0, j.numVertices * 3));
        j.damage.fill(0);
      }
      this.simTime = 0;

      // Optional resting prop ball on stage (e.g. for offset roll-off collisions!)
      if (opts.restingBalls) {
        for (const b of opts.restingBalls) this.spawnBall(b);
      }
      this.packRenderBuffer();
    }

    spawnBall(opts) {
      const ball = new RigidBall({
        id: this.nextBallId++,
        pos: opts.pos,
        vel: opts.vel || [0, 0, 0],
        angVel: opts.angVel || [0, 0, 0],
        radius: opts.radius || 0.31,
        mass: opts.mass !== undefined ? opts.mass : this.params.ballMass,
        material: opts.material !== undefined ? opts.material : 0,
        restitution: opts.restitution !== undefined ? opts.restitution : 0.48
      });
      this.balls.push(ball);
      // Cap total active balls in interactive mode to keep bench uncluttered
      if (this.balls.length > 9) this.balls.shift();
      return ball;
    }

    // Three Interactive Impact Triggers (Section 2.3)
    triggerImpact(mode) {
      const m = this.params.ballMass;
      const h = this.params.dropHeight;
      // Keep ball radius scaled subtly with cube root of mass
      const r = clamp(0.24 + 0.055 * Math.cbrt(m), 0.25, 0.39);

      if (mode === 'center') {
        // Direct vertical drop straight onto center ruby jelly
        this.spawnBall({
          pos: [0.0, 0.90 + h * 0.68, 0.0],
          vel: [0.0, -Math.sqrt(2 * 9.81 * Math.max(0.2, h * 0.32)), 0.0],
          radius: r,
          mass: m,
          material: 0
        });
      } else if (mode === 'offset') {
        // Ensure there's a brass target ball sitting between center and emerald jelly for rich chain collision!
        if (this.balls.length === 0) {
          this.spawnBall({
            pos: [1.04, 0.23, 0.14],
            vel: [0, 0, 0],
            radius: 0.23,
            mass: 1.15,
            material: 2
          });
        }
        // Glancing off-center strike onto right-upper shoulder: tilts & slides center jelly left, ball rolls down flank into brass ball & emerald jelly!
        this.spawnBall({
          pos: [0.34, 0.90 + h * 0.42, 0.04],
          vel: [0.85, -Math.sqrt(2 * 9.81 * Math.max(0.2, h * 0.36)), 0.06],
          angVel: [0, 0, -4.5],
          radius: r,
          mass: m * 1.15,
          material: 0
        });
      } else if (mode === 'multi') {
        // Sequential escalating hits arriving before previous oscillations settle!
        const t0 = this.simTime;
        // Hit 1 immediately: medium granite stone ball
        this.spawnBall({
          pos: [-0.08, 0.90 + h * 0.48, 0.04],
          vel: [0.15, -Math.sqrt(2 * 9.81 * Math.max(0.2, h * 0.28)), -0.05],
          radius: clamp(r * 0.88, 0.24, 0.34),
          mass: m * 0.72,
          material: 1
        });
        // Hit 2 after 0.58s: brass ball heavier
        this.scheduledDrops.push({
          time: t0 + 0.58,
          opts: {
            pos: [0.10, 0.90 + h * 0.62, -0.05],
            vel: [-0.22, -Math.sqrt(2 * 9.81 * Math.max(0.3, h * 0.45)), 0.10],
            radius: clamp(r * 0.98, 0.26, 0.37),
            mass: m * 1.12,
            material: 2
          }
        });
        // Hit 3 after 1.18s: massive tungsten steel ball
        this.scheduledDrops.push({
          time: t0 + 1.18,
          opts: {
            pos: [0.0, 0.90 + h * 0.76, 0.02],
            vel: [0.0, -Math.sqrt(2 * 9.81 * Math.max(0.4, h * 0.72)), 0.0],
            radius: clamp(r * 1.12, 0.30, 0.42),
            mass: m * 1.65,
            material: 0
          }
        });
      } else if (mode === 'all') {
        // Bonus: simultaneous drops onto all 3 distinct jellies to showcase material differences!
        this.spawnBall({ pos: [-1.85, 0.74 + h * 0.58, 0.22], vel: [0, -2.5, 0], radius: r, mass: m, material: 1 });
        this.spawnBall({ pos: [0.0, 0.90 + h * 0.62, 0.0], vel: [0, -2.5, 0], radius: r, mass: m, material: 0 });
        this.spawnBall({ pos: [1.75, 1.02 + h * 0.58, -0.10], vel: [0, -2.5, 0], radius: r, mass: m, material: 2 });
      }
    }

    step(dt) {
      if (dt <= 0) return;
      // Fire any scheduled drops for multi-hit
      if (this.scheduledDrops.length > 0) {
        const remaining = [];
        for (const item of this.scheduledDrops) {
          if (this.simTime >= item.time) {
            this.spawnBall(item.opts);
          } else {
            remaining.push(item);
          }
        }
        this.scheduledDrops = remaining;
      }

      // Clamp outer dt and advance in fixed small steps
      const maxDt = 1 / 60;
      let rem = Math.min(dt, 0.05);
      while (rem > 1e-6) {
        const stepDt = Math.min(rem, maxDt);
        this._stepInternal(stepDt, false);
        rem -= stepDt;
      }
      this.packRenderBuffer();
    }

    _stepInternal(dt, isQuietSettle) {
      const numSubsteps = isQuietSettle ? 12 : 18;
      const h = dt / numSubsteps;
      const h2 = h * h;
      // Calibrated juicy gelatin Young's modulus: dramatic squash, wide lateral bulge, deep ball cupping & lush slow wobble!
      const baseE = 360.0 * this.params.stiffness;
      const nu = 0.46; // Strongly volume-preserving gelatin -> big radial bulge when squashed!

      const jellies = this.jellies;
      const balls = this.balls;
      const audio = App.Audio;

      for (let sub = 0; sub < numSubsteps; sub++) {
        // 1. Predict soft-body vertices
        for (let ji = 0; ji < jellies.length; ji++) {
          const j = jellies[ji];
          const n = j.numVertices;
          const pos = j.pos, prev = j.prevPos, vel = j.vel;
          const drag = isQuietSettle ? 0.94 : 0.9996;
          for (let i = 0; i < n; i++) {
            const idx = i * 3;
            prev[idx] = pos[idx];
            prev[idx + 1] = pos[idx + 1];
            prev[idx + 2] = pos[idx + 2];
            vel[idx] *= drag;
            vel[idx + 1] = vel[idx + 1] * drag + GRAVITY * h;
            vel[idx + 2] *= drag;
            pos[idx] += vel[idx] * h;
            pos[idx + 1] += vel[idx + 1] * h;
            pos[idx + 2] += vel[idx + 2] * h;
          }
        }

        // 2. Predict rigid balls
        for (let bi = 0; bi < balls.length; bi++) {
          const b = balls[bi];
          b.prevPos[0] = b.pos[0]; b.prevPos[1] = b.pos[1]; b.prevPos[2] = b.pos[2];
          b.vel[1] += GRAVITY * h;
          b.pos[0] += b.vel[0] * h;
          b.pos[1] += b.vel[1] * h;
          b.pos[2] += b.vel[2] * h;
          Quat.integrate(b.quat, b.angVel[0], b.angVel[1], b.angVel[2], h);
        }

        // 3. Solve Stable Neo-Hookean Tetrahedral XPBD constraints (alternating sweep direction!)
        const reverse = (sub & 1) === 1;
        for (let ji = 0; ji < jellies.length; ji++) {
          const j = jellies[ji];
          const E = baseE * j.stiffnessScale;
          const mu = E / (2.0 * (1.0 + nu));
          const lam = (E * nu) / ((1.0 + nu) * (1.0 - 2.0 * nu));
          const alphaShift = 1.0 + mu / lam;
          const invMuH2 = 1.0 / (mu * h2);
          const invLamH2 = 1.0 / (lam * h2);
          // Softer jellies have slightly more viscoelastic energy absorption -> can cup & engulf heavy balls ("把球弹起或吞住")!
          const softCatch = this.params.stiffness < 0.60 ? (1.0 + (0.60 - this.params.stiffness) * 3.8) : 1.0;
          const dampBeta = (isQuietSettle ? 0.025 : 0.0028 * softCatch) * j.dampingScale;
          this._solveJellyNeoHookean(j, alphaShift, invMuH2, invLamH2, dampBeta, h, reverse);
        }

        // 4. Solve Two-Way Jelly <-> Rigid Ball Contacts (Vertex + Boundary Triangle!)
        if (!isQuietSettle && balls.length > 0) {
          this._solveJellyBallContacts(h);
        }

        // 5. Solve Jelly-Jelly & Fractured Chunk-Chunk Collisions (every 2nd substep for speed!)
        if (!isQuietSettle && (sub & 1) === 0) {
          this._solveJellySelfAndPairCollisions();
        }

        // 6. Solve Jelly-Table Contact & Coulomb Friction
        for (let ji = 0; ji < jellies.length; ji++) {
          this._solveJellyTable(jellies[ji], isQuietSettle);
        }

        // 7. Update soft-body velocities from XPBD positional changes
        for (let ji = 0; ji < jellies.length; ji++) {
          const j = jellies[ji];
          const n = j.numVertices;
          const pos = j.pos, prev = j.prevPos, vel = j.vel;
          const invH = 1.0 / h;
          for (let i = 0; i < n; i++) {
            const idx = i * 3;
            let vx = (pos[idx] - prev[idx]) * invH;
            let vy = (pos[idx + 1] - prev[idx + 1]) * invH;
            let vz = (pos[idx + 2] - prev[idx + 2]) * invH;
            // Safety speed clamp against degenerate spikes
            const spd2 = vx * vx + vy * vy + vz * vz;
            if (spd2 > 400.0) {
              const s = 20.0 / Math.sqrt(spd2);
              vx *= s; vy *= s; vz *= s;
            }
            vel[idx] = vx; vel[idx + 1] = vy; vel[idx + 2] = vz;
          }
        }

        // 8. Update rigid ball velocities & solve Ball-Table + Ball-Ball rigid collisions
        if (!isQuietSettle && balls.length > 0) {
          const invH = 1.0 / h;
          for (let bi = 0; bi < balls.length; bi++) {
            const b = balls[bi];
            b.vel[0] = (b.pos[0] - b.prevPos[0]) * invH;
            b.vel[1] = (b.pos[1] - b.prevPos[1]) * invH;
            b.vel[2] = (b.pos[2] - b.prevPos[2]) * invH;
          }
          this._solveRigidCollisions(h, audio);
        }
      }

      // 9. Evaluate Cauchy Stress & Griffith Fracture Criterion once per outer step!
      if (!isQuietSettle) {
        this._evaluateFracture(dt, baseE, nu, audio);
        this.simTime += dt;
      }
    }

    _solveJellyNeoHookean(j, alphaShift, invMuH2, invLamH2, dampBeta, h, reverse) {
      const tets = j.tets;
      const invDm = j.invDm;
      const restVol = j.restVol;
      const pos = j.pos;
      const prev = j.prevPos;
      const invMass = j.invMass;
      const count = j.tetCount;

      const start = reverse ? count - 1 : 0;
      const end = reverse ? -1 : count;
      const step = reverse ? -1 : 1;

      for (let t = start; t !== end; t += step) {
        const i0 = tets[t * 4];
        const i1 = tets[t * 4 + 1];
        const i2 = tets[t * 4 + 2];
        const i3 = tets[t * 4 + 3];

        const w0 = invMass[i0], w1 = invMass[i1], w2 = invMass[i2], w3 = invMass[i3];
        const p0 = i0 * 3, p1 = i1 * 3, p2 = i2 * 3, p3 = i3 * 3;

        const x0 = pos[p0], y0 = pos[p0 + 1], z0 = pos[p0 + 2];
        const e10 = pos[p1] - x0, e11 = pos[p1 + 1] - y0, e12 = pos[p1 + 2] - z0;
        const e20 = pos[p2] - x0, e21 = pos[p2 + 1] - y0, e22 = pos[p2 + 2] - z0;
        const e30 = pos[p3] - x0, e31 = pos[p3 + 1] - y0, e32 = pos[p3 + 2] - z0;

        const o = t * 9;
        const b00 = invDm[o], b01 = invDm[o + 1], b02 = invDm[o + 2];
        const b10 = invDm[o + 3], b11 = invDm[o + 4], b12 = invDm[o + 5];
        const b20 = invDm[o + 6], b21 = invDm[o + 7], b22 = invDm[o + 8];

        // F = Ds * B (columns f0, f1, f2)
        const f00 = e10 * b00 + e20 * b10 + e30 * b20;
        const f10 = e11 * b00 + e21 * b10 + e31 * b20;
        const f20 = e12 * b00 + e22 * b10 + e32 * b20;

        const f01 = e10 * b01 + e20 * b11 + e30 * b21;
        const f11 = e11 * b01 + e21 * b11 + e31 * b21;
        const f21 = e12 * b01 + e22 * b11 + e32 * b21;

        const f02 = e10 * b02 + e20 * b12 + e30 * b22;
        const f12 = e11 * b02 + e21 * b12 + e31 * b22;
        const f22 = e12 * b02 + e22 * b12 + e32 * b22;

        const invV0 = 1.0 / restVol[t];

        // --- 1) Deviatoric Constraint C_D = ||F||_F ---
        const cD2 = f00 * f00 + f10 * f10 + f20 * f20 + f01 * f01 + f11 * f11 + f21 * f21 + f02 * f02 + f12 * f12 + f22 * f22;
        const cD = Math.sqrt(cD2);
        if (cD > 1e-6) {
          const invCD = 1.0 / cD;
          // G_D = (1/cD) * F * B^T -> columns g1, g2, g3
          const g1x = (f00 * b00 + f01 * b01 + f02 * b02) * invCD;
          const g1y = (f10 * b00 + f11 * b01 + f12 * b02) * invCD;
          const g1z = (f20 * b00 + f21 * b01 + f22 * b02) * invCD;

          const g2x = (f00 * b10 + f01 * b11 + f02 * b12) * invCD;
          const g2y = (f10 * b10 + f11 * b11 + f12 * b12) * invCD;
          const g2z = (f20 * b10 + f21 * b11 + f22 * b12) * invCD;

          const g3x = (f00 * b20 + f01 * b21 + f02 * b22) * invCD;
          const g3y = (f10 * b20 + f11 * b21 + f12 * b22) * invCD;
          const g3z = (f20 * b20 + f21 * b21 + f22 * b22) * invCD;

          const g0x = -(g1x + g2x + g3x);
          const g0y = -(g1y + g2y + g3y);
          const g0z = -(g1z + g2z + g3z);

          const wSum = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) +
                       w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
                       w2 * (g2x * g2x + g2y * g2y + g2z * g2z) +
                       w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
          const alphaD = invMuH2 * invV0;
          const gamma = dampBeta / h;
          const dDot =
            g0x * (pos[p0] - prev[p0]) + g0y * (pos[p0 + 1] - prev[p0 + 1]) + g0z * (pos[p0 + 2] - prev[p0 + 2]) +
            g1x * (pos[p1] - prev[p1]) + g1y * (pos[p1 + 1] - prev[p1 + 1]) + g1z * (pos[p1 + 2] - prev[p1 + 2]) +
            g2x * (pos[p2] - prev[p2]) + g2y * (pos[p2 + 1] - prev[p2 + 1]) + g2z * (pos[p2 + 2] - prev[p2 + 2]) +
            g3x * (pos[p3] - prev[p3]) + g3y * (pos[p3 + 1] - prev[p3 + 1]) + g3z * (pos[p3 + 2] - prev[p3 + 2]);

          const dLam = (-cD - gamma * dDot) / ((1.0 + gamma) * wSum + alphaD);
          pos[p0] += w0 * dLam * g0x; pos[p0 + 1] += w0 * dLam * g0y; pos[p0 + 2] += w0 * dLam * g0z;
          pos[p1] += w1 * dLam * g1x; pos[p1 + 1] += w1 * dLam * g1y; pos[p1 + 2] += w1 * dLam * g1z;
          pos[p2] += w2 * dLam * g2x; pos[p2 + 1] += w2 * dLam * g2y; pos[p2 + 2] += w2 * dLam * g2z;
          pos[p3] += w3 * dLam * g3x; pos[p3 + 1] += w3 * dLam * g3y; pos[p3 + 2] += w3 * dLam * g3z;
        }

        // --- 2) Hydrostatic (Volume Conservation) Constraint C_H = det(F) - (1 + mu/lambda) ---
        // Recompute F with updated vertex positions for crisp volume exactness
        const nx0 = pos[p0], ny0 = pos[p0 + 1], nz0 = pos[p0 + 2];
        const ne10 = pos[p1] - nx0, ne11 = pos[p1 + 1] - ny0, ne12 = pos[p1 + 2] - nz0;
        const ne20 = pos[p2] - nx0, ne21 = pos[p2 + 1] - ny0, ne22 = pos[p2 + 2] - nz0;
        const ne30 = pos[p3] - nx0, ne31 = pos[p3 + 1] - ny0, ne32 = pos[p3 + 2] - nz0;

        const hf00 = ne10 * b00 + ne20 * b10 + ne30 * b20;
        const hf10 = ne11 * b00 + ne21 * b10 + ne31 * b20;
        const hf20 = ne12 * b00 + ne22 * b10 + ne32 * b20;

        const hf01 = ne10 * b01 + ne20 * b11 + ne30 * b21;
        const hf11 = ne11 * b01 + ne21 * b11 + ne31 * b21;
        const hf21 = ne12 * b01 + ne22 * b11 + ne32 * b21;

        const hf02 = ne10 * b02 + ne20 * b12 + ne30 * b22;
        const hf12 = ne11 * b02 + ne21 * b12 + ne31 * b22;
        const hf22 = ne12 * b02 + ne22 * b12 + ne32 * b22;

        // Cofactor matrix J_F = [f1 x f2, f2 x f0, f0 x f1]
        const j00 = hf11 * hf22 - hf21 * hf12;
        const j10 = hf21 * hf02 - hf01 * hf22;
        const j20 = hf01 * hf12 - hf11 * hf02;

        const j01 = hf12 * hf20 - hf22 * hf10;
        const j11 = hf22 * hf00 - hf02 * hf20;
        const j21 = hf02 * hf10 - hf12 * hf00;

        const j02 = hf10 * hf21 - hf20 * hf11;
        const j12 = hf20 * hf01 - hf00 * hf21;
        const j22 = hf00 * hf11 - hf10 * hf01;

        const detF = hf00 * j00 + hf10 * j10 + hf20 * j20;
        const cH = detF - alphaShift;

        const hg1x = j00 * b00 + j01 * b01 + j02 * b02;
        const hg1y = j10 * b00 + j11 * b01 + j12 * b02;
        const hg1z = j20 * b00 + j21 * b01 + j22 * b02;

        const hg2x = j00 * b10 + j01 * b11 + j02 * b12;
        const hg2y = j10 * b10 + j11 * b11 + j12 * b12;
        const hg2z = j20 * b10 + j21 * b11 + j22 * b12;

        const hg3x = j00 * b20 + j01 * b21 + j02 * b22;
        const hg3y = j10 * b20 + j11 * b21 + j12 * b22;
        const hg3z = j20 * b20 + j21 * b21 + j22 * b22;

        const hg0x = -(hg1x + hg2x + hg3x);
        const hg0y = -(hg1y + hg2y + hg3y);
        const hg0z = -(hg1z + hg2z + hg3z);

        const hwSum = w0 * (hg0x * hg0x + hg0y * hg0y + hg0z * hg0z) +
                      w1 * (hg1x * hg1x + hg1y * hg1y + hg1z * hg1z) +
                      w2 * (hg2x * hg2x + hg2y * hg2y + hg2z * hg2z) +
                      w3 * (hg3x * hg3x + hg3y * hg3y + hg3z * hg3z);
        const alphaH = invLamH2 * invV0;
        const gammaH = dampBeta * 0.5 / h;
        const hdDot =
          hg0x * (pos[p0] - prev[p0]) + hg0y * (pos[p0 + 1] - prev[p0 + 1]) + hg0z * (pos[p0 + 2] - prev[p0 + 2]) +
          hg1x * (pos[p1] - prev[p1]) + hg1y * (pos[p1 + 1] - prev[p1 + 1]) + hg1z * (pos[p1 + 2] - prev[p1 + 2]) +
          hg2x * (pos[p2] - prev[p2]) + hg2y * (pos[p2 + 1] - prev[p2 + 1]) + hg2z * (pos[p2 + 2] - prev[p2 + 2]) +
          hg3x * (pos[p3] - prev[p3]) + hg3y * (pos[p3 + 1] - prev[p3 + 1]) + hg3z * (pos[p3 + 2] - prev[p3 + 2]);

        const dLamH = (-cH - gammaH * hdDot) / ((1.0 + gammaH) * hwSum + alphaH);
        pos[p0] += w0 * dLamH * hg0x; pos[p0 + 1] += w0 * dLamH * hg0y; pos[p0 + 2] += w0 * dLamH * hg0z;
        pos[p1] += w1 * dLamH * hg1x; pos[p1 + 1] += w1 * dLamH * hg1y; pos[p1 + 2] += w1 * dLamH * hg1z;
        pos[p2] += w2 * dLamH * hg2x; pos[p2 + 1] += w2 * dLamH * hg2y; pos[p2 + 2] += w2 * dLamH * hg2z;
        pos[p3] += w3 * dLamH * hg3x; pos[p3 + 1] += w3 * dLamH * hg3y; pos[p3 + 2] += w3 * dLamH * hg3z;
      }
    }

    // Two-way XPBD surface-triangle & vertex contact between every jelly and every heavy rigid ball
    _solveJellyBallContacts(h) {
      const jellies = this.jellies;
      const balls = this.balls;
      const audio = App.Audio;

      for (let bi = 0; bi < balls.length; bi++) {
        const b = balls[bi];
        const r = b.radius;
        const r2 = r * r;
        const wb = b.invMass;
        let touched = false;
        let maxImpactSpeed = 0;

        for (let ji = 0; ji < jellies.length; ji++) {
          const j = jellies[ji];
          const pos = j.pos, prev = j.prevPos, invMass = j.invMass;
          const tris = j.boundaryTris;
          const triCount = tris.length / 3;

          // Quick AABB cull around jelly
          let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
          const bVerts = j.boundaryVertList;
          for (let k = 0; k < bVerts.length; k++) {
            const idx = bVerts[k] * 3;
            const x = pos[idx], y = pos[idx + 1], z = pos[idx + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
          }
          if (b.pos[0] + r < minX || b.pos[0] - r > maxX ||
              b.pos[1] + r < minY || b.pos[1] - r > maxY ||
              b.pos[2] + r < minZ || b.pos[2] - r > maxZ) {
            continue;
          }

          // Pass A: Surface triangle vs sphere (prevents ball poking between vertices -> smooth wrap-around!)
          for (let f = 0; f < triCount; f++) {
            const a = tris[f * 3], bb = tris[f * 3 + 1], c = tris[f * 3 + 2];
            const ia = a * 3, ib = bb * 3, ic = c * 3;
            const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
            const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
            const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];

            // Fast triangle bounding check
            const tMinX = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx);
            const tMaxX = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx);
            if (b.pos[0] + r < tMinX || b.pos[0] - r > tMaxX) continue;
            const tMinY = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy);
            const tMaxY = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy);
            if (b.pos[1] + r < tMinY || b.pos[1] - r > tMaxY) continue;
            const tMinZ = az < bz ? (az < cz ? az : cz) : (bz < cz ? bz : cz);
            const tMaxZ = az > bz ? (az > cz ? az : cz) : (bz > cz ? bz : cz);
            if (b.pos[2] + r < tMinZ || b.pos[2] - r > tMaxZ) continue;

            const cp = closestPointOnTriangle(b.pos[0], b.pos[1], b.pos[2], ax, ay, az, bx, by, bz, cx, cy, cz);
            const dx = b.pos[0] - cp.x;
            const dy = b.pos[1] - cp.y;
            const dz = b.pos[2] - cp.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= r2 || d2 < 1e-12) continue;

            const d = Math.sqrt(d2);
            const pen = r - d;
            const nx = dx / d, ny = dy / d, nz = dz / d; // points from jelly -> ball

            const wa = invMass[a], wbb = invMass[bb], wc = invMass[c];
            const u = cp.u, v = cp.v, w = cp.w;
            const wEff = wb + wa * u * u + wbb * v * v + wc * w * w;
            if (wEff < 1e-9) continue;

            const corr = pen / wEff;
            // Push ball out along +n
            b.pos[0] += wb * corr * nx;
            b.pos[1] += wb * corr * ny;
            b.pos[2] += wb * corr * nz;
            // Push jelly vertices inward along -n
            const ca = wa * u * corr, cb = wbb * v * corr, cc = wc * w * corr;
            pos[ia] -= ca * nx; pos[ia + 1] -= ca * ny; pos[ia + 2] -= ca * nz;
            pos[ib] -= cb * nx; pos[ib + 1] -= cb * ny; pos[ib + 2] -= cb * nz;
            pos[ic] -= cc * nx; pos[ic + 1] -= cc * ny; pos[ic + 2] -= cc * nz;

            // Tangential contact friction + rolling torque transfer!
            const bvx = (b.pos[0] - b.prevPos[0]) / h;
            const bvy = (b.pos[1] - b.prevPos[1]) / h;
            const bvz = (b.pos[2] - b.prevPos[2]) / h;
            const jvx = (u * (pos[ia] - prev[ia]) + v * (pos[ib] - prev[ib]) + w * (pos[ic] - prev[ic])) / h;
            const jvy = (u * (pos[ia + 1] - prev[ia + 1]) + v * (pos[ib + 1] - prev[ib + 1]) + w * (pos[ic + 1] - prev[ic + 1])) / h;
            const jvz = (u * (pos[ia + 2] - prev[ia + 2]) + v * (pos[ib + 2] - prev[ib + 2]) + w * (pos[ic + 2] - prev[ic + 2])) / h;

            // Contact arm from ball center to contact point = -r * n
            const rx = -r * nx, ry = -r * ny, rz = -r * nz;
            const surfVx = bvx + (b.angVel[1] * rz - b.angVel[2] * ry) - jvx;
            const surfVy = bvy + (b.angVel[2] * rx - b.angVel[0] * rz) - jvy;
            const surfVz = bvz + (b.angVel[0] * ry - b.angVel[1] * rx) - jvz;
            const vn = surfVx * nx + surfVy * ny + surfVz * nz;
            if (-vn > maxImpactSpeed) maxImpactSpeed = -vn;

            const tx = surfVx - vn * nx;
            const ty = surfVy - vn * ny;
            const tz = surfVz - vn * nz;
            const tLen = Math.hypot(tx, ty, tz);
            if (tLen > 1e-4) {
              const muFric = 0.24; // Wet gelatin slight grip (enables realistic ball rolling & oblique tilt!)
              const fMag = Math.min(tLen * h * 0.22, muFric * pen);
              const fx = (tx / tLen) * fMag / wEff;
              const fy = (ty / tLen) * fMag / wEff;
              const fz = (tz / tLen) * fMag / wEff;
              b.pos[0] -= wb * fx; b.pos[1] -= wb * fy; b.pos[2] -= wb * fz;
              pos[ia] += wa * u * fx; pos[ia + 1] += wa * u * fy; pos[ia + 2] += wa * u * fz;
              pos[ib] += wbb * v * fx; pos[ib + 1] += wbb * v * fy; pos[ib + 2] += wbb * v * fz;
              pos[ic] += wc * w * fx; pos[ic + 1] += wc * w * fy; pos[ic + 2] += wc * w * fz;
              // Rolling torque on ball: tau = r x (-F_impulse)
              const impX = -fx / h, impY = -fy / h, impZ = -fz / h;
              b.angVel[0] += b.invInertia * (ry * impZ - rz * impY);
              b.angVel[1] += b.invInertia * (rz * impX - rx * impZ);
              b.angVel[2] += b.invInertia * (rx * impY - ry * impX);
            }
            touched = true;
          }
        }

        // Trigger jelly impact / rebound foley sound cleanly on contact transitions!
        if (touched && !b.inJellyContact && maxImpactSpeed > 0.7) {
          audio.playJellyImpact(clamp((maxImpactSpeed * Math.sqrt(b.mass)) / 9.5, 0.12, 1.0), this.params.stiffness);
          b.peakDownSpeed = maxImpactSpeed;
        } else if (!touched && b.inJellyContact && b.vel[1] > 1.25) {
          audio.playJellyRebound(clamp(b.vel[1] / 5.5, 0.12, 0.85), this.params.stiffness);
        }
        b.inJellyContact = touched;
      }
    }

    // Spatial-hash collision between distinct jellies & across fractured jelly chunks!
    _solveJellySelfAndPairCollisions() {
      const table = this._hashTable;
      table.clear();
      const cellSize = this._hashCellSize;
      const invCell = 1.0 / cellSize;
      const minDist = 0.088;
      const minDist2 = minDist * minDist;
      const jellies = this.jellies;

      // Insert all boundary vertices of all jellies
      for (let ji = 0; ji < jellies.length; ji++) {
        const j = jellies[ji];
        const pos = j.pos;
        const bVerts = j.boundaryVertList;
        for (let k = 0; k < bVerts.length; k++) {
          const vi = bVerts[k];
          const gx = Math.floor(pos[vi * 3] * invCell);
          const gy = Math.floor(pos[vi * 3 + 1] * invCell);
          const gz = Math.floor(pos[vi * 3 + 2] * invCell);
          const key = ((gx + 512) * 1048576) + ((gy + 512) * 1024) + (gz + 512);
          let bucket = table.get(key);
          if (!bucket) { bucket = []; table.set(key, bucket); }
          bucket.push((ji << 20) | vi);
        }
      }

      // Check local neighborhood (self + 13 positive-direction neighbors to avoid duplicate pairs)
      for (const [key, bucket] of table.entries()) {
        const len = bucket.length;
        // Pairs within same cell
        for (let a = 0; a < len; a++) {
          for (let b = a + 1; b < len; b++) {
            this._repelBoundaryPair(bucket[a], bucket[b], minDist, minDist2);
          }
        }
        // Pairs with forward neighboring cells
        const nKeys = [
          key + 1, key + 1024, key + 1025, key + 1023,
          key + 1048576, key + 1048577, key + 1048575,
          key + 1049600, key + 1049601, key + 1049599,
          key + 1047552, key + 1047553, key + 1047551
        ];
        for (let ni = 0; ni < nKeys.length; ni++) {
          const nb = table.get(nKeys[ni]);
          if (!nb) continue;
          for (let a = 0; a < len; a++) {
            for (let b = 0; b < nb.length; b++) {
              this._repelBoundaryPair(bucket[a], nb[b], minDist, minDist2);
            }
          }
        }
      }
    }

    _repelBoundaryPair(codeA, codeB, minDist, minDist2) {
      const jiA = codeA >>> 20, viA = codeA & 0xFFFFF;
      const jiB = codeB >>> 20, viB = codeB & 0xFFFFF;
      const jA = this.jellies[jiA], jB = this.jellies[jiB];

      if (jiA === jiB) {
        // Same jelly: only repel if vertices are far apart in rest pose OR across a fracture split!
        const rdx = jA.restPos[viA * 3] - jA.restPos[viB * 3];
        const rdy = jA.restPos[viA * 3 + 1] - jA.restPos[viB * 3 + 1];
        const rdz = jA.restPos[viA * 3 + 2] - jA.restPos[viB * 3 + 2];
        const restD2 = rdx * rdx + rdy * rdy + rdz * rdz;
        if (restD2 < 0.065) {
          // Close in rest pose: only repel if separated by fracture (not sharing any tet!)
          if (!jA.isSplitVert[viA] && !jA.isSplitVert[viB]) return;
          // Quick check if viA and viB share a tet
          const tetsA = jA.vertTets[viA];
          const tets = jA.tets;
          for (let k = 0; k < tetsA.length; k++) {
            const base = tetsA[k] * 4;
            if (tets[base] === viB || tets[base + 1] === viB || tets[base + 2] === viB || tets[base + 3] === viB) {
              return;
            }
          }
        }
      }

      const ia = viA * 3, ib = viB * 3;
      const dx = jB.pos[ib] - jA.pos[ia];
      const dy = jB.pos[ib + 1] - jA.pos[ia + 1];
      const dz = jB.pos[ib + 2] - jA.pos[ia + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= minDist2 || d2 < 1e-10) return;

      const d = Math.sqrt(d2);
      const pen = (minDist - d) * 0.42;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const wA = jA.invMass[viA], wB = jB.invMass[viB];
      const wSum = wA + wB;
      if (wSum < 1e-9) return;
      const sA = (wA / wSum) * pen;
      const sB = (wB / wSum) * pen;

      jA.pos[ia] -= sA * nx; jA.pos[ia + 1] -= sA * ny; jA.pos[ia + 2] -= sA * nz;
      jB.pos[ib] += sB * nx; jB.pos[ib + 1] += sB * ny; jB.pos[ib + 2] += sB * nz;
    }

    _solveJellyTable(j, isQuietSettle) {
      const n = j.numVertices;
      const pos = j.pos, prev = j.prevPos;
      // Keep bottom vertices 8mm above y=0 table surface to completely eliminate depth z-fighting!
      const floorY = 0.008;
      // Smooth wet gelatin bench friction: center hits stay planted symmetrically, offset hits tilt, rock & visibly slide across the bench!
      const muStatic = isQuietSettle ? 0.95 : 0.065;
      for (let i = 0; i < n; i++) {
        const idx = i * 3;
        if (pos[idx + 1] < floorY) {
          const pen = floorY - pos[idx + 1];
          pos[idx + 1] = floorY;
          const dx = pos[idx] - prev[idx];
          const dz = pos[idx + 2] - prev[idx + 2];
          const horiz = Math.hypot(dx, dz);
          if (horiz > 1e-6) {
            const maxFric = muStatic * pen * 2.2;
            const scale = horiz <= maxFric ? 0.0 : (horiz - maxFric) / horiz;
            pos[idx] = prev[idx] + dx * scale;
            pos[idx + 2] = prev[idx + 2] + dz * scale;
          }
        }
        // Keep safely within bench borders
        if (pos[idx] < -TABLE_HALF_X + 0.05) pos[idx] = -TABLE_HALF_X + 0.05;
        if (pos[idx] > TABLE_HALF_X - 0.05) pos[idx] = TABLE_HALF_X - 0.05;
        if (pos[idx + 2] < -TABLE_HALF_Z + 0.05) pos[idx + 2] = -TABLE_HALF_Z + 0.05;
        if (pos[idx + 2] > TABLE_HALF_Z - 0.05) pos[idx + 2] = TABLE_HALF_Z - 0.05;
      }
    }

    _solveRigidCollisions(h, audio) {
      const balls = this.balls;
      const matName = ['metal', 'stone', 'metal'];

      // 1. Ball vs Table & Bench Perimeter Rim
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const r = b.radius;
        if (b.pos[1] < r) {
          const vn = b.vel[1];
          b.pos[1] = r;
          if (vn < 0) {
            const imp = -(1.0 + b.restitution) * vn;
            b.vel[1] += imp;
            if (-vn > 0.65) {
              audio.playRigidHit(clamp((-vn * Math.sqrt(b.mass)) / 10.0, 0.08, 0.85), 'table');
            }
          }
          // True rolling Coulomb friction with table surface!
          const surfVx = b.vel[0] - b.angVel[2] * r;
          const surfVz = b.vel[2] + b.angVel[0] * r;
          const sLen = Math.hypot(surfVx, surfVz);
          if (sLen > 1e-4) {
            const fric = Math.min(sLen * 0.35, 0.45 * 9.81 * h);
            const jx = -(surfVx / sLen) * fric / (1.0 + 2.5);
            const jz = -(surfVz / sLen) * fric / (1.0 + 2.5);
            b.vel[0] += jx;
            b.vel[2] += jz;
            b.angVel[2] -= (jx / r) * 2.5;
            b.angVel[0] += (jz / r) * 2.5;
          }
          // Gentle rolling resistance so balls come to a calm halt smoothly
          b.vel[0] *= 0.9992;
          b.vel[2] *= 0.9992;
          b.angVel[0] *= 0.9985;
          b.angVel[1] *= 0.996;
          b.angVel[2] *= 0.9985;
        }

        // Sleek raised aluminum bench rim keeps rolling balls on the stage
        if (b.pos[0] < -TABLE_HALF_X + r) {
          b.pos[0] = -TABLE_HALF_X + r;
          if (b.vel[0] < 0) {
            if (-b.vel[0] > 0.6) audio.playRigidHit(clamp(-b.vel[0] / 7, 0.08, 0.7), 'metal');
            b.vel[0] *= -0.58;
          }
        } else if (b.pos[0] > TABLE_HALF_X - r) {
          b.pos[0] = TABLE_HALF_X - r;
          if (b.vel[0] > 0) {
            if (b.vel[0] > 0.6) audio.playRigidHit(clamp(b.vel[0] / 7, 0.08, 0.7), 'metal');
            b.vel[0] *= -0.58;
          }
        }
        if (b.pos[2] < -TABLE_HALF_Z + r) {
          b.pos[2] = -TABLE_HALF_Z + r;
          if (b.vel[2] < 0) {
            if (-b.vel[2] > 0.6) audio.playRigidHit(clamp(-b.vel[2] / 7, 0.08, 0.7), 'metal');
            b.vel[2] *= -0.58;
          }
        } else if (b.pos[2] > TABLE_HALF_Z - r) {
          b.pos[2] = TABLE_HALF_Z - r;
          if (b.vel[2] > 0) {
            if (b.vel[2] > 0.6) audio.playRigidHit(clamp(b.vel[2] / 7, 0.08, 0.7), 'metal');
            b.vel[2] *= -0.58;
          }
        }
      }

      // 2. Ball vs Ball exact 3D rigid impulse collision
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        for (let k = i + 1; k < balls.length; k++) {
          const b = balls[k];
          const dx = b.pos[0] - a.pos[0];
          const dy = b.pos[1] - a.pos[1];
          const dz = b.pos[2] - a.pos[2];
          const rSum = a.radius + b.radius;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= rSum * rSum || d2 < 1e-10) continue;

          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const pen = rSum - d;
          const wSum = a.invMass + b.invMass;
          a.pos[0] -= (a.invMass / wSum) * pen * nx;
          a.pos[1] -= (a.invMass / wSum) * pen * ny;
          a.pos[2] -= (a.invMass / wSum) * pen * nz;
          b.pos[0] += (b.invMass / wSum) * pen * nx;
          b.pos[1] += (b.invMass / wSum) * pen * ny;
          b.pos[2] += (b.invMass / wSum) * pen * nz;

          const rvx = b.vel[0] - a.vel[0];
          const rvy = b.vel[1] - a.vel[1];
          const rvz = b.vel[2] - a.vel[2];
          const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            const e = 0.68;
            const jImp = (-(1.0 + e) * vn) / wSum;
            a.vel[0] -= a.invMass * jImp * nx;
            a.vel[1] -= a.invMass * jImp * ny;
            a.vel[2] -= a.invMass * jImp * nz;
            b.vel[0] += b.invMass * jImp * nx;
            b.vel[1] += b.invMass * jImp * ny;
            b.vel[2] += b.invMass * jImp * nz;

            if (-vn > 0.45) {
              const mType = a.material === 1 && b.material === 1 ? 'stone' : matName[a.material];
              audio.playRigidHit(clamp((-vn) / 6.5, 0.12, 1.0), mType);
            }
          }
        }
      }
    }

    // Exact Cauchy Stress Evaluation + Griffith Strain-Energy Fracture Criterion + Coherent Propagating Crack Sheets!
    _evaluateFracture(dt, baseE, nu, audio) {
      const toughSlider = this.params.toughness; // [0.15 .. 1.0]
      // Calibrated Griffith threshold for baseE = 360:
      // - Default tough=0.62 -> crit ~ 860 -> normal 2.3kg drop rebounds cleanly with ZERO cracks!
      // - tough=0.35 -> partial crack; tough=0.22 or heavy 4.8kg multi-hit -> cleaves cleanly into elastic chunks!
      // - tough >= 0.90 -> extra-tough resilient gelatin (resists even extreme blows without cracking!)
      const toughBoost = toughSlider > 0.85 ? (1.0 + (toughSlider - 0.85) * 14.0) : 1.0;
      const baseThreshold = (145.0 + 1450.0 * Math.pow(toughSlider, 1.55)) * toughBoost;

      for (let ji = 0; ji < this.jellies.length; ji++) {
        const j = this.jellies[ji];
        const E = baseE * j.stiffnessScale;
        const mu = E / (2.0 * (1.0 + nu));
        const lam = (E * nu) / ((1.0 + nu) * (1.0 - 2.0 * nu));
        const alphaShift = 1.0 + mu / lam;
        const griffithScale = Math.sqrt(Math.max(0.25, E / 360.0));
        const critThreshold = baseThreshold * griffithScale * j.toughnessScale;

        const n = j.numVertices;
        j.vertStress.fill(0, 0, n);
        j.vertStressDir.fill(0, 0, n * 3);
        j.vertStressW.fill(0, 0, n);

        const tets = j.tets;
        const invDm = j.invDm;
        const pos = j.pos;
        const rp = j.restPos;
        const restVol = j.restVol;

        let peakStress = 0;
        let peakVert = -1;

        for (let t = 0; t < j.tetCount; t++) {
          const i0 = tets[t * 4], i1 = tets[t * 4 + 1], i2 = tets[t * 4 + 2], i3 = tets[t * 4 + 3];
          const p0 = i0 * 3, p1 = i1 * 3, p2 = i2 * 3, p3 = i3 * 3;
          const x0 = pos[p0], y0 = pos[p0 + 1], z0 = pos[p0 + 2];
          const e10 = pos[p1] - x0, e11 = pos[p1 + 1] - y0, e12 = pos[p1 + 2] - z0;
          const e20 = pos[p2] - x0, e21 = pos[p2 + 1] - y0, e22 = pos[p2 + 2] - z0;
          const e30 = pos[p3] - x0, e31 = pos[p3 + 1] - y0, e32 = pos[p3 + 2] - z0;

          const o = t * 9;
          const b00 = invDm[o], b01 = invDm[o + 1], b02 = invDm[o + 2];
          const b10 = invDm[o + 3], b11 = invDm[o + 4], b12 = invDm[o + 5];
          const b20 = invDm[o + 6], b21 = invDm[o + 7], b22 = invDm[o + 8];

          const f00 = e10 * b00 + e20 * b10 + e30 * b20;
          const f10 = e11 * b00 + e21 * b10 + e31 * b20;
          const f20 = e12 * b00 + e22 * b10 + e32 * b20;

          const f01 = e10 * b01 + e20 * b11 + e30 * b21;
          const f11 = e11 * b01 + e21 * b11 + e31 * b21;
          const f21 = e12 * b01 + e22 * b11 + e32 * b21;

          const f02 = e10 * b02 + e20 * b12 + e30 * b22;
          const f12 = e11 * b02 + e21 * b12 + e31 * b22;
          const f22 = e12 * b02 + e22 * b12 + e32 * b22;

          const j00 = f11 * f22 - f21 * f12;
          const j10 = f21 * f02 - f01 * f22;
          const j20 = f01 * f12 - f11 * f02;
          const j01 = f12 * f20 - f22 * f10;
          const j11 = f22 * f00 - f02 * f20;
          const j21 = f02 * f10 - f12 * f00;
          const j02 = f10 * f21 - f20 * f11;
          const j12 = f20 * f01 - f00 * f21;
          const j22 = f00 * f11 - f10 * f01;

          const detF = f00 * j00 + f10 * j10 + f20 * j20;
          const hScale = lam * (detF - alphaShift);
          const invJ = 1.0 / Math.max(detF, 0.35);

          const P00 = mu * f00 + hScale * j00, P01 = mu * f01 + hScale * j01, P02 = mu * f02 + hScale * j02;
          const P10 = mu * f10 + hScale * j10, P11 = mu * f11 + hScale * j11, P12 = mu * f12 + hScale * j12;
          const P20 = mu * f20 + hScale * j20, P21 = mu * f21 + hScale * j21, P22 = mu * f22 + hScale * j22;

          const s00 = (P00 * f00 + P01 * f01 + P02 * f02) * invJ;
          const s11 = (P10 * f10 + P11 * f11 + P12 * f12) * invJ;
          const s22 = (P20 * f20 + P21 * f21 + P22 * f22) * invJ;
          const s01 = (P00 * f10 + P01 * f11 + P02 * f12) * invJ;
          const s02 = (P00 * f20 + P01 * f21 + P02 * f22) * invJ;
          const s12 = (P10 * f20 + P11 * f21 + P12 * f22) * invJ;

          const eig = symmetricEigen3x3(s00, s11, s22, s01, s02, s12);
          const tensile = Math.max(0.0, eig.l1);
          const shear = 0.5 * (eig.l1 - eig.l3);
          const driver = tensile * 0.65 + shear * 0.55;
          if (driver < critThreshold * 0.35) continue;

          const w = restVol[t] * driver;
          const idx4 = [i0, i1, i2, i3];
          for (let c = 0; c < 4; c++) {
            const vi = idx4[c];
            if (driver > j.vertStress[vi]) {
              j.vertStress[vi] = driver;
              if (driver > peakStress) { peakStress = driver; peakVert = vi; }
            }
            let dx = eig.vx, dy = eig.vy, dz = eig.vz;
            const curX = j.vertStressDir[vi * 3], curY = j.vertStressDir[vi * 3 + 1], curZ = j.vertStressDir[vi * 3 + 2];
            if (curX * dx + curY * dy + curZ * dz < 0) { dx = -dx; dy = -dy; dz = -dz; }
            j.vertStressDir[vi * 3] += dx * w;
            j.vertStressDir[vi * 3 + 1] += dy * w;
            j.vertStressDir[vi * 3 + 2] += dz * w;
            j.vertStressW[vi] += w;
          }
        }

        // Accumulate fatigue damage from super-critical Cauchy stress!
        j.lastPeakStress = peakStress;
        for (let i = 0; i < n; i++) {
          const s = j.vertStress[i];
          if (s > critThreshold) {
            const excess = (s - critThreshold) / critThreshold;
            j.damage[i] += (0.55 + excess * 2.2) * dt * 11.5;
          } else {
            j.damage[i] = Math.max(0.0, j.damage[i] - dt * 0.25);
          }
        }

        // 1. Nucleate new coherent crack sheet when peak damaged vertex crosses 1.0 (max 2 sheets per jelly -> 2-4 clean juicy chunks!)
        if (peakVert >= 0 && j.damage[peakVert] >= 1.0 && j.activeCracks.length < 2) {
          const ox = rp[peakVert * 3], oy = rp[peakVert * 3 + 1], oz = rp[peakVert * 3 + 2];
          let nx = j.vertStressDir[peakVert * 3];
          let ny = j.vertStressDir[peakVert * 3 + 1];
          let nz = j.vertStressDir[peakVert * 3 + 2];
          // Under vertical punch, hoop tension is mostly horizontal -> cleave vertically/obliquely right through impact crater!
          ny *= 0.22;
          let len = Math.hypot(nx, ny, nz);
          if (len < 0.05) { nx = 0.85; ny = 0.0; nz = 0.52; len = 1.0; }
          nx /= len; ny /= len; nz /= len;

          // If a 1st crack already exists, require 2nd crack to be angled sharply (~cross-cleave) and strongly stressed!
          let allow = true;
          if (j.activeCracks.length === 1) {
            const c0 = j.activeCracks[0];
            const align = Math.abs(nx * c0.nx + ny * c0.ny + nz * c0.nz);
            if (align > 0.72 || peakStress < critThreshold * 1.45) {
              allow = false;
            } else {
              // Orthogonalize subtly so cross-cleave produces 3 clean hefty chunks
              nx -= (nx * c0.nx + ny * c0.ny + nz * c0.nz) * c0.nx * 0.65;
              nz -= (nx * c0.nx + ny * c0.ny + nz * c0.nz) * c0.nz * 0.65;
              const nl = Math.hypot(nx, ny, nz) || 1;
              nx /= nl; ny /= nl; nz /= nl;
            }
          }

          if (allow) {
            j.activeCracks.push({ ox, oy, oz, nx, ny, nz, radius: 0.26, splits: 0 });
          }
        }

        // 2. Propagate active crack sheets organically while local tip stress exceeds Griffith propagation threshold!
        let splitsThisStep = 0;
        for (let ci = 0; ci < j.activeCracks.length; ci++) {
          const ck = j.activeCracks[ci];
          if (ck.radius > 2.4) continue;

          // Measure peak stress near the active crack tip ring!
          let tipPeak = 0;
          for (let i = 0; i < n; i++) {
            const dx = rp[i * 3] - ck.ox, dy = rp[i * 3 + 1] - ck.oy, dz = rp[i * 3 + 2] - ck.oz;
            const planeD = Math.abs(dx * ck.nx + dy * ck.ny + dz * ck.nz);
            if (planeD > 0.24) continue;
            const radD = Math.hypot(dx, dy, dz);
            if (radD <= ck.radius + 0.42 && j.vertStress[i] > tipPeak) {
              tipPeak = j.vertStress[i];
            }
          }

          // Crack tip stress concentration (0.72 * critThreshold):
          // - Moderate overload stops partway -> dramatic visible open fissure ("开裂") while staying in 1 wobbling piece!
          // - Heavy overload / low toughness zips all the way across -> cleanly separates into elastic bouncing chunks ("被砸开")!
          const propCrit = critThreshold * 0.72;
          if (tipPeak > propCrit) {
            const drive = clamp((tipPeak - propCrit) / propCrit, 0.12, 2.8);
            ck.radius += drive * dt * 3.6;
          }

          // Split vertices lying cleanly along the propagating crack front (finer sheet tolerance for 11x8x11 mesh!)
          const frontVerts = [];
          for (let i = 0; i < n; i++) {
            if (j.splitDepth[i] >= 2) continue;
            const dx = rp[i * 3] - ck.ox, dy = rp[i * 3 + 1] - ck.oy, dz = rp[i * 3 + 2] - ck.oz;
            const planeD = Math.abs(dx * ck.nx + dy * ck.ny + dz * ck.nz);
            if (planeD > 0.13) continue;
            const radD = Math.hypot(dx, dy, dz);
            if (radD <= ck.radius) {
              frontVerts.push({ vi: i, radD });
            }
          }
          frontVerts.sort((a, b) => a.radD - b.radD);

          let perCrack = 0;
          for (let k = 0; k < frontVerts.length && perCrack < 12; k++) {
            const vi = frontVerts[k].vi;
            if (j.splitVertexAlongSheet(vi, ck.ox, ck.oy, ck.oz, ck.nx, ck.ny, ck.nz, ck.nx, ck.ny, ck.nz)) {
              perCrack++;
              splitsThisStep++;
              ck.splits++;
            }
          }
        }

        if (splitsThisStep > 0) {
          j.rebuildBoundary(false);
          j.totalCracks += splitsThisStep;
          audio.playJellyCrack(clamp(0.40 + splitsThisStep * 0.10, 0.40, 1.0));
        }
      }
    }

    packRenderBuffer() {
      let totalVerts = 0;
      const ranges = [];
      for (let ji = 0; ji < this.jellies.length; ji++) {
        const j = this.jellies[ji];
        const needed = (totalVerts + j.boundaryTris.length) * 8;
        if (needed > this.renderVerts.length) {
          const grown = new Float32Array(Math.max(needed * 2, this.renderVerts.length * 2));
          grown.set(this.renderVerts);
          this.renderVerts = grown;
        }
        const sub = this.renderVerts.subarray(totalVerts * 8);
        const count = j.packRenderVertices(sub, ji);
        ranges.push({ jellyIndex: ji, firstVertex: totalVerts, vertexCount: count });
        totalVerts += count;
      }
      this.renderVertCount = totalVerts;
      this.jellyRanges = ranges;
    }

    // Diagnostic stats (also helpful for verifying volume preservation & fracture!)
    getStats() {
      const hero = this.jellies[0];
      let curVol = 0, restVol = 0;
      const tets = hero.tets, pos = hero.pos;
      for (let t = 0; t < hero.tetCount; t++) {
        const i0 = tets[t * 4] * 3, i1 = tets[t * 4 + 1] * 3, i2 = tets[t * 4 + 2] * 3, i3 = tets[t * 4 + 3] * 3;
        const a0 = pos[i1] - pos[i0], a1 = pos[i1 + 1] - pos[i0 + 1], a2 = pos[i1 + 2] - pos[i0 + 2];
        const b0 = pos[i2] - pos[i0], b1 = pos[i2 + 1] - pos[i0 + 1], b2 = pos[i2 + 2] - pos[i0 + 2];
        const c0 = pos[i3] - pos[i0], c1 = pos[i3 + 1] - pos[i0 + 1], c2 = pos[i3 + 2] - pos[i0 + 2];
        curVol += (a0 * (b1 * c2 - b2 * c1) - a1 * (b0 * c2 - b2 * c0) + a2 * (b0 * c1 - b1 * c0)) / 6.0;
        restVol += hero.restVol[t];
      }
      return {
        simTime: this.simTime,
        heroSplits: hero.splitCount,
        heroVolumeRatio: restVol > 0 ? curVol / restVol : 1.0,
        ballCount: this.balls.length
      };
    }
  }

  App.Scene1Physics = Scene1Physics;
})(window);
