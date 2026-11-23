/* scene1.js — the jelly stage: table, several gels of different firmness,
   metal/stone balls, and the three impact triggers. */
(function (global) {
  'use strict';
  const U = global.U, Geo = global.Geo;

  const TABLE = { x: 4.2, y: 0.24, z: 3.0 };

  class Scene1 {
    constructor(device, renderer) {
      this.device = device; this.renderer = renderer;
      this.id = 1;
      this.name = '果冻冲击';
      this.world = new global.JellyWorld();
      this.params = {
        softness: 0.5,      // 0 hard .. 1 soft
        toughness: 0.5,     // 0 fragile .. 1 tough
        ballMass: 9.0,
        dropHeight: 1.35,
        ballOffset: 0.0,
        restitution: 0.22
      };
      this.events = [];
      this.time = 0;
      this.lastImpact = 0;
      this.breakCount = 0;
      this.onEvent = null;

      // meshes
      this.mTable = renderer.createMesh(Geo.box(), 'mesh');
      this.mSphere = renderer.createMesh(Geo.sphere(28, 18), 'mesh');
      this.mFloor = renderer.createMesh(Geo.plane(), 'mesh');

      this._buildBodies();
      this._buildBalls();
      this.applyParams();

      this.jellyMeshes = this.world.bodies.map(b => {
        const maxVerts = b.mesh.nv;
        const maxIdx = b.faces.length / 4 * 6 + 64;
        const m = renderer.createDynamicMesh('jelly', maxVerts, maxIdx);
        m.vdata = new Float32Array(maxVerts * 7);
        m.idata = new Uint32Array(maxIdx);
        return m;
      });
      this._vtmp = new Float32Array(8 * 7);
      this._itmp = new Uint32Array(64 * 6);
    }

    _buildBodies() {
      const w = this.world;
      const specs = [
        { shape: 'cube', res: 7, sx: 0.54, sy: 0.52, sz: 0.52, pos: [0, 0, 0], color: [0.88, 0.36, 0.55], soft: 0.52, tough: 0.52 },
        { shape: 'dome', res: 6, sx: 0.44, sy: 0.40, sz: 0.44, pos: [-0.88, 0, 0.38], color: [0.36, 0.62, 0.92], soft: 0.30, tough: 0.80 },
        { shape: 'slab', res: 6, sx: 0.48, sy: 0.18, sz: 0.42, pos: [0.80, 0, -0.46], color: [0.46, 0.84, 0.56], soft: 0.78, tough: 0.35 },
        { shape: 'column', res: 6, sx: 0.24, sy: 0.66, sz: 0.24, pos: [0.98, 0, 0.50], color: [0.95, 0.66, 0.28], soft: 0.42, tough: 0.62 },
        { shape: 'blob', res: 6, sx: 0.44, sy: 0.36, sz: 0.42, pos: [-0.30, 0, -0.82], color: [0.68, 0.42, 0.88], soft: 0.66, tough: 0.26 }
      ];
      this.bodies = [];
      for (const s of specs) {
        const b = w.addBody(s);
        b.baseSoft = s.soft; b.baseTough = s.tough;
        b.onBreak = () => { this.breakCount++; if (this.onEvent) this.onEvent('crack', b); };
        this.bodies.push(b);
      }
    }

    _buildBalls() {
      const w = this.world;
      this.balls = [];
      const specs = [
        { r: 0.118, m: 9.0, pos: [-1.45, 0.118, -0.30], color: [0.70, 0.73, 0.78], material: 'steel', rough: 0.22, metal: 1.0 },
        { r: 0.092, m: 5.0, pos: [-1.62, 0.092, 0.18], color: [0.60, 0.62, 0.66], material: 'steel', rough: 0.30, metal: 1.0 },
        { r: 0.086, m: 2.6, pos: [1.55, 0.086, -0.62], color: [0.46, 0.45, 0.43], material: 'stone', rough: 0.62, metal: 0.0 },
        { r: 0.064, m: 1.5, pos: [1.68, 0.064, -0.38], color: [0.85, 0.66, 0.33], material: 'brass', rough: 0.25, metal: 1.0 },
        { r: 0.060, m: 0.4, pos: [1.62, 0.060, 0.20], color: [0.52, 0.35, 0.20], material: 'wood', rough: 0.72, metal: 0.0 }
      ];
      for (const s of specs) {
        const b = w.addBall(s);
        b.restPos.set(s.pos);
        b.home.set(s.pos);
        this.balls.push(b);
      }
      this.mainBall = this.balls[0];
    }

    applyParams() {
      const p = this.params;
      for (const b of this.bodies) {
        // global softness shifts each gel around its own character
        const soft = U.clamp(b.baseSoft * 0.6 + p.softness * 0.8, 0.05, 1.0);
        const tough = U.clamp(b.baseTough * 0.55 + p.toughness * 0.75, 0.05, 1.0);
        b.alphaEdge = 4e-8 * Math.pow(12, soft * 1.6);
        b.alphaVol = b.alphaEdge * 0.03;
        b.breakStrain = 0.10 + tough * 0.42;
        b.damping = 0.012 + soft * 0.030;
        b.softLevel = soft;
        b.toughLevel = tough;
      }
      this.mainBall.m = p.ballMass;
      this.mainBall.invI = 1 / (0.4 * this.mainBall.m * this.mainBall.r * this.mainBall.r);
    }

    reset() {
      this.world.reset();
      this.events.length = 0;
      this.time = 0;
      this.breakCount = 0;
      this.applyParams();
      // park the balls where they belong
      this.balls.forEach((b, i) => {
        b.pos.set(b.home);
        b.restPos.set(b.home);
        b.prev.set(b.home);
        b.vel.set([0, 0, 0]);
        b.omega.set([0, 0, 0]);
        b.quat.set([0, 0, 0, 1]);
        b.active = true;
      });
    }

    /* ---------------- triggers ---------------- */
    triggerImpact(kind) {
      const p = this.params;
      const main = this.bodies[0];
      const h = p.dropHeight;
      const ball = this.mainBall;
      if (kind === 'center') {
        ball.pos.set([main.posOffset[0], main.posOffset[1] + 0.52 + h, main.posOffset[2]]);
        ball.vel.set([0, 0, 0]);
        ball.omega.set([0, 0, 0]);
        ball.prev.set(ball.pos);
        ball.active = true;
        this.events.push({ t: this.time, type: 'drop', body: main });
      } else if (kind === 'offset') {
        const off = 0.26 + p.ballOffset * 0.2;
        ball.pos.set([main.posOffset[0] + off, main.posOffset[1] + 0.52 + h * 0.92, main.posOffset[2] + off * 0.55]);
        ball.vel.set([-0.55, 0, -0.35]);
        ball.omega.set([0, 0, 0]);
        ball.prev.set(ball.pos);
        ball.active = true;
        this.events.push({ t: this.time, type: 'drop', body: main });
      } else if (kind === 'multi') {
        const seq = [
          { t: 0.0, m: 3.0, off: 0.0, r: 0.098 },
          { t: 0.75, m: 5.0, off: 0.05, r: 0.108 },
          { t: 1.42, m: 8.0, off: -0.06, r: 0.116 },
          { t: 2.02, m: 12.0, off: 0.02, r: 0.124 }
        ];
        for (const s of seq) {
          this.events.push({
            t: this.time + s.t, type: 'dropBall', mass: s.m, radius: s.r,
            off: s.off, height: 1.25 + s.t * 0.12, body: main
          });
        }
      }
    }

    _fireEvent(ev) {
      if (ev.type === 'drop' || ev.type === 'dropBall') {
        const main = ev.body || this.bodies[0];
        const ball = this.mainBall;
        if (ev.type === 'dropBall') {
          ball.m = ev.mass; ball.r = ev.radius;
          ball.invI = 1 / (0.4 * ball.m * ball.r * ball.r);
        }
        const off = ev.off || 0;
        ball.pos.set([
          main.posOffset[0] + off,
          main.posOffset[1] + 0.52 + (ev.height || this.params.dropHeight),
          main.posOffset[2] + off * 0.6
        ]);
        ball.vel.set([0, 0, 0]);
        ball.omega.set([0, 0, 0]);
        ball.prev.set(ball.pos);
        ball.active = true;
        if (this.onEvent) this.onEvent('release', ball);
      }
    }

    update(dt) {
      // fire pending events
      while (this.events.length && this.events[0].t <= this.time) {
        const ev = this.events.shift();
        this._fireEvent(ev);
      }
      const before = this.breakCount;
      this.world.step(dt);
      if (this.breakCount > before && this.onEvent) this.onEvent('crack', this.bodies[0]);
      this.time += dt;
    }

    /* ---------------- rendering ---------------- */
    buildScene(camera, out) {
      out.opaque.length = 0; out.jelly.length = 0; out.glass.length = 0; out.water = null;
      out.shadowCasters.length = 0; out.shadowJelly.length = 0;

      // table
      const m = U.M4.create();
      U.M4.fromTranslation(m, 0, -TABLE.y / 2, 0);
      const sm = U.M4.create();
      U.M4.multiply(sm, m, U.M4.fromScale(U.M4.create(), TABLE.x, TABLE.y, TABLE.z));
      out.opaque.push({ mesh: this.mTable, model: sm, color: [0.20, 0.21, 0.24, 1], params: [0.62, 0.05, 0, 0] });

      // balls
      const ballModel = U.M4.create();
      for (const b of this.balls) {
        if (!b.active) continue;
        const rot = U.M4.create();
        U.QT.toMat3(rot, b.quat);
        const rotM = U.M4.create();
        rotM.set(rot);
        rotM[15] = 1;
        const sc = U.M4.fromScale(U.M4.create(), b.r * 2, b.r * 2, b.r * 2);
        U.M4.multiply(ballModel, rotM, sc);
        U.M4.fromTranslation(U.M4.create(), b.pos[0], b.pos[1], b.pos[2]);
        const tr = U.M4.create();
        U.M4.fromTranslation(tr, b.pos[0], b.pos[1], b.pos[2]);
        const full = U.M4.create();
        U.M4.multiply(full, tr, ballModel);
        out.opaque.push({
          mesh: this.mSphere, model: full,
          color: [b.color[0], b.color[1], b.color[2], 1],
          params: [b.rough, b.metal, 0, 0]
        });
      }

      // gels
      for (let i = 0; i < this.bodies.length; i++) {
        const b = this.bodies[i];
        const mesh = this.jellyMeshes[i];
        const cnt = b.buildRenderMesh(mesh.vdata, mesh.idata);
        this.renderer.updateMesh(mesh, mesh.vdata.subarray(0, b.mesh.nv * 7), mesh.idata.subarray(0, cnt), cnt);
        const id = U.M4.create();
        out.jelly.push({
          mesh, model: id,
          color: [b.color[0], b.color[1], b.color[2], 1],
          params: [0.10 + b.softLevel * 0.16, 0, b.translucency, 0]
        });
        out.shadowJelly.push({
          mesh, model: id,
          color: [0, 0, 0, 1], params: [0.5, 0, 0, 0]
        });
      }
      out.shadowCasters = out.opaque.slice();
      return out;
    }
  }

  global.Scene1 = Scene1;
})(window);
