'use strict';
/* 应用层：场景管理、交互界面、实时循环、演示播放、视频导出接口 */
(function () {
  const GPU = JW.GPU, V3 = JW.V3, Audio = JW.Audio;
  const $ = (id) => document.getElementById(id);
  const DEG = Math.PI / 180;

  const JELLIES = [
    { name: '软 · 树莓方块', tag: '软', shape: { type: 'box', half: [0.13, 0.09, 0.13], round: 0.03 }, center: [-0.43, 0], E: 9, strength: 7, abs: [2.2, 31, 24], col: [0.95, 0.20, 0.28], css: '#e8455a' },
    { name: '中 · 蜜橙布丁', tag: '中', shape: { type: 'frustum', r0: 0.14, r1: 0.105, h: 0.19, round: 0.025 }, center: [0, 0.02], E: 16, strength: 13, abs: [1.2, 10, 46], col: [0.98, 0.58, 0.10], css: '#f2a12c' },
    { name: '硬 · 蓝莓高柱', tag: '硬', shape: { type: 'box', half: [0.075, 0.15, 0.075], round: 0.02 }, center: [0.43, 0], E: 30, strength: 30, abs: [28, 13.5, 1.8], col: [0.22, 0.45, 0.95], css: '#4a7ce8' },
  ];
  const BALL_MATS = [{ name: '石球', rho: 2700, kind: 1 }, { name: '钢球', rho: 7800, kind: 0 }, { name: '铜球', rho: 8500, kind: 2 }];
  const GROUPS = [
    { name: '轻', density: 0.25, color: [1.0, 0.80, 0.10], css: '#ffcc1a' },
    { name: '较轻', density: 0.62, color: [1.0, 0.36, 0.05], css: '#ff6a1f' },
    { name: '中性', density: 1.0, color: [0.90, 0.08, 0.38], css: '#e8256b' },
    { name: '较重', density: 1.55, color: [0.40, 0.20, 0.72], css: '#7a48c9' },
    { name: '重', density: 3.2, color: [0.08, 0.08, 0.10], css: '#2a2c33' },
  ];
  const SLOW = [1, 0.5, 0.25, 0.1];
  const CAM_DEF = [
    { tg: [0, 0.13, 0], d: 2.05, yaw: 8, pitch: 17, fov: 34 },
    { tg: [0.02, 0.25, 0], d: 2.95, yaw: 10, pitch: 11, fov: 34 },
  ];

  const App = JW.App = {
    scene: 0, paused: false, slowIdx: 0, exporting: false, ready: false,
    sel: 0, ball: { mass: 1.2, height: 0.45, mat: 0 },
    wave: { amp: 0.03, freq: 1.25, on: false },
    jcfg: JELLIES.map(j => ({ E: j.E, strength: j.strength })),
    groups: GROUPS.map(g => g.density),
    cam: null, camGoal: null, events: [], clock: 0, demo: null, last: null,
    fps: 60, simRate: 1, frameNo: 0,

    sim() { return this.scene === 0 ? this.jelly : this.water; },

    /* ---------- 初始化 ---------- */
    async init() {
      const canvas = this.canvas = $('stage');
      await GPU.init(canvas);
      this.water = new JW.WaterSim();
      this.jelly = new JW.JellySim();
      this.jelly.reset(this._jellyList());
      this.renderer = new JW.Renderer(this.jelly, this.water);
      this._resize();
      $('loadMsg').textContent = '正在让果冻在台面上静置成形…';
      await this._settleJelly();
      this.rbBalls = [new JW.Readback(this.jelly.maxBalls * 128, 'rbJ'), new JW.Readback(this.water.maxBalls * 128, 'rbW')];
      this.rbStat = new JW.Readback(16, 'rbStat');
      this.ballPrev = [];
      this.crackPrev = 0;
      this._buildUI();
      this.setScene(0, true);
      this.ready = true;
      await GPU.device.queue.onSubmittedWorkDone();
      if (JW.errors.length) throw new Error(JW.errors[0]);
      $('loading').style.opacity = 0;
      setTimeout(() => { $('loading').style.display = 'none'; }, 600);
      window.addEventListener('resize', () => this._resize());
      this._lastT = performance.now();
      requestAnimationFrame((t) => this._frame(t));
    },

    _jellyList(over) {
      return JELLIES.map((j, i) => Object.assign({}, j, this.jcfg[i], over ? over[i] : null));
    },

    /* 初次静置：加大阻尼让果冻在自重下沉降到平衡，缓存这一平衡态，之后的重置直接恢复它（确定性） */
    async _settleJelly() {
      const J = this.jelly;
      const pv = J.params.visc;
      J.jellies.forEach(j => { j.visc = 0.09; }); J.updateMaterials();
      J.step(2200);
      J.jellies.forEach(j => { delete j.visc; }); J.updateMaterials();
      J.step(600);
      await GPU.device.queue.onSubmittedWorkDone();
      const n = J.np;
      this.jcache = {
        pos: new Float32Array(await JW.readBuffer(J.buf.pos, 0, J.maxP * 16)),
        F: new Float32Array(await JW.readBuffer(J.buf.aF, 0, J.maxP * 48)),
      };
      this.jtop = J.jellies.map((jl) => {
        let m = 0; const p = this.jcache.pos;
        for (let i = jl.start; i < jl.start + jl.count; i++) if (p[i * 4 + 1] > m) m = p[i * 4 + 1];
        return m - J.floorY + 0.004;
      });
      J.params.visc = pv;
    },

    _restoreJelly(over) {
      const J = this.jelly, q = GPU.device.queue;
      J.reset(this._jellyList(over));
      q.writeBuffer(J.buf.pos, 0, this.jcache.pos);
      q.writeBuffer(J.buf.aF, 0, this.jcache.F);
    },

    /* ---------- 场景控制 ---------- */
    setScene(id, force) {
      if (id === this.scene && !force) return;
      this.scene = id;
      document.body.className = (id === 0 ? 's0' : 's1') + (this.exporting ? ' exporting' : '');
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', +t.dataset.scene === id));
      this.renderer.setScene(id);
      this.cam = Object.assign({}, CAM_DEF[id], { tg: CAM_DEF[id].tg.slice() });
      this.camGoal = null;
      this.demo = null;
      this.resetScene();
      this._syncUI();
    },

    resetScene(over) {
      this.events = [];
      if (this.scene === 0) {
        this._restoreJelly(over);
        this.crackPrev = 0; this.crackBase = 0;
      } else {
        this.water.reset();
        this.wave.on = false;
        this._applyWave();
      }
      this.clock = 0;
      this.ballPrev = [];
      this._syncUI();
    },

    rerun() {
      const last = this.last;
      this.demo = null;
      this.resetScene();
      if (this.scene === 0) {
        const type = (last && last.type) || 'center';
        this.at(0.12, () => this.hit(type));
      } else {
        this.at(0.1, () => this.dropBalls({}));
        if (last && last.wave) this.at(2.8, () => this.setWave(true));
      }
    },

    at(delay, fn) {
      const t = this.sim().time + delay;
      this.events.push({ t, fn });
      this.events.sort((a, b) => a.t - b.t);
    },

    /* ---------- 场景一：投球 ---------- */
    ballRadius(mass, mat) { return JW.clamp(Math.cbrt(3 * mass / (4 * Math.PI * BALL_MATS[mat].rho)), 0.022, 0.085); },
    spawnBall(o) {
      const j = JELLIES[o.jelly], r = this.ballRadius(o.mass, o.mat);
      const y = this.jtop[o.jelly] + o.h + r;
      this.jelly.spawnBall({ pos: [j.center[0] + o.off[0], y, j.center[1] + o.off[1]], vel: o.vel || [0, 0, 0], radius: r, mass: o.mass, kind: BALL_MATS[o.mat].kind, ang: o.ang });
    },
    spawnBallAt(o) {
      const r = this.ballRadius(o.mass, o.mat);
      this.jelly.spawnBall({ pos: [o.pos[0], r + 0.0005, o.pos[2]], vel: o.vel || [0, 0, 0], radius: r, mass: o.mass, kind: BALL_MATS[o.mat].kind });
    },
    hit(type) {
      const b = this.ball, s = this.sel, j = JELLIES[s];
      const hw = j.shape.type === 'box' ? j.shape.half[0] : j.shape.r1;
      this.last = { type };
      if (type === 'center') {
        this.spawnBall({ jelly: s, off: [0, 0], h: b.height, mass: b.mass, mat: b.mat });
      } else if (type === 'offset') {
        this.spawnBall({ jelly: s, off: [hw * 0.62, hw * 0.12], h: b.height, mass: b.mass, mat: b.mat, vel: [0.55, 0, 0.1] });
      } else {
        const ms = [0.5, 1.0, 1.9], hs = [0.75, 1.0, 1.3], offs = [[0.012, 0], [-0.018, 0.012], [0, -0.006]];
        for (let i = 0; i < 3; i++) {
          const f = () => this.spawnBall({ jelly: s, off: offs[i], h: b.height * hs[i], mass: b.mass * ms[i], mat: b.mat });
          if (i === 0) f(); else this.at(i * 0.42, f);
        }
      }
    },

    /* ---------- 场景二：小球与造浪 ---------- */
    dropBalls(o) {
      const W = this.water, rnd = JW.rng(o.seed || (W.ballSlot * 7919 + 17));
      const per = o.perGroup || 3, list = [];
      const order = [];
      for (let k = 0; k < per; k++) for (let g = 0; g < GROUPS.length; g++) order.push(g);
      // 在深水区上方排成错落的网格，避免初始重叠
      const cols = Math.ceil(order.length / 3), x0 = 0.30, x1 = 1.12;
      order.forEach((g, i) => {
        const c = i % cols, rI = Math.floor(i / cols);
        const x = x0 + (x1 - x0) * (c + 0.5 + (rnd() - 0.5) * 0.5) / cols;
        const z = 0.08 + 0.12 * rI + (rnd() - 0.5) * 0.04;
        const y = (o.y0 || 0.55) + rnd() * (o.spread !== undefined ? o.spread : 0.3) + 0.03 * ((c + rI) % 3);
        list.push({ pos: [x, y, z], vel: [(rnd() - 0.5) * 0.2, o.vy || 0, (rnd() - 0.5) * 0.2], density: this.groups[g], group: 10 + g, spin: rnd() * 6, ang: [(rnd() - 0.5) * 8, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8] });
      });
      // 打乱分组顺序，让颜色混杂入水
      for (let i = list.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        const a = list[i], b = list[k];
        const t = [a.density, a.group]; a.density = b.density; a.group = b.group; b.density = t[0]; b.group = t[1];
      }
      W.spawnBalls(list);
      W.calmTarget = 0;
      this.last = Object.assign(this.last || {}, { balls: true });
    },
    setWave(on, amp, freq) {
      if (amp !== undefined) this.wave.amp = amp;
      if (freq !== undefined) this.wave.freq = freq;
      this.wave.on = on;
      this._applyWave();
      this.last = Object.assign(this.last || {}, { wave: on });
      this._syncUI();
    },
    _applyWave() {
      const p = this.water.paddle;
      if (p.on && !this.wave.on) this.water.calmTarget = 1.5;   // 停机：启用消波阻尼，水面逐次平息
      if (this.wave.on) this.water.calmTarget = 0;
      p.on = this.wave.on; p.ampTarget = this.wave.amp; p.freq = this.wave.freq;
    },

    /* ---------- 推进 ---------- */
    _stepTo(t, cap) {
      const sim = this.sim();
      let n = Math.floor(t / sim.dt + 1e-6) - sim.stepCount;
      if (n <= 0) return 0;
      if (cap !== undefined && n > cap) n = cap;
      sim.step(n);
      return n;
    },
    /* 推进到仿真时刻 target；事件在各自的时刻精确触发。cap 为本次最多子步数 */
    advance(target, cap) {
      const sim = this.sim();
      let budget = cap === undefined ? Infinity : cap;
      while (this.events.length && this.events[0].t <= target && budget > 0) {
        const ev = this.events[0];
        budget -= this._stepTo(ev.t, budget);
        if (sim.time + sim.dt * 0.5 < ev.t) return false;
        this.events.shift();
        ev.fn(this);
      }
      if (budget <= 0) return false;
      this._stepTo(target, budget);
      return sim.time + sim.dt * 1.5 >= target;
    },

    /* ---------- 演示 ---------- */
    async prepareRun(id) {
      const run = JW.DEMOS[id];
      if (!run) throw new Error('未知演示: ' + id);
      if (this.scene !== run.scene) this.setScene(run.scene, true);
      this.demo = null;
      this.paused = false;
      this.resetScene(run.jelly);
      if (run.scene === 0 && run.jelly) {
        // 换了材料参数：带阻尼静置一小段，再恢复正常阻尼
        const J = this.jelly;
        const keep = J.jellies.map(j => j.visc);
        J.jellies.forEach(j => { j.visc = 0.09; }); J.updateMaterials();
        J.step(1000);
        J.jellies.forEach((j, i) => { if (keep[i] === undefined) delete j.visc; else j.visc = keep[i]; }); J.updateMaterials();
        J.step(240);
        J.time = 0; J.stepCount = 0;
      }
      this.clock = 0;
      const dir = new JW.Director(run);
      this.events = (run.events || []).map(e => ({ t: e[0], fn: e[1] }));
      run.setup(this);
      await GPU.device.queue.onSubmittedWorkDone();
      return dir;
    },
    async playDemo(id) {
      const dir = await this.prepareRun(id);
      this.demo = { id, dir, t: 0 };
      this._syncUI();
    },
    stopDemo() { this.demo = null; this.camGoal = null; this._syncUI(); },

    camFromKey(k) {
      const cy = Math.cos(k.pitch * DEG), d = k.d;
      const eye = [k.tg[0] + d * Math.sin(k.yaw * DEG) * cy, k.tg[1] + d * Math.sin(k.pitch * DEG), k.tg[2] + d * Math.cos(k.yaw * DEG) * cy];
      return { eye, target: k.tg, fov: k.fov };
    },

    /* ---------- 实时循环 ---------- */
    _frame(now) {
      requestAnimationFrame((t) => this._frame(t));
      if (!this.ready || this.exporting) { this._lastT = now; return; }
      const dtReal = Math.min(0.05, Math.max(0.001, (now - this._lastT) / 1000));
      this._lastT = now;
      this.fps = this.fps * 0.92 + (1 / dtReal) * 0.08;
      const sim = this.sim();
      const cap = this.scene === 0 ? 72 : 6;
      const before = sim.time;
      let camKey = this.cam;
      if (this.demo) {
        const D = this.demo;
        if (!this.paused) {
          let t2 = D.t + dtReal * SLOW[this.slowIdx];
          const need = (D.dir.simTime(t2) - sim.time) / sim.dt;
          if (need > cap) t2 = D.t + (t2 - D.t) * cap / need;
          D.t = Math.min(t2, D.dir.duration);
          this.advance(D.dir.simTime(D.t));
        }
        camKey = D.dir.camAt(D.dir.simTime(D.t));
        this.cam = Object.assign({}, camKey, { tg: camKey.tg.slice() });
        if (D.t >= D.dir.duration - 1e-6) { this.demo = null; this.clock = sim.time; this._syncUI(); }
      } else if (!this.paused) {
        this.clock += dtReal * SLOW[this.slowIdx];
        const done = this.advance(this.clock, cap);
        if (!done) this.clock = sim.time;
      }
      if (this.camGoal) {
        const c = this.cam, g = this.camGoal, k = 1 - Math.exp(-dtReal * 5);
        for (const key of ['d', 'yaw', 'pitch', 'fov']) c[key] += (g[key] - c[key]) * k;
        for (let i = 0; i < 3; i++) c.tg[i] += (g.tg[i] - c.tg[i]) * k;
        if (Math.abs(c.d - g.d) < 1e-3 && Math.abs(c.yaw - g.yaw) < 0.05) this.camGoal = null;
      }
      this.simRate = this.simRate * 0.9 + ((sim.time - before) / dtReal) * 0.1;
      this.renderer.render(this.camFromKey(this.cam), { time: now / 1000, groupColors: GROUPS.map(g => g.color) });
      this._events();
      if ((this.frameNo++ & 7) === 0) this._stat();
    },

    /* 回读球状态与断裂计数，驱动音效 */
    _events() {
      const sim = this.sim(), rb = this.rbBalls[this.scene], sc = this.scene;
      if (rb.busy || this.rbStat.busy) return;
      const enc = GPU.device.createCommandEncoder();
      const nb = sim.nBalls;
      if (nb > 0) rb.copy(enc, sim.buf.balls, 0);
      if (sc === 0) this.rbStat.copy(enc, this.jelly.buf.stat, 0);
      GPU.device.queue.submit([enc.finish()]);
      if (sc === 0) {
        const p = this.rbStat.fetch();
        if (p) p.then((buf) => {
          if (!buf || this.scene !== 0) return;
          const c = new Uint32Array(buf)[0];
          if (c < this.crackPrev) this.crackPrev = 0;
          const dn = c - this.crackPrev;
          this.crackPrev = c; this.crackTotal = c;
          if (dn > 12) Audio.crack(dn);
        });
      }
      const p2 = nb > 0 ? rb.fetch() : null;
      if (p2) p2.then((buf) => {
        if (!buf || this.scene !== sc) return;
        const f = new Float32Array(buf), prev = this.ballPrev;
        let ke = 0, wetN = 0;
        for (let i = 0; i < nb; i++) {
          const o = i * 32, pv = prev[i];
          const cur = { hit: f[o + 20], hs: f[o + 21], hk: f[o + 22], ent: f[o + 24], es: f[o + 25], jt: f[o + 28], js: f[o + 29], con: f[o + 31], vy: f[o + 5] };
          if (pv && f[o + 15] > 0.5) {
            const kind = f[o + 23];
            if (cur.hit !== pv.hit) Audio.clack(cur.hs * (sc === 0 ? Math.sqrt(f[o + 7]) : 0.8), cur.hk, kind === 0 || kind === 2, sc === 1 && f[o + 19] > 0.3);
            if (sc === 1 && cur.ent !== pv.ent) Audio.splash(cur.es * Math.sqrt(Math.min(f[o + 27], 3)));
            if (sc === 0 && cur.jt !== pv.jt) Audio.thud(cur.js * Math.sqrt(f[o + 7]));
            if (sc === 0 && pv.con > 0.9 && cur.con < 0.9 && cur.vy > 0.25) Audio.boing(cur.vy);
          }
          prev[i] = cur;
          if (sc === 1) { ke += f[o + 4] * f[o + 4] + f[o + 5] * f[o + 5] + f[o + 6] * f[o + 6]; if (f[o + 19] > 0.2) wetN++; }
        }
        this.ballKE = nb ? ke / nb : 0;
      });
      if (sc === 1) {
        const pd = this.water.paddle;
        const m = Math.min(1, Math.abs(pd.v) / 0.35 + pd.amp / 0.05);
        const sl = Math.min(1.2, pd.amp / 0.03 + Math.sqrt(this.ballKE || 0) * 0.5);
        Audio.setWave(this.paused ? 0 : m, pd.freq, this.paused ? 0 : sl, this.paused ? 0 : Math.max(0, (pd.amp - 0.025) / 0.03));
      } else Audio.setWave(0, 1, 0, 0);
    },

    _stat() {
      const sim = this.sim();
      const s = `${this.fps.toFixed(0)} fps · 仿真 ${(this.simRate).toFixed(2)}× · ${(sim.np / 1e4).toFixed(1)} 万${this.scene === 0 ? '质点' : '粒子'} · t = ${sim.time.toFixed(2)} s`;
      $('stat').textContent = s;
      if (this.demo) {
        const el = document.querySelector(`.demo[data-id="${this.demo.id}"] s`);
        if (el) el.style.width = (100 * this.demo.t / this.demo.dir.duration).toFixed(1) + '%';
      }
    },

    _resize() {
      const c = this.canvas, dpr = this.exporting ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(16, Math.round(window.innerWidth * dpr)), h = Math.max(16, Math.round(window.innerHeight * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.renderer.resize(w, h);
    },

    /* 调试/调参辅助：在控制台里直接做一次冲击试验 */
    async probe(o) {
      this.demo = null; this.paused = true;
      if (this.scene !== 0) this.setScene(0, true);
      const over = [{}, {}, {}];
      over[o.jelly] = { E: o.E, strength: o.strength };
      this.resetScene(over);
      if (o.settle) {
        const J = this.jelly;
        J.jellies.forEach(j => { j.visc = 0.09; }); J.updateMaterials(); J.step(1000);
        J.jellies.forEach(j => { delete j.visc; }); J.updateMaterials(); J.step(240);
        J.time = 0; J.stepCount = 0;
      }
      for (const b of o.balls) {
        this.events.push({ t: b.t || 0, fn: () => this.spawnBall(Object.assign({ jelly: o.jelly, off: [0, 0], mat: 0 }, b)) });
      }
      this.events.sort((a, b) => a.t - b.t);
      this.advance(o.T || 1.0);
      await GPU.device.queue.onSubmittedWorkDone();
      const st = await this.jelly.stats();
      const balls = (await this.jelly.readBalls()).map(b => [+b[0].toFixed(3), +b[1].toFixed(3), +b[2].toFixed(3)]);
      return { jel: st.jel[o.jelly], balls, vmax: +st.vmax.toFixed(2) };
    },

    toast(msg) {
      const t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2200);
    },

    /* ---------- 界面 ---------- */
    _slider(parent, o) {
      const d = document.createElement('div'); d.className = 'sl';
      d.innerHTML = `<label><span>${o.dot ? `<i class="dot" style="background:${o.dot}"></i>` : ''}${o.label}</span><output></output></label><input type="range" min="${o.min}" max="${o.max}" step="${o.step}"><div class="ends"><span>${o.ends ? o.ends[0] : ''}</span><span>${o.ends ? o.ends[1] : ''}</span></div>`;
      const inp = d.querySelector('input'), out = d.querySelector('output');
      const show = () => { out.textContent = o.fmt(+inp.value); inp.style.setProperty('--p', ((inp.value - o.min) / (o.max - o.min) * 100) + '%'); };
      inp.addEventListener('input', () => { o.set(+inp.value); show(); });
      parent.appendChild(d);
      const api = { refresh: () => { inp.value = o.get(); show(); } };
      api.refresh();
      return api;
    },
    _buildUI() {
      const self = this;
      this.ui = [];
      document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => this.setScene(+t.dataset.scene)));
      // 果冻选择
      const chips = $('jellyChips');
      JELLIES.forEach((j, i) => {
        const c = document.createElement('div'); c.className = 'chip'; c.dataset.i = i;
        c.innerHTML = `<i style="background:${j.css}"></i>${j.name.replace(' · ', '<br>')}`;
        c.addEventListener('click', () => { this.sel = i; this._syncUI(); this._focusJelly(i); });
        chips.appendChild(c);
      });
      $('hitCenter').onclick = () => { this.stopDemo(); this.hit('center'); };
      $('hitOffset').onclick = () => { this.stopDemo(); this.hit('offset'); };
      $('hitMulti').onclick = () => { this.stopDemo(); this.hit('multi'); };
      $('dropBalls').onclick = () => { this.stopDemo(); this.dropBalls({}); };
      $('waveToggle').onclick = () => { this.stopDemo(); this.setWave(!this.wave.on); };
      // 演示
      const dm = $('demos');
      JW.RUNS.forEach((id) => {
        const r = JW.DEMOS[id];
        const b = document.createElement('button'); b.className = 'demo'; b.dataset.id = id;
        b.innerHTML = `<span class="ic"></span>${r.title}<em>${id}</em><s></s>`;
        b.addEventListener('click', () => { if (this.demo && this.demo.id === id) this.stopDemo(); else this.playDemo(id); });
        dm.appendChild(b);
      });
      // 场景一参数
      const p0 = $('p0');
      p0.innerHTML = '<h2>果冻材料（当前目标）</h2>';
      this.ui.push(this._slider(p0, { label: '软硬（杨氏模量）', min: 4, max: 40, step: 0.5, ends: ['软', '硬'], fmt: v => v.toFixed(1) + ' kPa', get: () => this.jcfg[this.sel].E, set: (v) => { this.jcfg[this.sel].E = v; this.jelly.jellies[this.sel].E = v; this.jelly.updateMaterials(); } }));
      this.ui.push(this._slider(p0, { label: '结实程度（抗拉强度）', min: 2, max: 60, step: 0.5, ends: ['易裂', '结实'], fmt: v => v.toFixed(1) + ' kPa', get: () => this.jcfg[this.sel].strength, set: (v) => { this.jcfg[this.sel].strength = v; this.jelly.jellies[this.sel].strength = v; this.jelly.updateMaterials(); } }));
      const h = document.createElement('h2'); h.textContent = '重球'; p0.appendChild(h);
      const seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'matSeg';
      BALL_MATS.forEach((m, i) => { const e = document.createElement('div'); e.textContent = m.name; e.onclick = () => { this.ball.mat = i; this._syncUI(); }; seg.appendChild(e); });
      p0.appendChild(seg);
      this.ui.push(this._slider(p0, { label: '质量', min: 0.2, max: 6, step: 0.05, ends: ['轻', '重'], fmt: v => `${v.toFixed(2)} kg · ⌀${(this.ballRadius(v, this.ball.mat) * 200).toFixed(1)} cm`, get: () => this.ball.mass, set: (v) => { this.ball.mass = v; } }));
      this.ui.push(this._slider(p0, { label: '下落高度', min: 0.05, max: 1.2, step: 0.01, ends: ['低', '高'], fmt: v => `${(v * 100).toFixed(0)} cm · ${(Math.sqrt(2 * 9.81 * v)).toFixed(1)} m/s`, get: () => this.ball.height, set: (v) => { this.ball.height = v; } }));
      const hint = document.createElement('p'); hint.className = 'hint'; hint.id = 'crackInfo'; p0.appendChild(hint);
      // 场景二参数
      const p1 = $('p1');
      p1.innerHTML = '<h2>造浪装置</h2>';
      this.ui.push(this._slider(p1, { label: '造浪幅度（推板行程）', min: 0.004, max: 0.065, step: 0.001, ends: ['平缓长波', '破碎浪'], fmt: v => '±' + (v * 100).toFixed(1) + ' cm', get: () => this.wave.amp, set: (v) => { this.wave.amp = v; this._applyWave(); } }));
      this.ui.push(this._slider(p1, { label: '造浪频率', min: 0.6, max: 2.0, step: 0.01, ends: ['浪距长', '浪距短'], fmt: v => v.toFixed(2) + ' Hz', get: () => this.wave.freq, set: (v) => { this.wave.freq = v; this._applyWave(); } }));
      const h2 = document.createElement('h2'); h2.textContent = '各组小球密度（水 = 1.00）'; p1.appendChild(h2);
      GROUPS.forEach((g, i) => {
        this.ui.push(this._slider(p1, { label: g.name + '组', dot: g.css, min: 0.1, max: 4, step: 0.01, fmt: v => v.toFixed(2) + (v < 0.97 ? ' 上浮' : v > 1.03 ? ' 下沉' : ' 悬浮'), get: () => this.groups[i], set: (v) => { this.groups[i] = v; this.water.setGroupDensity(10 + i, v); } }));
      });
      const hint2 = document.createElement('p'); hint2.className = 'hint'; hint2.textContent = '小球半径均为 3 cm。槽内水体带约 3% 的微弱密度分层，中性组据此停在水中某一深度。';
      p1.appendChild(hint2);
      // 底栏
      $('btnPause').onclick = () => { this.paused = !this.paused; this._syncUI(); };
      $('btnSlow').onclick = () => { this.slowIdx = (this.slowIdx + 1) % SLOW.length; this._syncUI(); };
      $('btnReset').onclick = () => { this.stopDemo(); this.resetScene(); this.toast('已重置'); };
      $('btnRerun').onclick = () => { this.rerun(); this.toast('重新运行'); };
      $('btnSound').onclick = () => { Audio.enable(!Audio.on); this._syncUI(); };
      $('btnCam').onclick = () => { this.stopDemo(); this.camGoal = Object.assign({}, CAM_DEF[this.scene], { tg: CAM_DEF[this.scene].tg.slice() }); };
      window.addEventListener('keydown', (e) => {
        if (this.exporting) return;
        if (e.code === 'Space') { e.preventDefault(); $('btnPause').click(); }
        else if (e.key === 's' || e.key === 'S') $('btnSlow').click();
        else if (e.key === 'r' || e.key === 'R') $('btnReset').click();
        else if (e.key === 'm' || e.key === 'M') $('btnSound').click();
        else if (e.key === '1') this.setScene(0);
        else if (e.key === '2') this.setScene(1);
      });
      // 相机
      const cv = this.canvas;
      let drag = null;
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('pointerdown', (e) => { if (this.exporting) return; drag = { x: e.clientX, y: e.clientY, b: e.button }; cv.setPointerCapture(e.pointerId); if (this.demo) this.stopDemo(); this.camGoal = null; });
      cv.addEventListener('pointerup', () => { drag = null; });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        const c = this.cam;
        if (drag.b === 0 && !e.shiftKey) {
          c.yaw -= dx * 0.3; c.pitch = JW.clamp(c.pitch + dy * 0.25, -4, 85);
        } else {
          const k = c.d * 0.0012, yr = c.yaw * DEG;
          c.tg[0] -= (Math.cos(yr) * dx) * k; c.tg[2] += (Math.sin(yr) * dx) * k;
          c.tg[1] = JW.clamp(c.tg[1] + dy * k, 0, 1.5);
        }
      });
      cv.addEventListener('wheel', (e) => { e.preventDefault(); if (this.demo) this.stopDemo(); this.camGoal = null; this.cam.d = JW.clamp(this.cam.d * Math.exp(e.deltaY * 0.001), 0.35, 8); }, { passive: false });
    },
    _focusJelly(i) {
      const j = JELLIES[i];
      this.camGoal = { tg: [j.center[0] * 0.8, 0.14, 0], d: 1.55, yaw: this.cam.yaw, pitch: this.cam.pitch, fov: 34 };
    },
    _syncUI() {
      if (!this.ui) return;
      document.querySelectorAll('#jellyChips .chip').forEach(c => c.classList.toggle('on', +c.dataset.i === this.sel));
      document.querySelectorAll('#matSeg div').forEach((c, i) => c.classList.toggle('on', i === this.ball.mat));
      this.ui.forEach(u => u.refresh());
      $('btnPause').textContent = this.paused ? '继续' : '暂停';
      $('btnPause').classList.toggle('on', this.paused);
      $('btnSlow').textContent = '慢放 ' + ['1×', '½×', '¼×', '⅒×'][this.slowIdx];
      $('btnSlow').classList.toggle('on', this.slowIdx > 0);
      $('btnSound').textContent = Audio.on ? '声音 开' : '声音 关';
      $('btnSound').classList.toggle('on', Audio.on);
      $('waveToggle').textContent = this.wave.on ? '停止造浪' : '开始造浪';
      $('waveToggle').classList.toggle('on', this.wave.on);
      document.querySelectorAll('.demo').forEach(b => { const on = this.demo && this.demo.id === b.dataset.id; b.classList.toggle('playing', !!on); if (!on) b.querySelector('s').style.width = '0'; });
    },
  };

  /* ---------- 视频导出接口 ---------- */
  const nextPaint = () => new Promise((res) => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(fin));
    setTimeout(fin, 120);
  });
  const VE = window.videoExport = {
    runs: JW.RUNS.slice(),
    _st: null,
    async begin(runId, opts) {
      await App.readyPromise;
      const fps = Math.max(1, Math.round((opts && opts.fps) || 30));
      App.exporting = true;
      document.body.classList.add('exporting');
      Audio.setWave(0, 1, 0, 0);
      const dir = await App.prepareRun(runId);
      document.body.classList.add('exporting');
      App._resize();
      const frames = Math.max(1, Math.round(dir.duration * fps));
      this._st = { dir, fps, frames, runId };
      return { frames };
    },
    async frame(i) {
      const st = this._st;
      if (!st) throw new Error('请先调用 begin()');
      App._resize();
      const t = Math.min(i / st.fps, st.dir.duration);
      const tau = st.dir.simTime(t);
      App.advance(tau);
      const key = st.dir.camAt(tau);
      App.cam = Object.assign({}, key, { tg: key.tg.slice() });
      App.renderer.render(App.camFromKey(key), { time: t, groupColors: GROUPS.map(g => g.color) });
      await GPU.device.queue.onSubmittedWorkDone();
      await nextPaint();
      App.renderer.present();
      await GPU.device.queue.onSubmittedWorkDone();
    },
    end() {
      this._st = null;
      App.exporting = false;
      document.body.classList.remove('exporting');
      App.demo = null;
      App.clock = App.sim().time;
      App._lastT = performance.now();
      App._resize();
      App._syncUI();
    },
  };

  App.readyPromise = App.init().catch((e) => {
    console.error(e);
    const L = $('loading'); L.classList.add('err'); L.style.display = 'flex'; L.style.opacity = 1;
    $('loadMsg').textContent = '初始化失败：' + (e && e.message ? e.message : e) + '　（需要支持 WebGPU 的 Chrome）';
    throw e;
  });
  App.readyPromise.catch(() => { });
})();
