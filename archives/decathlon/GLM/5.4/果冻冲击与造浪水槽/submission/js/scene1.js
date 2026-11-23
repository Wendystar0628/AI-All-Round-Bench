'use strict';
/* ---------------------------------------------------------------------------
   Scene 1 — heavy ball impacts on jelly blocks
--------------------------------------------------------------------------- */

class SceneJelly {
  constructor(app) {
    this.app = app;
    this.time = 0;
    this.balls = [];
    this.pending = [];
    this.pendingId = 0;
    this.params = {
      softness: 0.55,
      toughness: 0.5,
      mass: 6.0,
      height: 1.0,
      radius: 0.11,
    };
    this.light = { dir: [0.42, 0.86, 0.32], color: [1.0, 0.95, 0.87], intensity: 3.3 };
    this.fill = { dir: [-0.78, 0.32, 0.52], color: [0.34, 0.55, 1.0], intensity: 1.05 };
    this.rim = { dir: [0.12, 0.42, -0.9], color: [0.55, 0.82, 1.0], intensity: 1.7 };
    this.exposure = 1.12;
    this.jellies = [];
    this.build();
  }

  build() {
    const cfg = [
      { shape: 'dome', size: [0.70, 0.56, 0.70], pos: [-0.86, 0, 0.12], color: [1.0, 0.36, 0.44], softness: 0.72, toughness: 0.46, density: 300, nx: 8, ny: 8, nz: 8 },
      { shape: 'column', size: [0.46, 0.82, 0.46], pos: [0.40, 0, -0.48], color: [0.50, 1.0, 0.62], softness: 0.42, toughness: 0.55, density: 330, nx: 7, ny: 9, nz: 7 },
      { shape: 'slab', size: [0.76, 0.32, 0.64], pos: [1.18, 0, 0.38], color: [0.44, 0.62, 1.0], softness: 0.24, toughness: 0.80, density: 340, nx: 9, ny: 4, nz: 8 },
    ];
    this.jellies = cfg.map((c) => new Jelly(c));

    // ---- static geometry ----
    const mb = new MeshBuilder();
    // studio floor with a radial falloff baked into vertex colour
    const R = 12, SEG = 96, RINGS = 22;
    const c0 = [0.075, 0.088, 0.112];
    for (let r = 0; r < RINGS; r++) {
      const r0 = (r / RINGS) * R, r1 = ((r + 1) / RINGS) * R;
      const f0 = 1 - Math.pow(r0 / R, 1.6) * 0.92;
      const f1 = 1 - Math.pow(r1 / R, 1.6) * 0.92;
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        const p00 = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0];
        const p10 = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
        const p01 = [Math.cos(a0) * r1, 0, Math.sin(a0) * r1];
        const p11 = [Math.cos(a1) * r1, 0, Math.sin(a1) * r1];
        const n = [0, 1, 0];
        const v00 = mb.vertex(p00, n, [c0[0] * f0, c0[1] * f0, c0[2] * f0], 0, 0);
        const v10 = mb.vertex(p10, n, [c0[0] * f0, c0[1] * f0, c0[2] * f0], 1, 0);
        const v01 = mb.vertex(p01, n, [c0[0] * f1, c0[1] * f1, c0[2] * f1], 0, 1);
        const v11 = mb.vertex(p11, n, [c0[0] * f1, c0[1] * f1, c0[2] * f1], 1, 1);
        mb.tri(v00, v01, v10); mb.tri(v10, v01, v11);
      }
    }
    this.floorMesh = mb.build(this.app.gfx);

    const pb = new MeshBuilder();
    Geo.roundedBox(pb, 3.6, 0.18, 2.55, 0.06, 8, [0.115, 0.130, 0.155], 0, -0.09, 0);
    this.platformMesh = pb.build(this.app.gfx);

    // thin emissive strip around the platform top edge
    const sb = new MeshBuilder();
    const y = 0.001, t = 0.008, w = 3.6 - 0.05, d = 2.55 - 0.05;
    Geo.box(sb, w, t, t, [0.16, 0.50, 0.58], 0, y, d / 2);
    Geo.box(sb, w, t, t, [0.16, 0.50, 0.58], 0, y, -d / 2);
    Geo.box(sb, t, t, d, [0.16, 0.50, 0.58], w / 2, y, 0);
    Geo.box(sb, t, t, d, [0.16, 0.50, 0.58], -w / 2, y, 0);
    this.stripMesh = sb.build(this.app.gfx);

    const bb = new MeshBuilder();
    Geo.sphere(bb, 1.0, 40, 26, [1, 1, 1]);
    this.ballMesh = bb.build(this.app.gfx);

    for (const j of this.jellies) j.upload(this.app.gfx);
  }

  jellyTop(j) {
    let m = 0;
    for (let i = 0; i < j.nv; i++) m = Math.max(m, j.p[i * 3 + 1]);
    return m;
  }

  reset() {
    for (const j of this.jellies) j.reset();
    this.balls.length = 0;
    this.pending.length = 0;
    this.time = 0;
    this.cracked = false;
  }

  setParam(k, v) {
    this.params[k] = v;
    if (k === 'softness' || k === 'toughness') {
      for (const j of this.jellies) {
        j.softness = clamp(j.cfg.softness * 0.55 + v * 0.75, 0.02, 1);
        j.toughness = clamp(j.cfg.toughness * 0.55 + v * 0.75, 0.02, 1);
      }
    }
  }

  /* ---- impacts ---- */
  dropBall(o) {
    const jelly = this.jellies[o.jelly || 0];
    const r = o.radius !== undefined ? o.radius : this.params.radius;
    const mass = o.mass !== undefined ? o.mass : this.params.mass;
    const density = mass / ((4 / 3) * Math.PI * Math.pow(r, 3));
    const top = this.jellyTop(jelly);
    const h = o.height !== undefined ? o.height : this.params.height;
    const ang = o.angle || 0;
    const ox = Math.cos(ang) * (o.offset || 0);
    const oz = Math.sin(ang) * (o.offset || 0);
    const ball = new Ball({
      p: [jelly.pos0[0] + ox, top + r + h, jelly.pos0[2] + oz],
      v: [o.vx || 0, 0, o.vz || 0],
      r, density,
      color: o.color || [0.72, 0.74, 0.78],
    });
    ball.metal = o.metal !== undefined ? o.metal : 1.0;
    ball.rough = o.rough !== undefined ? o.rough : 0.22;
    ball.delay = o.delay || 0;
    ball.targetJelly = jelly;
    ball.spin = o.spin || 0;
    if (ball.delay > 0) {
      ball.startDelay = ball.delay;
      this.pending.push(ball);
    } else {
      this.balls.push(ball);
    }
    return ball;
  }

  trigger(type) {
    if (type === 'center') {
      this.dropBall({ jelly: 0, mass: this.params.mass, height: this.params.height, offset: 0, angle: Math.random() * 6.283, radius: this.params.radius });
    } else if (type === 'offset') {
      const j = this.jellies[1];
      const top = this.jellyTop(j);
      const ang = -0.9;
      const off = 0.16;
      const ball = new Ball({
        p: [j.pos0[0] + Math.cos(ang) * off, top + 0.11 + this.params.height, j.pos0[2] + Math.sin(ang) * off],
        v: [0.9, 0, 0.35],
        r: this.params.radius, density: this.params.mass / ((4 / 3) * Math.PI * Math.pow(this.params.radius, 3)),
        color: [0.78, 0.72, 0.62],
      });
      ball.metal = 1.0; ball.rough = 0.3;
      this.balls.push(ball);
    } else if (type === 'continuous') {
      const base = this.params.mass;
      this.dropBall({ jelly: 0, mass: base * 0.55, height: this.params.height * 0.8, offset: 0.02, delay: 0 });
      this.dropBall({ jelly: 0, mass: base * 0.85, height: this.params.height * 0.95, offset: -0.03, delay: 0.85, color: [0.8, 0.7, 0.55] });
      this.dropBall({ jelly: 0, mass: base * 1.5, height: this.params.height * 1.15, offset: 0.01, delay: 1.7, color: [0.85, 0.55, 0.35] });
    }
  }

  /* ---- simulation ---- */
  update(dt) {
    this.time += dt;
    // release delayed balls
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      b.startDelay -= dt;
      if (b.startDelay <= 0) { this.balls.push(b); this.pending.splice(i, 1); }
    }
    for (const b of this.balls) {
      if (b.spin) b.w[0] += b.spin * dt;
      b.integrate(dt);
    }
    // ball - ball
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], c = this.balls[j];
        if (BallCollide.pair(a, c, 0.35, 0.4)) {
          const sp = Math.hypot(a.v[0] - c.v[0], a.v[1] - c.v[1], a.v[2] - c.v[2]);
          if (sp > 0.35 && a.hitCooldown <= 0) {
            a.hitCooldown = 0.06;
            this.app.audio.clack(clamp(sp / 4, 0.15, 1));
          }
        }
      }
    }
    // ball - platform / floor
    for (const b of this.balls) {
      if (BallCollide.plane(b, 0, 1, 0, 0, 0.42, 0.5)) {
        if (b.v[1] < -0.5 && b.hitCooldown <= 0) {
          b.hitCooldown = 0.08;
          this.app.audio.bounce(clamp(-b.v[1] / 6, 0.1, 1));
        }
        b.v[0] *= 0.995; b.v[2] *= 0.995;
      }
      // keep them on the platform
      const lim = 2.2;
      if (b.p[0] < -lim) { b.p[0] = -lim; b.v[0] = Math.abs(b.v[0]) * 0.4; }
      if (b.p[0] > lim) { b.p[0] = lim; b.v[0] = -Math.abs(b.v[0]) * 0.4; }
      if (b.p[2] < -1.6) { b.p[2] = -1.6; b.v[2] = Math.abs(b.v[2]) * 0.4; }
      if (b.p[2] > 1.6) { b.p[2] = 1.6; b.v[2] = -Math.abs(b.v[2]) * 0.4; }
      if (b.p[1] < -3) b.dead = true;
    }
    this.balls = this.balls.filter((b) => !b.dead);

    // jellies
    for (const j of this.jellies) {
      j.step(dt, this.balls, this);
      j.upload(this.app.gfx);
    }
  }

  /* ---- callbacks from the soft body ---- */
  ballHitJelly(ball, impulse) {
    if (impulse > 0.6 && ball.hitCooldown <= 0) {
      ball.hitCooldown = 0.12;
      this.app.audio.thud(clamp(impulse / 8, 0.15, 1.2), 1.0 + Math.random() * 0.15);
      this.app.shake(clamp(impulse / 40, 0, 0.006));
    }
  }

  onJellyCrack(jelly, count) {
    this.app.audio.crack(clamp(count / 6, 0.4, 1.2));
    this.cracked = true;
    this.app.shake(0.004);
  }

  /* ---- rendering ---- */
  render(R, enc) {
    const g = this.app.gfx;
    R._shadowDir = this.light.dir;
    R.computeShadow([0.1, 0.3, 0], 2.6);

    R.resetDraws();
    const identity = M4.ident();
    const dFloor = R.pushDraw(identity, [1, 1, 1, 1], [0.55, 0.0, 1, 0], [0, 0, 0, 0]);
    const dPlat = R.pushDraw(identity, [1, 1, 1, 1], [0.38, 0.35, 1, 0], [0, 0, 0, 0]);
    const dStrip = R.pushDraw(identity, [1, 1, 1, 1], [0.5, 0.0, 1, 0], [1, 1, 1, 0.45]);
    const ballDraws = this.balls.map((b) => {
      const m = M4.fromQuat(new Float32Array(16), b.q, b.p, b.r);
      return R.pushDraw(m, [b.color[0], b.color[1], b.color[2], 1], [b.rough, b.metal, 1, 0], [0, 0, 0, 0]);
    });
    const jellyDraws = this.jellies.map((j) => {
      const c = j.color;
      const absorb = [0.55 + (1 - c[0]) * 7.5, 0.55 + (1 - c[1]) * 7.5, 0.55 + (1 - c[2]) * 7.5];
      return R.pushDraw(identity, [c[0], c[1], c[2], 1], [j.softness, 0, 0, 1], [absorb[0], absorb[1], absorb[2], 0]);
    });
    R.flushDraws();

    // ---- shadow pass ----
    const sh = R.beginShadow();
    sh.pass.setVertexBuffer(0, this.ballMesh.vb);
    sh.pass.setIndexBuffer(this.ballMesh.ib, 'uint32');
    for (const d of ballDraws) {
      sh.pass.setBindGroup(1, R.drawBindGroup, [d]);
      sh.pass.drawIndexed(this.ballMesh.indexCount);
    }
    for (let i = 0; i < this.jellies.length; i++) {
      const j = this.jellies[i];
      sh.pass.setVertexBuffer(0, j.vb);
      sh.pass.setIndexBuffer(j.ib, 'uint32');
      sh.pass.setBindGroup(1, R.drawBindGroup, [jellyDraws[i]]);
      sh.pass.drawIndexed(j.indexCount || 0);
    }
    sh.pass.end();

    // ---- main pass: sky + opaque ----
    const colorView = R.sceneColor.createView();
    const depthView = R.sceneDepth.createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: colorView, loadOp: 'clear', storeOp: 'store',
        clearValue: { r: 0.004, g: 0.006, b: 0.011, a: 1 },
      }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    drawFullscreen(pass, R.pipeSky, R.globalBindGroup);
    pass.setPipeline(R.pipeMesh);
    pass.setBindGroup(0, R.globalBindGroup);
    pass.setVertexBuffer(0, this.floorMesh.vb); pass.setIndexBuffer(this.floorMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dFloor]); pass.drawIndexed(this.floorMesh.indexCount);
    pass.setVertexBuffer(0, this.platformMesh.vb); pass.setIndexBuffer(this.platformMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dPlat]); pass.drawIndexed(this.platformMesh.indexCount);
    pass.setVertexBuffer(0, this.stripMesh.vb); pass.setIndexBuffer(this.stripMesh.ib, 'uint32');
    pass.setBindGroup(1, R.drawBindGroup, [dStrip]); pass.drawIndexed(this.stripMesh.indexCount);
    pass.setVertexBuffer(0, this.ballMesh.vb); pass.setIndexBuffer(this.ballMesh.ib, 'uint32');
    for (const d of ballDraws) {
      pass.setBindGroup(1, R.drawBindGroup, [d]);
      pass.drawIndexed(this.ballMesh.indexCount);
    }
    pass.end();

    // ---- jelly back-face depth (for thickness) ----
    const bd = enc.beginRenderPass({
      colorAttachments: [{
        view: R.jellyBackDepth.createView(), loadOp: 'clear', storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }],
    });
    bd.setPipeline(R.pipeJellyBackDepth);
    bd.setBindGroup(0, R.globalBindGroup);
    for (let i = 0; i < this.jellies.length; i++) {
      const j = this.jellies[i];
      if (!j.indexCount) continue;
      bd.setVertexBuffer(0, j.vb); bd.setIndexBuffer(j.ib, 'uint32');
      bd.setBindGroup(1, R.drawBindGroup, [jellyDraws[i]]);
      bd.drawIndexed(j.indexCount);
    }
    bd.end();

    // ---- jelly front faces ----
    const jp = enc.beginRenderPass({
      colorAttachments: [{ view: colorView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: depthView, depthLoadOp: 'load', depthStoreOp: 'store' },
    });
    jp.setPipeline(R.pipeJellyFront);
    jp.setBindGroup(0, R.jellyBindGroup);
    for (let i = 0; i < this.jellies.length; i++) {
      const j = this.jellies[i];
      if (!j.indexCount) continue;
      jp.setVertexBuffer(0, j.vb); jp.setIndexBuffer(j.ib, 'uint32');
      jp.setBindGroup(1, R.drawBindGroup, [jellyDraws[i]]);
      jp.drawIndexed(j.indexCount);
    }
    jp.end();
    return { finalView: R.sceneColor.createView() };
  }
}
