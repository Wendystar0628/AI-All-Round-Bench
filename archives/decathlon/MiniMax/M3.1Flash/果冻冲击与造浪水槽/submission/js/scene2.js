/* scene2.js — the wave tank: glass basin, sculpted bottom, wave maker paddle
   and groups of identical balls with different densities. */
(function (global) {
  'use strict';
  const U = global.U, Geo = global.Geo;

  const GROUPS = [
    { density: 0.32, color: [1.00, 0.80, 0.18], label: '浮球' },
    { density: 0.62, color: [0.60, 0.90, 0.32], label: '轻球' },
    { density: 1.00, color: [0.38, 0.86, 1.00], label: '中性' },
    { density: 1.55, color: [1.00, 0.50, 0.20], label: '沉球' },
    { density: 3.10, color: [0.90, 0.28, 0.58], label: '重球' }
  ];

  class Scene2 {
    constructor(device, renderer) {
      this.device = device; this.renderer = renderer;
      this.id = 2;
      this.name = '造浪水槽';
      this.sim = new global.WaterSim(device, renderer);
      this.time = 0;
      this.events = [];
      this.onEvent = null;
      this.params = {
        densities: GROUPS.map(g => g.density),
        waveAmp: 0.055,
        waveFreq: 0.85,
        waveOn: 0,
        ballRadius: 0.042
      };
      this.groupCount = 5;
      this.perGroup = 4;

      this.mBottom = null;
      this.mBox = renderer.createMesh(Geo.box(), 'mesh');
      this.mSphere = renderer.createMesh(Geo.sphere(20, 14), 'mesh');
      this.mGlass = renderer.createMesh(Geo.glassPanel(12), 'glass');
      this._buildBottom();

      this.balls = [];
      this._buildBalls();
      renderer.setBallBuffer(this.sim.ballBuf);
      this.sim.waterMesh.indirectBuffer = this.sim.indirect;
    }

    _buildBottom() {
      const sim = this.sim;
      const NX = 72, NZ = 30;
      const pos = [], nrm = [], idx = [];
      const h = (x, z) => sim.terrainH(x, z);
      for (let j = 0; j < NZ; j++) {
        for (let i = 0; i < NX; i++) {
          const x = (i / (NX - 1)) * sim.L;
          const z = sim.org[2] + (j / (NZ - 1)) * sim.W;
          pos.push(x, h(x, z), z);
          const e = 0.004;
          const hx = (h(x + e, z) - h(x - e, z)) / (2 * e);
          const hz = (h(x, z + e) - h(x, z - e)) / (2 * e);
          const n = [-hx, 1, -hz];
          const l = Math.hypot(n[0], n[1], n[2]);
          nrm.push(n[0] / l, n[1] / l, n[2] / l);
        }
      }
      for (let j = 0; j < NZ - 1; j++) {
        for (let i = 0; i < NX - 1; i++) {
          const a = j * NX + i, b = a + NX;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      this.mBottom = this.renderer.createMesh(Geo.packMesh(pos, nrm, idx), 'mesh');
    }

    _buildBalls() {
      const sim = this.sim;
      const r = this.params.ballRadius;
      const list = [];
      this.ballInfo = [];
      let idx = 0;
      for (let g = 0; g < GROUPS.length; g++) {
        for (let k = 0; k < this.perGroup; k++) {
          const spread = (k - (this.perGroup - 1) / 2) * 0.085;
          const px = 0.55 + g * 0.16 + (k % 2) * 0.07;
          const pz = spread * 1.6 + (g % 2 ? 0.06 : -0.06);
          const py = 0.44 + (k % 3) * 0.03;
          const b = {
            pos: [px, py, pz], r, density: this.params.densities[g], color: GROUPS[g].color,
            group: g, index: idx, released: false
          };
          list.push(b);
          this.ballInfo.push(b);
          idx++;
        }
      }
      this.numBalls = list.length;
      this._writeBalls(list, false);
    }

    _writeBalls(list, active) {
      const data = new Float32Array(64 * 24);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const o = i * 24;
        data[o] = b.pos[0]; data[o + 1] = b.pos[1]; data[o + 2] = b.pos[2];
        data[o + 6] = 0; data[o + 7] = 0; data[o + 8] = 0; data[o + 9] = 1;
        data[o + 13] = b.r;
        data[o + 14] = b.density;
        data[o + 15] = i;
        data[o + 16] = b.color[0]; data[o + 17] = b.color[1]; data[o + 18] = b.color[2];
        data[o + 19] = active ? 1 : 0;
      }
      this.device.queue.writeBuffer(this.sim.ballBuf, 0, data);
    }

    releaseBall(b) {
      const o = b.index * 24 * 4;
      const p = new Float32Array([b.pos[0], 0.44, b.pos[2], 0, 0, 0]);
      this.device.queue.writeBuffer(this.sim.ballBuf, o, p);
      this.device.queue.writeBuffer(this.sim.ballBuf, o + 19 * 4, new Float32Array([1]));
      b.released = true;
      if (this.onEvent) this.onEvent('splash', b);
    }

    releaseAll() {
      for (const b of this.ballInfo) this.releaseBall(b);
    }

    applyParams() {
      const p = this.params;
      this.sim.waveAmp = p.waveAmp;
      this.sim.waveFreq = p.waveFreq;
      this.sim.waveOn = p.waveOn;
      for (const b of this.ballInfo) {
        const g = b.group;
        b.density = p.densities[g];
      }
      // density changes must reach the GPU ball buffer
      const data = new Float32Array(this.numBalls);
      for (let i = 0; i < this.numBalls; i++) data[i] = this.ballInfo[i].density;
      for (let i = 0; i < this.numBalls; i++) {
        this.device.queue.writeBuffer(this.sim.ballBuf, (i * 24 + 14) * 4, data.subarray(i, i + 1));
      }
    }

    reset() {
      this.sim.reset();
      this.time = 0;
      this.events.length = 0;
      this._writeBalls(this.ballInfo, false);
      for (const b of this.ballInfo) b.released = false;
    }

    setWave(on) {
      this.params.waveOn = on ? 1 : 0;
      this.sim.waveOn = this.params.waveOn;
    }

    paddleX() {
      return this.sim.paddleBase + this.sim.waveAmp * Math.sin(this.sim.waveFreq * 6.2831853 * this.sim.time);
    }

    update(dt) {
      while (this.events.length && this.events[0].t <= this.time) {
        const ev = this.events.shift();
        this._fire(ev);
      }
      // fixed sub-steps for a stable, deterministic simulation
      const sub = this.sim.substeps;
      const h = dt / sub;
      for (let i = 0; i < sub; i++) this.sim.step(h);
      this.time += dt;
    }

    _fire(ev) {
      if (ev.type === 'release') {
        const b = this.ballInfo[ev.index];
        if (b) this.releaseBall(b);
      } else if (ev.type === 'wave') {
        this.setWave(ev.on);
        if (this.onEvent) this.onEvent('wave', ev.on);
      } else if (ev.type === 'amp') {
        this.params.waveAmp = ev.amp;
        this.sim.waveAmp = ev.amp;
      } else if (ev.type === 'freq') {
        this.params.waveFreq = ev.freq;
        this.sim.waveFreq = ev.freq;
      }
    }

    schedule(list) {
      for (const e of list) this.events.push(Object.assign({ t: this.time }, e));
    }

    buildScene(camera, out) {
      out.opaque.length = 0; out.jelly.length = 0; out.glass.length = 0;
      out.shadowCasters.length = 0; out.shadowJelly.length = 0;
      out.water = null; out.balls = null;

      const sim = this.sim;
      // tank bottom
      const idm = U.M4.create();
      out.opaque.push({ mesh: this.mBottom, model: idm, color: [0.22, 0.24, 0.27, 1], params: [0.55, 0.05, 0, 0] });

      // dark base plinth under the tank
      const bm = U.M4.create();
      U.M4.fromTranslation(bm, sim.L / 2, -0.035, sim.org[2] + sim.W / 2);
      const bs = U.M4.fromScale(U.M4.create(), sim.L + 0.10, 0.07, sim.W + 0.10);
      U.M4.multiply(bm, bm, bs);
      out.opaque.push({ mesh: this.mBox, model: bm, color: [0.10, 0.11, 0.13, 1], params: [0.5, 0.1, 0, 0] });

      // paddle (wave maker)
      const px = this.paddleX();
      const pm = U.M4.create();
      U.M4.fromTranslation(pm, px, sim.H * 0.5, sim.org[2] + sim.W / 2);
      const ps = U.M4.fromScale(U.M4.create(), 0.02, sim.H * 0.96, sim.W * 0.98);
      U.M4.multiply(pm, pm, ps);
      out.opaque.push({ mesh: this.mBox, model: pm, color: [0.42, 0.46, 0.52, 1], params: [0.35, 0.85, 0, 0] });

      // paddle carriage
      const cm = U.M4.create();
      U.M4.fromTranslation(cm, px - 0.02, sim.H * 0.52, sim.org[2] + sim.W / 2);
      const cs = U.M4.fromScale(U.M4.create(), 0.05, 0.05, sim.W + 0.12);
      U.M4.multiply(cm, cm, cs);
      out.opaque.push({ mesh: this.mBox, model: cm, color: [0.30, 0.33, 0.38, 1], params: [0.4, 0.7, 0, 0] });

      // glass panels
      const glassColor = [0.62, 0.82, 0.92, 1];
      const panels = [
        // far wall (+x), normal -x
        { pos: [sim.L, sim.H / 2, sim.org[2] + sim.W / 2], rot: -Math.PI / 2, w: sim.W, h: sim.H },
        // near wall (-x)
        { pos: [0, sim.H / 2, sim.org[2] + sim.W / 2], rot: Math.PI / 2, w: sim.W, h: sim.H },
        // side walls
        { pos: [sim.L / 2, sim.H / 2, sim.org[2] + sim.W], rot: Math.PI, w: sim.L, h: sim.H },
        { pos: [sim.L / 2, sim.H / 2, sim.org[2]], rot: 0, w: sim.L, h: sim.H }
      ];
      for (const p of panels) {
        const m = U.M4.create();
        U.M4.fromTranslation(m, p.pos[0], p.pos[1], p.pos[2]);
        const r = U.M4.fromRotationY(U.M4.create(), p.rot);
        const s = U.M4.fromScale(U.M4.create(), p.w, p.h, 1);
        U.M4.multiply(m, m, r);
        U.M4.multiply(m, m, s);
        out.glass.push({ mesh: this.mGlass, model: m, color: glassColor, params: [0.05, 0, 0.0, 0] });
      }

      // water surface
      out.water = {
        mesh: sim.waterMesh,
        instance: {
          model: U.M4.create(),
          color: [0.62, 0.82, 0.90, 1],
          params: [0.03, 0, 0, 0]
        }
      };

      // balls
      out.balls = { mesh: this.mSphere, count: this.numBalls };

      out.shadowCasters = out.opaque.slice();
      return out;
    }
  }

  global.Scene2 = Scene2;
  global.TANK_GROUPS = GROUPS;
})(window);
