// 属性最终求值（关键帧 + 表达式），依赖跟踪、循环检测与错误回退
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const A = MF.Anim;
  const tk = (t) => Math.round(t * 100000);

  class CycleError extends Error { constructor(members) { super('循环引用'); this.members = members; this.isCycle = true; } }

  const Eval = (MF.Eval = {
    project: null, rev: 1, _index: null, _indexRev: 0, errors: new Map(), stack: [], compiled: new Map(),
    setProject(p) { Eval.project = p; Eval.touch(); },
    touch() { Eval.rev++; },
    // prop 对象 → 描述 { comp, layer, node, id, meta, uid, label }
    index() {
      if (Eval._index && Eval._indexRev === Eval.rev) return Eval._index;
      const idx = new Map(); const byUid = new Map(); const P = Eval.project;
      if (P) for (const comp of P.comps) {
        for (const L of comp.layers) {
          const add = (d) => { const o = { comp, layer: L, id: d.id, meta: d.meta, label: d.label, uid: comp.id + '/' + L.id + ':' + d.id, cache: null, cacheRev: 0 }; idx.set(d.prop, o); byUid.set(o.uid, o); };
          for (const m of MF.Schema.transform) add({ id: 'tr.' + m.key, meta: m, label: m.label, prop: L.tr[m.key] });
          for (const d of MF.Model.flatProps(MF.Model.propTree(P, comp, L))) { if (d.id.startsWith('node.') || d.id.startsWith('pin.')) continue; add(d); }
        }
        if (MF.Nodes) for (const d of MF.Nodes.allProps(comp)) { const o = { comp, layer: null, node: d.node, id: d.id, meta: d.meta, label: d.label, uid: comp.id + '/:' + d.id, cache: null, cacheRev: 0 }; idx.set(d.prop, o); byUid.set(o.uid, o); }
      }
      // 清理已不存在属性的错误
      for (const k of Array.from(Eval.errors.keys())) if (!byUid.has(k)) Eval.errors.delete(k);
      Eval._index = idx; Eval._byUid = byUid; Eval._indexRev = Eval.rev;
      return idx;
    },
    desc(prop) { return Eval.index().get(prop) || null; },
    errorOf(prop) { const d = Eval.desc(prop); if (!d) return null; const e = Eval.errors.get(d.uid); return e ? e.msg : null; },
    // 关键帧值（不含表达式）
    raw(prop, t) { const d = Eval.desc(prop); return A.value(prop, t, d ? d.meta : null); },
    // 最终值
    val(prop, t) {
      if (!prop) return 0;
      if (!prop.x || prop.xOn === false) { if (!prop.k) return prop.v; const d0 = Eval.index().get(prop); return A.value(prop, t, d0 ? d0.meta : null); }
      const d = Eval.index().get(prop);
      if (!d) return A.value(prop, t, null);
      if (d.cacheRev !== Eval.rev) { d.cache = new Map(); d.cacheRev = Eval.rev; d.cyc = false; }
      const key = tk(t); const hit = d.cache.get(key); if (hit !== undefined) return hit;
      const base = A.value(prop, t, d.meta);
      if (d.cyc) return base;
      const skey = d.uid + '@' + key;
      const si = Eval.stack.indexOf(skey);
      if (si >= 0) throw new CycleError(Eval.stack.slice(si).map((s) => s.split('@')[0]));
      // 同一属性在不同时间递归（valueAtTime 自引用链）深度保护
      if (Eval.stack.length > 60) throw new CycleError([d.uid]);
      Eval.stack.push(skey);
      let out = base;
      try {
        out = runExpr(d, prop, t, base);
        const e = Eval.errors.get(d.uid); if (e && (!e.cycle || e.rev !== Eval.rev)) Eval.errors.delete(d.uid);
      } catch (e) {
        if (e && e.isCycle) {
          const names = e.members.map((u) => { const o = Eval._byUid.get(u); return o ? (o.layer ? o.layer.name : o.node ? o.node.name : '') + '.' + o.label : u; });
          if (e.members.indexOf(d.uid) >= 0) {
            Eval.errors.set(d.uid, { msg: '循环引用：' + names.concat(names[0]).join(' → ') + '（已退回关键帧值）', cycle: true, rev: Eval.rev });
            d.cyc = true;
            Eval.stack.pop();
            if (e.members[0] !== d.uid) throw e; // 继续回溯到环的起点
            return base;
          }
          // 引用了一个处于循环中的属性：使用其回退值重新计算
          Eval.stack.pop();
          try { Eval.stack.push(skey); out = runExpr(d, prop, t, base); } catch (e2) { Eval.errors.set(d.uid, { msg: errMsg(e2), rev: Eval.rev }); out = base; }
        } else {
          Eval.errors.set(d.uid, { msg: errMsg(e) + '（已退回关键帧值）', rev: Eval.rev });
          out = base;
        }
      }
      Eval.stack.pop();
      if (d.cache.size > 6000) d.cache.clear();
      d.cache.set(key, out);
      return out;
    },
  });
  function errMsg(e) {
    let m = e && e.message ? e.message : String(e);
    if (e instanceof SyntaxError) m = '语法错误：' + m;
    else if (e instanceof ReferenceError) m = '未定义的名称：' + m.replace(/ is not defined/, '');
    else if (e instanceof TypeError) m = '类型错误：' + m;
    return m;
  }
  function compile(src) {
    let c = Eval.compiled.get(src); if (c) return c;
    c = {};
    try { c.fn = new Function('$s', 'with($s){return (' + src + '\n);}'); }
    catch (e1) {
      try { new Function(src); c.fn = new Function('$s', '$src', 'with($s){return eval($src);}'); c.viaEval = true; }
      catch (e2) { c.err = e2; }
    }
    if (Eval.compiled.size > 2000) Eval.compiled.clear();
    Eval.compiled.set(src, c);
    return c;
  }
  function runExpr(d, prop, t, base) {
    const c = compile(prop.x);
    if (c.err) throw c.err;
    const scope = makeScope(d, prop, t, base);
    let r = c.viaEval ? c.fn(scope, prop.x) : c.fn(scope);
    return coerce(r, base, d);
  }
  function coerce(r, base, d) {
    if (r instanceof PropRef) r = r.value;
    if (typeof r === 'boolean') r = r ? 1 : 0;
    if (typeof base === 'number') {
      if (Array.isArray(r)) r = r[0];
      if (typeof r !== 'number' || !isFinite(r)) throw new Error('表达式结果应为数值，得到 ' + (r === undefined ? 'undefined' : JSON.stringify(r)));
      return r;
    }
    if (Array.isArray(base)) {
      if (typeof r === 'number') { if (base.length === 1) return [r]; throw new Error('表达式结果应为 ' + base.length + ' 维数组，得到单个数值'); }
      if (!Array.isArray(r)) throw new Error('表达式结果应为 ' + base.length + ' 维数组');
      const o = new Array(base.length);
      for (let i = 0; i < base.length; i++) { let x = i < r.length ? r[i] : base[i]; if (x instanceof PropRef) x = x.value; if (typeof x !== 'number' || !isFinite(x)) throw new Error('表达式结果第 ' + (i + 1) + ' 个分量不是有效数值'); o[i] = x; }
      return o;
    }
    return base;
  }

  // ---------- 属性引用 ----------
  class PropRef {
    constructor(d, prop, t) { this._d = d; this._p = prop; this._t = t; }
    get value() { return Eval.val(this._p, this._t); }
    valueOf() { const v = this.value; return Array.isArray(v) ? v[0] : v; }
    toString() { return String(this.value); }
    valueAtTime(t) { return Eval.val(this._p, +t); }
    get velocity() { return this.velocityAtTime(this._t); }
    velocityAtTime(t) { const h = 1 / 600, a = Eval.val(this._p, t - h), b = Eval.val(this._p, t + h); return Array.isArray(a) ? a.map((x, i) => (b[i] - x) / (2 * h)) : (b - a) / (2 * h); }
    get speed() { return this.speedAtTime(this._t); }
    speedAtTime(t) { const v = this.velocityAtTime(t); return Array.isArray(v) ? Math.hypot(...v) : Math.abs(v); }
    get numKeys() { return this._p.k ? this._p.k.length : 0; }
    key(i) { const k = this._p.k && this._p.k[i - 1]; if (!k) throw new Error('关键帧序号超出范围'); return { time: k.t, value: k.v, index: i }; }
    nearestKey(t) { const k = this._p.k; if (!k || !k.length) throw new Error('属性没有关键帧'); let b = 0; for (let i = 1; i < k.length; i++) if (Math.abs(k[i].t - t) < Math.abs(k[b].t - t)) b = i; return { time: k[b].t, value: k[b].v, index: b + 1 }; }
    wiggle(f, a, o, m, t) { return wiggle(this._d, this.valueAtTime(t === undefined ? this._t : t), f, a, o, m, t === undefined ? this._t : t); }
    loopOut(type, n) { return loop(this._d, this._p, this._t, type, n, 1); }
    loopIn(type, n) { return loop(this._d, this._p, this._t, type, n, -1); }
    get name() { return this._d.label; }
    get length() { const v = this.value; return Array.isArray(v) ? v.length : 1; }
    [Symbol.iterator]() { const v = this.value; return (Array.isArray(v) ? v : [v])[Symbol.iterator](); }
    map(f) { const v = this.value; return (Array.isArray(v) ? v : [v]).map(f); }
  }
  for (let i = 0; i < 4; i++) Object.defineProperty(PropRef.prototype, i, { get() { const v = this.value; return Array.isArray(v) ? v[i] : i === 0 ? v : undefined; } });
  MF.PropRef = PropRef;

  function wiggle(d, value, freq, amp, oct, mult, t) {
    freq = +freq || 0; amp = +amp || 0; oct = Math.max(1, Math.min(6, oct | 0 || 1)); mult = mult === undefined ? 0.5 : +mult;
    const seed = MF.strHash(d.uid);
    const n = (dim) => { let s = 0, a = 1, f = 1; for (let o = 0; o < oct; o++) { s += a * MF.noise1(t * freq * f + dim * 37.13 + o * 11.7, seed + dim * 131 + o * 17); a *= mult; f *= 2; } return s; };
    if (Array.isArray(value)) return value.map((x, i) => x + amp * n(i));
    return value + amp * n(0);
  }
  function loop(d, prop, t, type, nk, dir) {
    const k = prop.k, meta = d.meta; type = type || 'cycle';
    const cur = A.value(prop, t, meta);
    if (!k || k.length < 2) return cur;
    const n = k.length; nk = nk | 0;
    let first, last;
    if (dir > 0) { last = k[n - 1].t; first = k[nk > 0 ? Math.max(0, n - 1 - nk) : 0].t; if (t <= last) return cur; }
    else { first = k[0].t; last = k[nk > 0 ? Math.min(n - 1, nk) : n - 1].t; if (t >= first) return cur; }
    const span = last - first; if (span <= 0) return cur;
    const over = dir > 0 ? t - last : first - t;
    const cycles = Math.floor(over / span), rem = over - cycles * span;
    const at = (tt) => A.value(prop, tt, meta);
    const vAdd = (a, b, s) => (Array.isArray(a) ? a.map((x, i) => x + b[i] * s) : a + b * s);
    const vSub = (a, b) => (Array.isArray(a) ? a.map((x, i) => x - b[i]) : a - b);
    if (type === 'pingpong') { const fwd = cycles % 2 === 1; return dir > 0 ? at(fwd ? first + rem : last - rem) : at(fwd ? last - rem : first + rem); }
    if (type === 'offset') { const delta = vSub(at(last), at(first)); return dir > 0 ? vAdd(at(first + rem), delta, cycles + 1) : vAdd(at(last - rem), delta, -(cycles + 1)); }
    if (type === 'continue') { const h = 1 / 600; const e = dir > 0 ? last : first; const v = vSub(at(e + (dir > 0 ? 0 : h)), at(e - (dir > 0 ? h : 0))); return vAdd(at(e), v, (dir > 0 ? over : -over) / h); }
    return dir > 0 ? at(first + rem) : at(last - rem);
  }

  // ---------- 代理对象 ----------
  function matchDesc(list, name) { for (const d of list) if (d.meta.key === name || d.meta.ae === name || d.label === name) return d; return null; }
  function layerDescs(comp, L, prefix) {
    const out = []; Eval.index();
    const tree = MF.Model.flatProps(MF.Model.propTree(Eval.project, comp, L));
    for (const d of tree) if (d.id.startsWith(prefix)) out.push(d);
    if (prefix === 'tr.') for (const m of MF.Schema.transform) if (!out.some((x) => x.id === 'tr.' + m.key)) out.push({ id: 'tr.' + m.key, meta: m, label: m.label, prop: L.tr[m.key] });
    return out;
  }
  function refOf(d, t) { const full = Eval.index().get(d.prop); if (!full) throw new Error('无法定位属性 ' + d.label); return new PropRef(full, d.prop, t); }
  function groupProxy(comp, L, prefix, t, what) {
    return new Proxy({}, { get(_, name) { if (typeof name !== 'string') return undefined; const d = matchDesc(layerDescs(comp, L, prefix), name); if (!d) throw new Error(what + ' 中没有属性 “' + name + '”'); return refOf(d, t); } });
  }
  function layerProxy(comp, L, t) {
    const tr = () => groupProxy(comp, L, 'tr.', t, '图层 “' + L.name + '” 的变换');
    const self = {
      get name() { return L.name; }, get index() { return MF.Model.layerIndex(comp, L.id) + 1; }, get inPoint() { return L.in; }, get outPoint() { return L.out; }, get startTime() { return L.start; },
      get hasParent() { return !!MF.Model.getLayer(comp, L.parent); }, get parent() { const p = MF.Model.getLayer(comp, L.parent); if (!p) throw new Error('图层 “' + L.name + '” 没有父级'); return layerProxy(comp, p, t); },
      get transform() { return tr(); },
      get position() { return tr().position; }, get scale() { return tr().scale; }, get rotation() { return tr().rotation; }, get opacity() { return tr().opacity; }, get anchorPoint() { return tr().anchorPoint; },
      get xRotation() { return tr().xRotation; }, get yRotation() { return tr().yRotation; }, get zRotation() { return tr().rotation; },
      effect(name) {
        const f = typeof name === 'number' ? L.fx[name - 1] : L.fx.find((x) => x.name === name);
        if (!f) throw new Error('图层 “' + L.name + '” 上没有效果 “' + name + '”');
        const get = (pn) => { const ds = layerDescs(comp, L, 'fx.' + f.id + '.'); const d = pn === undefined || typeof pn === 'number' ? ds[(pn || 1) - 1] : matchDesc(ds, pn); if (!d) throw new Error('效果 “' + f.name + '” 没有参数 “' + pn + '”'); return refOf(d, t); };
        const fn = (pn) => get(pn); fn.param = get; return fn;
      },
      content(name) { const it = (L.items || []).find((x) => x.name === name); if (!it) throw new Error('图层 “' + L.name + '” 的内容中没有 “' + name + '”'); return groupProxy(comp, L, 'it.' + it.id + '.', t, '形状 “' + name + '”'); },
      mask(name) { const m = L.masks.find((x) => x.name === name) || L.masks[name - 1]; if (!m) throw new Error('没有蒙版 “' + name + '”'); return groupProxy(comp, L, 'mask.' + m.id + '.', t, '蒙版'); },
      get material() { return groupProxy(comp, L, 'mat.', t, '材质'); }, get materialOption() { return self.material; },
      get cameraOption() { return groupProxy(comp, L, 'cam.', t, '摄像机选项'); }, get lightOption() { return groupProxy(comp, L, 'light.', t, '灯光选项'); },
      get text() { return groupProxy(comp, L, 'text.', t, '文本'); }, get particles() { return groupProxy(comp, L, 'ps.', t, '粒子'); },
      emitter(name) { const e = (L.ps ? L.ps.emitters : []).find((x) => x.name === name) || (L.ps ? L.ps.emitters[name - 1] : null); if (!e) throw new Error('没有发射器 “' + name + '”'); return groupProxy(comp, L, 'em.' + e.id + '.', t, '发射器'); },
      prop(id) { const d = MF.Model.findProp(Eval.project, comp, L, id); if (!d) throw new Error('图层 “' + L.name + '” 没有属性路径 “' + id + '”'); return refOf(d, t); },
      toWorld(pt, tt) { const m = MF.Scene.worldMatrix(comp, L, tt === undefined ? t : tt); return MF.M4.tp(m, [pt[0], pt[1], pt[2] || 0]); },
      toComp(pt, tt) { return self.toWorld(pt, tt); },
      fromWorld(pt, tt) { const m = MF.M4.invert(MF.Scene.worldMatrix(comp, L, tt === undefined ? t : tt)); return MF.M4.tp(m, [pt[0], pt[1], pt[2] || 0]); },
    };
    return self;
  }
  function compProxy(comp, t) {
    return {
      get name() { return comp.name; }, get width() { return comp.w; }, get height() { return comp.h; }, get duration() { return comp.duration; }, get frameDuration() { return 1 / comp.fps; }, get numLayers() { return comp.layers.length; },
      layer(n) { const L = typeof n === 'number' ? comp.layers[n - 1] : MF.Model.layerByName(comp, n); if (!L) throw new Error('合成 “' + comp.name + '” 中找不到图层 “' + n + '”'); return layerProxy(comp, L, t); },
      node(name) {
        const nd = (comp.nodes || []).find((x) => x.name === name); if (!nd) throw new Error('合成 “' + comp.name + '” 中找不到节点 “' + name + '”');
        const get = (pn) => { const ds = MF.Nodes.propGroup(nd).children; const d = matchDesc(ds, pn); if (!d) throw new Error('节点 “' + name + '” 没有参数 “' + pn + '”'); return refOf(d, t); };
        return new Proxy({ param: get, output: (port, tt) => MF.Nodes.scalarOut(comp, nd, port, tt === undefined ? t : tt) }, { get(o, k) { if (k in o) return o[k]; if (typeof k !== 'string') return undefined; return get(k); } });
      },
    };
  }

  // ---------- 作用域 ----------
  const vec = (a) => (a instanceof PropRef ? a.value : a);
  const bin = (f) => (a, b) => { a = vec(a); b = vec(b); if (Array.isArray(a) || Array.isArray(b)) { const n = Math.max(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0); const o = []; for (let i = 0; i < n; i++) o.push(f(Array.isArray(a) ? a[i] || 0 : a, Array.isArray(b) ? b[i] || 0 : b)); return o; } return f(a, b); };
  const interp = (shape) => function (t, a, b, c, d) {
    t = +vec(t); if (arguments.length === 3) { c = a; d = b; a = 0; b = 1; }
    a = +vec(a); b = +vec(b); c = vec(c); d = vec(d);
    let u = b === a ? (t >= b ? 1 : 0) : MF.clamp((t - a) / (b - a), 0, 1); u = shape(u);
    if (Array.isArray(c)) return c.map((x, i) => x + ((Array.isArray(d) ? d[i] : d) - x) * u);
    return c + (d - c) * u;
  };
  const baseScope = {
    Math, linear: interp((u) => u), ease: interp((u) => u * u * (3 - 2 * u)), easeIn: interp((u) => u * u), easeOut: interp((u) => 1 - (1 - u) * (1 - u)),
    clamp(v, a, b) { v = vec(v); return Array.isArray(v) ? v.map((x, i) => MF.clamp(x, Array.isArray(a) ? a[i] : a, Array.isArray(b) ? b[i] : b)) : MF.clamp(v, a, b); },
    add: bin((a, b) => a + b), sub: bin((a, b) => a - b), mul: bin((a, b) => a * b), div: bin((a, b) => a / b),
    length(a, b) { a = vec(a); if (b !== undefined) { b = vec(b); a = Array.isArray(a) ? a.map((x, i) => x - (b[i] || 0)) : a - b; } return Array.isArray(a) ? Math.hypot(...a) : Math.abs(a); },
    normalize(a) { a = vec(a); const l = Math.hypot(...a) || 1; return a.map((x) => x / l); },
    dot(a, b) { a = vec(a); b = vec(b); let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (b[i] || 0); return s; },
    cross(a, b) { return MF.V3.cross(vec(a), vec(b)); },
    degreesToRadians: (d) => d * MF.DEG, radiansToDegrees: (r) => r / MF.DEG,
    hslToRgb(c) { c = vec(c); const h = c[0], s = c[1], l = c[2]; const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4), c[3] === undefined ? 1 : c[3]]; },
  };
  function makeScope(d, prop, t, base) {
    const comp = d.comp, L = d.layer; const s = Object.create(baseScope);
    let seedOff = 0, timeless = false;
    s.time = t; s.value = base; s.thisComp = compProxy(comp, t);
    s.thisProperty = new PropRef(d, prop, t);
    s.comp = (name) => { const c = Eval.project.comps.find((x) => x.name === name); if (!c) throw new Error('找不到合成 “' + name + '”'); return compProxy(c, t); };
    s.wiggle = (f, a, o, m, tt) => wiggle(d, tt === undefined ? base : A.value(prop, tt, d.meta), f, a, o, m, tt === undefined ? t : tt);
    s.loopOut = (type, n) => loop(d, prop, t, type, n, 1); s.loopIn = (type, n) => loop(d, prop, t, type, n, -1);
    s.loopOutDuration = s.loopOut; s.loopInDuration = s.loopIn;
    s.valueAtTime = (tt) => A.value(prop, +tt, d.meta);
    s.velocityAtTime = (tt) => { const h = 1 / 600, a = A.value(prop, tt - h, d.meta), b = A.value(prop, tt + h, d.meta); return Array.isArray(a) ? a.map((x, i) => (b[i] - x) / (2 * h)) : (b - a) / (2 * h); };
    Object.defineProperty(s, 'velocity', { get() { return s.velocityAtTime(t); } });
    Object.defineProperty(s, 'numKeys', { get() { return prop.k ? prop.k.length : 0; } });
    s.key = (i) => s.thisProperty.key(i); s.nearestKey = (tt) => s.thisProperty.nearestKey(tt);
    s.seedRandom = (sd, tl) => { seedOff = sd | 0; timeless = !!tl; };
    let rc = 0;
    s.random = (a, b) => {
      const r = () => MF.rand01(MF.strHash(d.uid) + seedOff * 7919, timeless ? 0 : Math.round(t * comp.fps), rc++);
      if (a === undefined) return r(); if (b === undefined) { b = a; a = Array.isArray(b) ? b.map(() => 0) : 0; }
      if (Array.isArray(a) || Array.isArray(b)) { const n = Math.max(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0), o = []; for (let i = 0; i < n; i++) { const lo = Array.isArray(a) ? a[i] : a, hi = Array.isArray(b) ? b[i] : b; o.push(lo + (hi - lo) * r()); } return o; }
      return a + (b - a) * r();
    };
    s.noise = (x) => { x = vec(x); return Array.isArray(x) ? MF.noise3(x[0], x[1] || 0, x[2] || 0, 17) : MF.noise1(x, 17); };
    s.timeToFrames = (tt, fps) => Math.round((tt === undefined ? t : tt) * (fps || comp.fps));
    s.framesToTime = (f, fps) => f / (fps || comp.fps);
    s.posterizeTime = (fps) => { s.time = Math.floor(t * fps) / fps; return s.time; };
    if (L) {
      const lp = layerProxy(comp, L, t);
      s.thisLayer = lp; s.index = lp.index; s.inPoint = L.in; s.outPoint = L.out;
      Object.defineProperty(s, 'transform', { get() { return lp.transform; } });
      for (const nm of ['position', 'scale', 'rotation', 'opacity', 'anchorPoint', 'xRotation', 'yRotation', 'zRotation', 'parent', 'hasParent', 'material', 'cameraOption', 'lightOption', 'text'])
        Object.defineProperty(s, nm, { get() { return lp[nm]; }, configurable: true });
      s.effect = lp.effect; s.content = lp.content; s.mask = lp.mask; s.toWorld = lp.toWorld; s.toComp = lp.toComp; s.fromWorld = lp.fromWorld; s.emitter = lp.emitter;
    } else if (d.node) {
      s.thisNode = s.thisComp.node(d.node.name);
    }
    return s;
  }
  Eval.layerProxy = layerProxy; Eval.compProxy = compProxy; Eval.CycleError = CycleError;
})();
