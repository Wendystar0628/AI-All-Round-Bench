/* scene_jelly.js — 场景一：重球冲击果冻 */
(function () {
  const App = (window.App = window.App || {});
  const { M4, V3, el } = App.util;

  const TABLE = { hx: 0.85, hz: 0.55, top: 0.0, thick: 0.05 };

  class SceneJelly {
    constructor(renderer) {
      this.renderer = renderer;
      this.name = 'jelly';
      this.title = '场景一 · 重球冲击果冻';
      this.camera = new App.util.OrbitCamera();
      this.camera.target = new Float32Array([0, 0.14, 0]);
      this.camera.distance = 1.15;
      this.camera.yaw = -0.85;
      this.camera.pitch = 0.42;
      this.camera.fov = 40 * Math.PI / 180;

      renderer.shadowExtent = 1.1;
      renderer.shadowCenter = new Float32Array([0, 0.1, 0]);
      renderer.setLight([0.5, 0.95, 0.35], [1.30, 1.22, 1.10, 1.0]);
      renderer.setAmbient([0.11, 0.16, 0.28, 1.0], [0.035, 0.045, 0.065, 1.0]);

      // 台面与地面
      this.tableMesh = renderer.createMesh(App.PRIM.primBox(TABLE.hx * 2, TABLE.thick, TABLE.hz * 2));
      this.floorMesh = renderer.createMesh(App.PRIM.primPlane(9, 9, 1));
      this.ballMesh = renderer.createMesh(App.PRIM.primSphere(1, 28));

      // 果冻
      this.jellies = [];
      this.jellies.push(new App.Jelly({
        n: 9, size: 0.15, center: [-0.30, 0.075, 0.0], shape: 'cube',
        softness: 0.55, strength: 0.62, color: [1.0, 0.52, 0.16, 1],
      }));
      this.jellies.push(new App.Jelly({
        n: 9, size: 0.13, center: [0.10, 0.065, 0.20], shape: 'round',
        softness: 0.82, strength: 0.30, color: [1.0, 0.32, 0.55, 1],
      }));
      this.jellies.push(new App.Jelly({
        n: 8, size: 0.12, center: [0.32, 0.062, -0.16], shape: 'dome',
        softness: 0.28, strength: 0.85, color: [0.35, 0.85, 0.62, 1],
      }));
      this.jellyMeshes = this.jellies.map((j) => renderer.createDynamicMesh(60000, 400000));

      this.balls = new App.Balls();
      this.balls.gravity = -9.8;

      this.params = {
        softness: 0.55, strength: 0.6, ballMass: 0.55, dropHeight: 0.55,
        mode: 'center', target: 0, sound: true,
      };
      this.rotations = new Map();
      this.acc = 0;
      this.h = 1 / 120;
      this.events = [];
      this.t = 0;
      this.camAnim = null;
      this.auto = null;
      this.applyParams();
    }

    applyParams() {
      const p = this.params;
      if (this.jellies[p.target]) {
        this.jellies[p.target].setSoftness(p.softness);
        this.jellies[p.target].setStrength(p.strength);
      }
    }

    reset() {
      for (const j of this.jellies) {
        j.pos.set(j.rest);
        j.prev.set(j.rest);
        j.vel.fill(0);
        j.cBroken.fill(0);
        j.broken = false;
        j.recomputeComponents();
      }
      this.balls.clear();
      this.rotations.clear();
      this.acc = 0;
      this.t = 0;
      this.auto = null;
      this.events.length = 0;
      this.applyParams();
    }

    // ---------- 触发 ----------
    spawnBall(mode, targetIdx, opts) {
      opts = opts || {};
      const j = this.jellies[targetIdx] || this.jellies[0];
      const c = j.center;
      const p = this.params;
      const mass = opts.mass !== undefined ? opts.mass : p.ballMass;
      const rho = 3200;
      const r = Math.pow(mass / (4 / 3 * Math.PI * rho), 1 / 3);
      const H = opts.height !== undefined ? opts.height : p.dropHeight;
      let x = c[0], z = c[2], vx = 0, vz = 0, vy = 0;
      if (mode === 'offset') {
        const a = opts.angle !== undefined ? opts.angle : 0.5;
        const off = opts.offset !== undefined ? opts.offset : 0.045;
        x += Math.cos(a) * off;
        z += Math.sin(a) * off;
        vx = (opts.vx !== undefined ? opts.vx : 0.55) * Math.cos(a + 1.2);
        vz = (opts.vx !== undefined ? opts.vx : 0.55) * Math.sin(a + 1.2);
      } else if (mode === 'multi') {
        x += (opts.jitter || 0) * Math.cos(opts.seed || 0);
        z += (opts.jitter || 0) * Math.sin(opts.seed || 0);
      }
      const y = (opts.y !== undefined ? opts.y : (c[1] + j.size * 0.5 + H));
      const b = this.balls.add({
        pos: [x, y, z], vel: [vx, vy, vz], radius: r, density: rho,
        color: opts.color || [0.72, 0.74, 0.78, 1], group: 1,
        restitution: 0.45, friction: 0.35,
      });
      this.rotations.set(b.id, M4.create());
      this.events.push({ type: 'spawn' });
      return b;
    }

    // ---------- 物理 ----------
    update(dt) {
      this.t += dt;
      if (this.auto) this.updateAuto(dt);
      this.acc += dt;
      const h = this.h;
      let guard = 0;
      while (this.acc >= h && guard++ < 12) {
        this.step(h);
        this.acc -= h;
      }
      if (this.camAnim) this.updateCamAnim(dt);
    }

    step(h) {
      const ctx = {
        tableY: TABLE.top,
        balls: this.balls,
        others: this.jellies,
        bounds: null,
        onEvent: (type, jelly, ball, v) => {
          if (type === 'thud') this.events.push({ type: 'thud', mag: Math.min(1, v * 60) });
          else if (type === 'crack') this.events.push({ type: 'crack', mag: 1 });
        },
      };
      for (const j of this.jellies) j.step(h, ctx);
      this.balls.step(h, (b) => this.collideTable(b));
      // 球-球事件已在 Balls.events
      for (const e of this.balls.events) {
        if (e.type === 'ball') this.events.push({ type: 'clack', mag: Math.min(1, e.imp * 0.4) });
      }
      this.balls.events.length = 0;
      // 旋转积分
      for (const b of this.balls.list) {
        let m = this.rotations.get(b.id);
        if (!m) { m = M4.create(); this.rotations.set(b.id, m); }
        const wl = Math.hypot(b.w[0], b.w[1], b.w[2]);
        if (wl > 1e-5) {
          this.rotateMatrix(m, b.w[0] / wl, b.w[1] / wl, b.w[2] / wl, wl * h);
        }
      }
      // 滚动角速度（由台面接触产生）
      this.events.length = 0;
    }

    rotateMatrix(m, ax, ay, az, ang) {
      const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
      const R = new Float32Array(16);
      R[0] = t * ax * ax + c; R[1] = t * ax * ay + s * az; R[2] = t * ax * az - s * ay;
      R[4] = t * ax * ay - s * az; R[5] = t * ay * ay + c; R[6] = t * ay * az + s * ax;
      R[8] = t * ax * az + s * ay; R[9] = t * ay * az - s * ax; R[10] = t * az * az + c;
      R[15] = 1;
      M4.multiply(m, m, R);
    }

    collideTable(b) {
      const r = b.r;
      const top = TABLE.top;
      if (b.p[1] < top + r) {
        b.p[1] = top + r;
        if (b.v[1] < 0) {
          const imp = -b.v[1];
          b.v[1] = -b.v[1] * b.rest;
          // 摩擦
          const f = Math.max(0, 1 - b.fric * 0.9 * Math.abs(b.v[1]) * 0.2 - 0.02);
          b.v[0] *= f; b.v[2] *= f;
          // 滚动
          b.w[0] = b.v[2] / r; b.w[2] = -b.v[0] / r;
          if (imp > 0.5) this.events.push({ type: 'thud', mag: Math.min(1, imp * 0.12) });
        }
      }
      const hx = TABLE.hx - r, hz = TABLE.hz - r;
      if (b.p[0] < -hx) { b.p[0] = -hx; b.v[0] = Math.abs(b.v[0]) * b.rest; }
      if (b.p[0] > hx) { b.p[0] = hx; b.v[0] = -Math.abs(b.v[0]) * b.rest; }
      if (b.p[2] < -hz) { b.p[2] = -hz; b.v[2] = Math.abs(b.v[2]) * b.rest; }
      if (b.p[2] > hz) { b.p[2] = hz; b.v[2] = -Math.abs(b.v[2]) * b.rest; }
      if (b.p[1] < -1.5) { b.p.set([0, 0.4, 0]); b.v.fill(0); }
    }

    // ---------- 相机动画 ----------
    setCameraAnim(keyframes, duration) {
      this.camAnim = { keys: keyframes, t: 0, duration };
    }
    updateCamAnim(dt) {
      const a = this.camAnim;
      a.t += dt;
      const u = Math.min(1, a.t / a.duration);
      // 关键帧: {t, pos, target, fov}
      let i = 0;
      while (i < a.keys.length - 1 && a.keys[i + 1].t < u) i++;
      const k0 = a.keys[i], k1 = a.keys[Math.min(i + 1, a.keys.length - 1)];
      const span = Math.max(1e-6, k1.t - k0.t);
      let f = Math.min(1, Math.max(0, (u - k0.t) / span));
      f = f * f * (3 - 2 * f);
      const cam = this.camera;
      const px = k0.pos[0] + (k1.pos[0] - k0.pos[0]) * f;
      const py = k0.pos[1] + (k1.pos[1] - k0.pos[1]) * f;
      const pz = k0.pos[2] + (k1.pos[2] - k0.pos[2]) * f;
      const tx = k0.target[0] + (k1.target[0] - k0.target[0]) * f;
      const ty = k0.target[1] + (k1.target[1] - k0.target[1]) * f;
      const tz = k0.target[2] + (k1.target[2] - k0.target[2]) * f;
      const dx = px - tx, dy = py - ty, dz = pz - tz;
      cam.distance = Math.hypot(dx, dy, dz);
      cam.target[0] = tx; cam.target[1] = ty; cam.target[2] = tz;
      cam.yaw = Math.atan2(dx, dz);
      cam.pitch = Math.asin(Math.max(-1, Math.min(1, dy / Math.max(1e-5, cam.distance))));
      cam.fov = (k0.fov || 40 * Math.PI / 180) + ((k1.fov || 40 * Math.PI / 180) - (k0.fov || 40 * Math.PI / 180)) * f;
      if (u >= 1) this.camAnim = null;
    }

    // ---------- 渲染 ----------
    render(renderer) {
      renderer.setTime(this.t);
      renderer.begin(this.camera);
      const I = null;
      // 阴影投射
      const tmS = M4.create();
      M4.multiply(tmS, M4.translation(0, TABLE.top - TABLE.thick / 2, 0), M4.scaling(1, 1, 1));
      renderer.drawShadowMesh(this.tableMesh, tmS);
      for (let i = 0; i < this.jellies.length; i++) {
        const j = this.jellies[i];
        j.buildSurface();
        const packed = j.packSurface();
        const mesh = this.jellyMeshes[i];
        if (packed) {
          renderer.updateDynamicMesh(mesh, packed.verts.subarray(0, packed.nVerts * 12), packed.indices.subarray(0, packed.nIdx));
          renderer.drawShadowMesh(mesh, I);
        }
      }
      for (const b of this.balls.list) {
        const m = this.rotations.get(b.id) || M4.create();
        const wm = M4.create();
        M4.multiply(wm, M4.translation(b.p[0], b.p[1], b.p[2]), m);
        M4.multiply(wm, wm, M4.scaling(b.r, b.r, b.r));
        renderer.drawShadowMesh(this.ballMesh, wm);
      }
      renderer.endShadow();

      const pass = renderer.beginMain();
      // 地面
      renderer.drawMesh(pass, this.floorMesh, I, [0.16, 0.17, 0.20, 1], [0.9, 0, 1, App.RENDER_MODE.FLOOR], [0, 0, 0, 0]);
      // 台面
      const tm = M4.create();
      M4.multiply(tm, M4.translation(0, TABLE.top - TABLE.thick / 2, 0), M4.scaling(1, 1, 1));
      renderer.drawMesh(pass, this.tableMesh, tm, [0.30, 0.31, 0.35, 1], [0.62, 0, 1, App.RENDER_MODE.OPAQUE], [0, 0, 0, 0]);

      // 果冻
      for (let i = 0; i < this.jellies.length; i++) {
        const j = this.jellies[i];
        const mesh = this.jellyMeshes[i];
        if (j.surfVerts > 0) {
          renderer.drawMeshRaw(pass, mesh, I, j.color, [0.16, 0.0, 0.82, App.RENDER_MODE.JELLY], [0.05, 0, 0.9, 0], renderer.pipeAlpha);
        }
      }
      // 球
      for (const b of this.balls.list) {
        const m = this.rotations.get(b.id) || M4.create();
        const s = M4.scaling(b.r, b.r, b.r);
        const t = M4.translation(b.p[0], b.p[1], b.p[2]);
        const wm = M4.create();
        M4.multiply(wm, t, m);
        M4.multiply(wm, wm, s);
        renderer.drawMesh(pass, this.ballMesh, wm, b.color, [0.22, 0.9, 1, App.RENDER_MODE.OPAQUE], [0, 0, 0, 0]);
      }

      renderer.finishMainAndCopy();
      const tp = renderer.beginTransparent();
      renderer.end();
    }

    // ---------- UI ----------
    buildPanel(body) {
      const p = this.params;
      const grp1 = el('div', 'grp');
      grp1.appendChild(el('div', 'grp-title', '果冻'));
      this.slSoft = App.util.makeSlider(grp1, {
        label: '软硬', min: 0.05, max: 1, step: 0.01, value: p.softness,
        onInput: (v) => { p.softness = v; this.applyParams(); },
      });
      this.slStr = App.util.makeSlider(grp1, {
        label: '结实度', min: 0.05, max: 1, step: 0.01, value: p.strength,
        onInput: (v) => { p.strength = v; this.applyParams(); },
      });
      this.selTarget = App.util.makeSeg(grp1, {
        options: this.jellies.map((j, i) => ({ label: ['橙方冻', '粉圆冻', '苔穹冻'][i], value: i })),
        index: p.target,
        onPick: (i) => { p.target = i; this.applyParams(); this.selTarget.set(i); },
      });
      body.appendChild(grp1);

      const grp2 = el('div', 'grp');
      grp2.appendChild(el('div', 'grp-title', '重球与冲击'));
      this.slMass = App.util.makeSlider(grp2, {
        label: '质量', min: 0.15, max: 1.6, step: 0.01, value: p.ballMass,
        onInput: (v) => { p.ballMass = v; },
      });
      this.slH = App.util.makeSlider(grp2, {
        label: '下落高度', min: 0.15, max: 1.4, step: 0.01, value: p.dropHeight,
        onInput: (v) => { p.dropHeight = v; },
      });
      this.segMode = App.util.makeSeg(grp2, {
        options: [
          { label: '正中', value: 'center' }, { label: '偏心', value: 'offset' }, { label: '连续', value: 'multi' },
        ],
        index: 0,
        onPick: (i, v) => { p.mode = v; },
      });
      body.appendChild(grp2);
      const note = el('div', 'note', '提示：调软果冻或加大球质量，凹陷更深、鼓出更大、振荡更慢；\n加大冲击或降低结实度会依次出现「只变形 → 开裂 → 砸开」。');
      body.appendChild(note);
    }

    buildActions(box) {
      const b1 = el('button', 'abtn', '释放重球');
      b1.addEventListener('click', () => {
        const p = this.params;
        this.spawnBall(p.mode === 'multi' ? 'center' : p.mode, p.target);
      });
      const b2 = el('button', 'abtn warn', '连续冲击');
      b2.addEventListener('click', () => {
        const p = this.params;
        const n = 3;
        for (let i = 0; i < n; i++) {
          setTimeout(() => {
            this.spawnBall('center', p.target, {
              mass: p.ballMass * (1 + i * 0.55),
              height: p.dropHeight * (1 + i * 0.12),
              jitter: i === 0 ? 0 : 0.012, seed: i * 2.1,
            });
          }, i * 420);
        }
      });
      const b3 = el('button', 'abtn ghost', '清空小球');
      b3.addEventListener('click', () => { this.balls.clear(); this.rotations.clear(); });
      box.appendChild(b1); box.appendChild(b2); box.appendChild(b3);
    }
  }

  App.scenes = App.scenes || {};
  App.scenes.jelly = { create: (r) => new SceneJelly(r), title: '场景一 · 重球冲击果冻' };
})();
