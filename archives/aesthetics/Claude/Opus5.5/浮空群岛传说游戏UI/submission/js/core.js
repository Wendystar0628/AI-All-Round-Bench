/* =====================================================================
   浮空群岛传说 · UI 原型  —  core.js
   虚拟时钟 / 调度器 / 导出同步 / 舞台缩放 / 场景管理 / 交互 / 转场 / 演示光标
   ===================================================================== */
(function () {
  'use strict';

  const G = (window.G = {
    time: 0,          // 作品内部时刻（毫秒），所有动效都由它驱动
    exporting: false, // 视频导出模式
    touring: false,   // 实时播放演示录像
    busy: false,      // 转场中，屏蔽输入
    scale: 1,
    ox: 0,
    oy: 0,
  });

  /* ---------------- math / easing / rng ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };
  G.clamp = clamp;
  G.lerp = lerp;
  G.E = E;
  G.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  G.hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };

  /* ---------------- scheduler ---------------- */
  let timers = [];
  let seq = 0;
  function insert(tm) {
    let lo = 0, hi = timers.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      const o = timers[m];
      if (o.t < tm.t || (o.t === tm.t && o.id < tm.id)) lo = m + 1;
      else hi = m;
    }
    timers.splice(lo, 0, tm);
  }
  G.at = (t, fn, owner) => {
    const tm = { t, fn, owner, id: ++seq };
    insert(tm);
    return tm.id;
  };
  G.after = (ms, fn, owner) => G.at(G.time + Math.max(0, ms), fn, owner);
  G.cancel = (id) => {
    const i = timers.findIndex((x) => x.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  G.cancelOwner = (owner) => {
    timers = timers.filter((x) => x.owner !== owner);
  };
  G.clearTimers = () => {
    timers = [];
  };
  // 暂停：把属于 owner 的计时器取出，记下剩余时间
  G.pauseOwner = (owner) => {
    const out = [];
    timers = timers.filter((x) => {
      if (x.owner === owner) {
        out.push({ rem: x.t - G.time, fn: x.fn, owner });
        return false;
      }
      return true;
    });
    return out;
  };
  G.resumeOwner = (list) => {
    for (const x of list) G.after(x.rem, x.fn, x.owner);
  };

  const updaters = new Set();
  G.onFrame = (fn) => {
    updaters.add(fn);
    return () => updaters.delete(fn);
  };

  /* ---------------- CSS 动画与虚拟时钟同步（导出模式） ---------------- */
  let animStart = new WeakMap();
  G.resetAnimClock = () => { animStart = new WeakMap(); };
  function registerAnims(t) {
    const list = document.getAnimations();
    for (const a of list) {
      if (!animStart.has(a)) {
        animStart.set(a, t);
        try { a.pause(); a.currentTime = 0; } catch (e) {}
      }
    }
  }
  function syncAnims(t) {
    const list = document.getAnimations();
    for (const a of list) {
      let s = animStart.get(a);
      if (s === undefined) {
        s = t;
        animStart.set(a, s);
        try { a.pause(); } catch (e) {}
      }
      try { a.currentTime = Math.max(0, t - s); } catch (e) {}
    }
  }
  G.syncAnims = syncAnims;
  // 退出导出模式：把未结束的动画恢复播放
  G.releaseAnims = function () {
    for (const a of document.getAnimations()) {
      try {
        const ct = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        const end = ct ? ct.endTime : Infinity;
        if (a.playState === 'paused' && (end === Infinity || (a.currentTime || 0) < end)) a.play();
      } catch (e) {}
    }
  };

  G.advance = function (target) {
    let guard = 0;
    while (timers.length && timers[0].t <= target) {
      const tm = timers.shift();
      if (tm.t > G.time) G.time = tm.t;
      if (G.exporting) syncAnims(G.time);
      try { tm.fn(); } catch (e) { console.error(e); }
      if (G.exporting) registerAnims(G.time);
      if (++guard > 200000) break;
    }
    if (target > G.time) G.time = target;
    for (const fn of Array.from(updaters)) {
      try { fn(G.time); } catch (e) { console.error(e); }
    }
    if (G.exporting) syncAnims(G.time);
  };

  let lastReal = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(100, Math.max(0, now - lastReal));
    lastReal = now;
    if (G.exporting) return;
    G.advance(G.time + dt);
  }
  G.startLoop = () => {
    lastReal = performance.now();
    requestAnimationFrame(loop);
  };
  G.resetRealClock = () => { lastReal = performance.now(); };

  /* ---------------- DOM helpers ---------------- */
  G.$ = (sel, root) => (root || document).querySelector(sel);
  G.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  G.html = (str) => {
    const t = document.createElement('template');
    t.innerHTML = str.trim();
    return t.content.firstElementChild;
  };
  G.fmt = (n) => Math.round(n).toLocaleString('en-US');
  G.pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
  G.fmtTime = (ms, cs = true) => {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
    return G.pad(m) + ':' + G.pad(s) + (cs ? '.' + G.pad(c) : '');
  };
  // 重新触发一个 CSS 动画类
  G.retrigger = (el, cls) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  /* ---------------- 舞台等比缩放 ---------------- */
  const canvases = new Set();
  function sizeCanvas(c) {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(0.25, Math.min(G.scale * dpr * c.q, c.maxK || 4));
    c.k = k;
    const W = Math.max(1, Math.round(c.w * k)), H = Math.max(1, Math.round(c.h * k));
    if (c.el.width !== W) c.el.width = W;
    if (c.el.height !== H) c.el.height = H;
    c.el.style.width = c.w + 'px';
    c.el.style.height = c.h + 'px';
    c.ctx.setTransform(k, 0, 0, k, 0, 0);
    if (c.onResize) c.onResize(c);
  }
  G.canvas = function (el, opts = {}) {
    const c = { el, w: opts.w || 1920, h: opts.h || 1080, q: opts.q || 1, maxK: opts.maxK, ctx: el.getContext('2d') };
    canvases.add(c);
    sizeCanvas(c);
    return c;
  };
  G.dropCanvas = (c) => canvases.delete(c);
  G.begin2d = (c) => {
    c.ctx.setTransform(c.k, 0, 0, c.k, 0, 0);
    c.ctx.globalAlpha = 1;
    c.ctx.globalCompositeOperation = 'source-over';
    c.ctx.filter = 'none';
    c.ctx.clearRect(0, 0, c.w, c.h);
    return c.ctx;
  };
  G.fit = function () {
    const W = window.innerWidth, H = window.innerHeight;
    const s = Math.min(W / 1920, H / 1080);
    G.scale = s;
    G.ox = (W - 1920 * s) / 2;
    G.oy = (H - 1080 * s) / 2;
    G.stage.style.transform = `translate(${G.ox}px,${G.oy}px) scale(${s})`;
    canvases.forEach(sizeCanvas);
  };
  G.toStage = (x, y) => ({ x: (x - G.ox) / G.scale, y: (y - G.oy) / G.scale });
  G.rectOf = (el) => {
    const r = el.getBoundingClientRect();
    const p = G.toStage(r.left, r.top);
    return { x: p.x, y: p.y, w: r.width / G.scale, h: r.height / G.scale, cx: p.x + r.width / G.scale / 2, cy: p.y + r.height / G.scale / 2 };
  };

  /* ---------------- 补间数值 ---------------- */
  class TV {
    constructor(v, clock) {
      this.a = v; this.b = v; this.t0 = 0; this.d = 0; this.ease = E.outCubic;
      this.clock = clock || (() => G.time);
    }
    get(t) {
      if (t === undefined) t = this.clock();
      if (this.d <= 0 || t >= this.t0 + this.d) return this.b;
      if (t <= this.t0) return this.a;
      return lerp(this.a, this.b, this.ease((t - this.t0) / this.d));
    }
    to(v, d = 400, ease = E.outCubic) {
      const t = this.clock();
      this.a = this.get(t); this.b = v; this.t0 = t; this.d = d; this.ease = ease;
      return this;
    }
    set(v) { this.a = this.b = v; this.d = 0; return this; }
    get target() { return this.b; }
  }
  G.TV = TV;

  // 数字滚动
  const numTweens = new Set();
  G.countTo = function (el, from, to, dur, opts = {}) {
    if (!el) return;
    if (el._tw) numTweens.delete(el._tw);
    const tw = { el, from, to, t0: G.time + (opts.delay || 0), dur: Math.max(1, dur), fmt: opts.fmt || G.fmt, ease: opts.ease || E.outCubic };
    el._tw = tw;
    numTweens.add(tw);
    if (!opts.keep) el.textContent = tw.fmt(from);
    return tw;
  };
  G.onFrame(() => {
    for (const tw of numTweens) {
      if (!tw.el.isConnected) { numTweens.delete(tw); continue; }
      if (G.time < tw.t0) continue;
      const p = clamp((G.time - tw.t0) / tw.dur, 0, 1);
      const v = lerp(tw.from, tw.to, tw.ease(p));
      const s = tw.fmt(v);
      if (tw.el.textContent !== s) tw.el.textContent = s;
      if (p >= 1) { numTweens.delete(tw); tw.el._tw = null; }
    }
  });
  G.clearCounters = () => numTweens.clear();

  /* ---------------- 场景 ---------------- */
  class Scene {
    constructor() { this._frames = []; this.root = null; }
    after(ms, fn) { return G.after(ms, fn, this); }
    at(t, fn) { return G.at(t, fn, this); }
    onFrame(fn) { this._frames.push(G.onFrame(fn)); }
    $(s) { return this.root.querySelector(s); }
    $$(s) { return Array.from(this.root.querySelectorAll(s)); }
    enter() {}
    exit() {}
    act() {}
    key() { return false; }
    back() {}
    _dispose() {
      this._frames.forEach((off) => off());
      this._frames = [];
      G.cancelOwner(this);
    }
  }
  G.Scene = Scene;

  const App = (G.App = {
    scene: null,
    id: null,
    defs: {},
    register(id, cls) { this.defs[id] = cls; },
    swap(id, params) {
      G.UI.setHover(null);
      if (this.scene) {
        try { this.scene.exit(); } catch (e) { console.error(e); }
        this.scene._dispose();
        if (this.scene.root) this.scene.root.remove();
      }
      G.$('#overlay').querySelectorAll('.ov-scene').forEach((n) => n.remove());
      const S = new this.defs[id]();
      S.id = id;
      S.root = G.html(`<div class="scene scene-${id}"></div>`);
      G.$('#scenes').appendChild(S.root);
      this.scene = S;
      this.id = id;
      document.documentElement.dataset.scene = id;
      if (G.TOC) G.TOC.mark(id);
      S.enter(params || {});
    },
    go(id, params, trans = 'wind', opts = {}) {
      if (!trans || trans === 'none') { this.swap(id, params); return 0; }
      return G.Trans.run(trans, () => this.swap(id, params), opts);
    },
  });

  /* ---------------- 交互：悬停 / 按下 / 确认 ---------------- */
  const UI = (G.UI = {
    hover: null,
    byMouse: false,
    setHover(el, byMouse = false) {
      if (this.hover === el) return;
      if (this.hover) this.hover.classList.remove('hov');
      this.hover = el;
      this.byMouse = byMouse;
      if (el) {
        el.classList.add('hov');
        if (App.scene && App.scene.onHover) App.scene.onHover(el);
      } else if (App.scene && App.scene.onHover) App.scene.onHover(null);
    },
    activate(el) {
      if (!el || el.classList.contains('dis') || !el.isConnected) return;
      if (G.busy) return;
      if (App.scene && App.scene.root && !App.scene.root.contains(el)) return;
      const act = el.dataset.act;
      if (act && App.scene) App.scene.act(act, el);
    },
    // 完整的模拟点击：按下 → 弹起 → 确认
    click(el, hold = 120) {
      if (!el) return;
      this.setHover(el);
      el.classList.add('is-pressed');
      G.after(hold, () => {
        el.classList.remove('is-pressed');
        this.activate(el);
      });
    },
    pressFlash(el, hold = 140) {
      if (!el) return;
      el.classList.add('is-pressed');
      G.after(hold, () => el.classList.remove('is-pressed'));
    },
  });

  function inputBlocked() {
    return G.exporting || G.touring || G.busy;
  }
  function actEl(t) {
    if (!t || !t.closest) return null;
    const el = t.closest('[data-act],[data-hov]');
    return el && G.stage.contains(el) ? el : null;
  }
  function wireInput() {
    const st = G.stage;
    st.addEventListener('pointerover', (e) => {
      if (inputBlocked()) return;
      const el = actEl(e.target);
      if (el) UI.setHover(el, true);
      else if (UI.byMouse && UI.hover && !UI.hover.dataset.sticky) UI.setHover(null);
    });
    st.addEventListener('pointerdown', (e) => {
      if (inputBlocked() || e.button !== 0) return;
      const el = actEl(e.target);
      if (el && el.dataset.act) el.classList.add('is-pressed');
      if (App.scene && App.scene.pointerDown) App.scene.pointerDown(e, el);
    });
    window.addEventListener('pointerup', () => {
      G.$$('.is-pressed', st).forEach((n) => { if (!n._kp) n.classList.remove('is-pressed'); });
    });
    st.addEventListener('click', (e) => {
      if (inputBlocked()) return;
      const el = actEl(e.target);
      if (el && el.dataset.act) UI.activate(el);
      else if (App.scene && App.scene.blankClick) App.scene.blankClick(e);
    });
    st.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (inputBlocked()) return;
      if (App.scene) App.scene.back();
    });
    window.addEventListener('keydown', (e) => {
      if (G.touring && e.key === 'Escape') { G.Tour && G.Tour.stopLive(); e.preventDefault(); return; }
      if (inputBlocked()) { if (!G.exporting) e.preventDefault(); return; }
      if (['Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.key)) e.preventDefault();
      const S = App.scene;
      if (!S) return;
      if (S.key(e) === true) return;
      if (e.key === 'Escape' || e.key === 'Backspace') S.back();
    });
    window.addEventListener('keyup', (e) => {
      if (inputBlocked()) return;
      const S = App.scene;
      if (S && S.keyUp) S.keyUp(e);
    });
  }
  G.wireInput = wireInput;

  // 通用线性导航（键盘方向键在一组元素中移动选中）
  G.navList = function (items, dir, opts = {}) {
    if (!items.length) return null;
    let i = items.indexOf(UI.hover);
    if (i < 0) i = opts.start != null ? opts.start : 0;
    else {
      i += dir;
      if (opts.wrap) i = (i + items.length) % items.length;
      else i = clamp(i, 0, items.length - 1);
    }
    UI.setHover(items[i]);
    return items[i];
  };
  // 网格导航
  G.navGrid = function (items, dx, dy, cols) {
    if (!items.length) return null;
    let i = items.indexOf(UI.hover);
    if (i < 0) i = 0;
    else {
      let r = Math.floor(i / cols), c = i % cols;
      c = clamp(c + dx, 0, cols - 1);
      r = clamp(r + dy, 0, Math.ceil(items.length / cols) - 1);
      i = Math.min(items.length - 1, r * cols + c);
    }
    UI.setHover(items[i]);
    return items[i];
  };

  /* ---------------- 转场 ---------------- */
  const Trans = (G.Trans = {
    tok: null,
    cancel() {
      if (this.tok) G.cancelOwner(this.tok);
      this.tok = null;
      G.$$('#overlay .tr').forEach((n) => n.remove());
      G.busy = false;
    },
    run(type, swap, opts = {}) {
      const ov = G.$('#overlay');
      this.cancel();
      const tok = (this.tok = {});
      const spec = this.types[type] || this.types.wind;
      const node = G.html(spec.html(opts));
      ov.appendChild(node);
      G.busy = true;
      G.UI.setHover(null);
      if (spec.start) spec.start(node, opts);
      G.after(spec.cover, () => {
        swap();
        node.classList.add('out');
        if (spec.mid) spec.mid(node, opts);
      }, tok);
      G.after(spec.cover + spec.reveal, () => {
        node.remove();
        G.busy = false;
        if (opts.done) opts.done();
      }, tok);
      return spec.cover + spec.reveal;
    },
    types: {
      wind: {
        cover: 520,
        reveal: 620,
        html: () => `<div class="tr tr-wind"><i class="b b1"></i><i class="b b2"></i><i class="b b3"></i><i class="b b4"></i>
            <div class="tr-emb"><svg viewBox="-50 -50 100 100"><circle r="30" class="r1"/><circle r="40" class="r2"/><path class="st" d="M0 -26 Q0 0 26 0 Q0 0 0 26 Q0 0 -26 0 Q0 0 0 -26Z"/></svg></div></div>`,
      },
      star: {
        cover: 640,
        reveal: 700,
        html: (o) => {
          const x = o.x != null ? o.x : 960, y = o.y != null ? o.y : 540;
          return `<div class="tr tr-star" style="--x:${x}px;--y:${y}px">
            <svg class="cov" viewBox="0 0 1920 1080" preserveAspectRatio="none">
              <defs><radialGradient id="trsg" cx="${x / 19.2}%" cy="${y / 10.8}%" r="80%"><stop offset="0" stop-color="#1b3a7a"/><stop offset=".55" stop-color="#0b1838"/><stop offset="1" stop-color="#050b1d"/></radialGradient>
              <mask id="trsm"><rect width="1920" height="1080" fill="#fff"/><path class="hole" d="M960 300 Q960 540 1200 540 Q960 540 960 780 Q960 540 720 540 Q960 540 960 300Z" fill="#000"/></mask></defs>
              <g class="grow" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y - 160} Q${x} ${y} ${x + 160} ${y} Q${x} ${y} ${x} ${y + 160} Q${x} ${y} ${x - 160} ${y} Q${x} ${y} ${x} ${y - 160}Z" fill="url(#trsg)" stroke="#ffe29a" stroke-width="2"/></g>
              <rect class="full" width="1920" height="1080" fill="url(#trsg)" mask="url(#trsm)"/>
            </svg>
            <div class="tr-emb big"><svg viewBox="-50 -50 100 100"><circle r="30" class="r1"/><circle r="40" class="r2"/><path class="st" d="M0 -26 Q0 0 26 0 Q0 0 0 26 Q0 0 -26 0 Q0 0 0 -26Z"/></svg></div>
          </div>`;
        },
      },
      flash: {
        cover: 380,
        reveal: 900,
        html: () => `<div class="tr tr-flash"></div>`,
      },
      fade: {
        cover: 600,
        reveal: 700,
        html: () => `<div class="tr tr-fade"></div>`,
      },
      sortie: {
        cover: 1250,
        reveal: 700,
        html: (o) => `<div class="tr tr-sortie">
            <i class="lb top"></i><i class="lb bot"></i>
            <div class="so-line"></div>
            <div class="so-up"><b>出击</b></div><div class="so-down"><em>SORTIE</em><small>${o.sub || ''}</small></div>
          </div>`,
      },
    },
  });

  /* ---------------- 演示光标 ---------------- */
  const Cursor = (G.Cursor = {
    el: null,
    x: 960, y: 620,
    seg: null,
    visible: false,
    init() {
      this.el = G.$('#tcursor');
      G.onFrame(() => this.update());
    },
    reset() {
      this.seg = null;
      this.x = 1180; this.y = 760;
      this.hide(true);
    },
    show() {
      this.visible = true;
      this.el.classList.add('on');
    },
    hide(instant) {
      this.visible = false;
      this.el.classList.remove('on');
      if (instant) this.el.classList.remove('click');
    },
    pos(t) {
      const s = this.seg;
      if (!s) return { x: this.x, y: this.y };
      if (t >= s.t1) return { x: s.x1, y: s.y1 };
      if (t <= s.t0) return { x: s.x0, y: s.y0 };
      const p = s.ease((t - s.t0) / (s.t1 - s.t0));
      // 轻微的弧线，让轨迹更像手的移动
      const mx = lerp(s.x0, s.x1, p), my = lerp(s.y0, s.y1, p);
      const arc = Math.sin(p * Math.PI) * s.arc;
      return { x: mx + s.nx * arc, y: my + s.ny * arc };
    },
    resolve(target, ox = 0, oy = 0) {
      if (!target) return { x: this.x, y: this.y };
      if (typeof target === 'string') target = G.$(target, G.stage);
      if (!target) return { x: this.x, y: this.y };
      if (target.nodeType) {
        const r = G.rectOf(target);
        return { x: r.cx + ox, y: r.cy + oy, el: target };
      }
      return { x: target.x + ox, y: target.y + oy };
    },
    moveTo(target, dur = 600, opts = {}) {
      const p0 = this.pos(G.time);
      const p1 = this.resolve(target, opts.ox || 0, opts.oy || 0);
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      this.seg = {
        t0: G.time, t1: G.time + dur,
        x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y,
        nx: -dy / len, ny: dx / len,
        arc: Math.min(60, len * 0.12) * (opts.arcDir || 1),
        ease: opts.ease || E.inOutCubic,
      };
      this.x = p1.x; this.y = p1.y;
      if (p1.el && opts.hover !== false) G.after(dur * 0.82, () => G.UI.setHover(p1.el));
      return p1.el;
    },
    click(el) {
      G.retrigger(this.el, 'click');
      const p = this.pos(G.time);
      const rp = G.html(`<div class="cur-ripple" style="left:${p.x}px;top:${p.y}px"><i></i><i></i></div>`);
      G.$('#overlay').appendChild(rp);
      G.after(700, () => rp.remove());
      if (el === undefined && this.seg) el = null;
      if (el) G.UI.click(el);
    },
    update() {
      if (!this.el) return;
      const p = this.pos(G.time);
      this.el.style.transform = `translate(${p.x - 4}px,${p.y - 3}px)`;
    },
  });

  G.stage = document.getElementById('stage');
})();
