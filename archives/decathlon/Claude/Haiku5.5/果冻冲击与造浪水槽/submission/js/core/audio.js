// 声音：全部用 Web Audio 合成，不加载任何文件。必须在用户操作之后才能播放。
const Sound = {
  ctx: null,
  master: null,
  noise: null,
  on: true,

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = seed / 2147483648 - 1;
      }
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  setOn(v) {
    this.on = v;
  },

  ready() {
    return this.ctx && this.on && this.ctx.state === 'running';
  },

  _env(gain, t0, attack, decay, dest) {
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime + t0;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    g.connect(dest || this.master);
    return g;
  },

  _noiseSrc(filterType, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    src.connect(f);
    return { src, out: f };
  },

  // 重球撞击果冻/台面：低频闷响 + 短促噪声
  impact(k) {
    if (!this.ready()) return;
    k = clamp(k, 0.05, 1);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const g = this._env(0.9 * k, 0, 0.005, 0.28);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.35);
    const n = this._noiseSrc('lowpass', 900, 0.8);
    const gn = this._env(0.5 * k, 0, 0.002, 0.07);
    n.out.connect(gn);
    n.src.start(t, Math.random() * 0.5, 0.2);
  },

  // 弹起、落地
  bounce(k) {
    if (!this.ready()) return;
    k = clamp(k, 0.05, 1);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.09);
    const g = this._env(0.35 * k, 0, 0.003, 0.1);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.15);
  },

  // 开裂：一串高频碎响
  crack(k) {
    if (!this.ready()) return;
    k = clamp(k, 0.2, 1);
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const n = this._noiseSrc('highpass', 1800 + Math.random() * 2400, 1.2);
      const g = this._env(0.45 * k * (1 - i / 9), i * 0.035 + Math.random() * 0.02, 0.001, 0.05);
      n.out.connect(g);
      n.src.start(t0 + i * 0.035, Math.random() * 0.6, 0.12);
    }
  },

  // 球与球碰撞：清脆的叮声
  clink(k) {
    if (!this.ready()) return;
    k = clamp(k, 0.05, 1);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2100 + Math.random() * 400;
    const t = this.ctx.currentTime;
    const g = this._env(0.25 * k, 0, 0.001, 0.16);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.2);
  },

  // 入水：带噪的水声，频率上扬
  splash(k) {
    if (!this.ready()) return;
    k = clamp(k, 0.05, 1);
    const t = this.ctx.currentTime;
    const n = this._noiseSrc('bandpass', 900, 0.9);
    n.out.frequency.setValueAtTime(700, t);
    n.out.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
    const g = this._env(0.7 * k, 0, 0.01, 0.45);
    n.out.connect(g);
    n.src.start(t, Math.random() * 0.5, 0.6);
  },

  // 造浪：低沉的水流隆隆声
  wave(k) {
    if (!this.ready()) return;
    k = clamp(k, 0.05, 1);
    const t = this.ctx.currentTime;
    const n = this._noiseSrc('lowpass', 260, 0.7);
    const g = this._env(0.42 * k, 0, 0.3, 1.2);
    n.out.connect(g);
    n.src.start(t, Math.random() * 0.5, 1.6);
  },
};
