/* AE Forge Editor - expression language (AE-like subset) */
(function (global) {
  'use strict';
  const { clamp, smoothNoise } = AEMath;
  const A = global.AEAnim;

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c >= '0' && c <= '9' || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
        let j = i;
        while (j < n && /[0-9.]/.test(src[j])) j++;
        if (src[j] === 'e' || src[j] === 'E') {
          j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
        tokens.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if (c === '"' || c === "'") {
        const q = c; let j = i + 1; let s = '';
        while (j < n && src[j] !== q) {
          if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; }
          s += src[j]; j++;
        }
        tokens.push({ type: 'str', value: s });
        i = j + 1; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
        tokens.push({ type: 'id', value: src.slice(i, j) });
        i = j; continue;
      }
      const two = src.substr(i, 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { tokens.push({ type: two }); i += 2; continue; }
      if ('+-*/%^(),.[]?:<>!'.includes(c)) { tokens.push({ type: c }); i++; continue; }
      throw new Error('无法识别的字符 “' + c + '”');
    }
    return tokens;
  }

  function parse(src) {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = (t) => { if (!peek() || peek().type !== t) throw new Error('语法错误：缺少 “' + t + '”'); return next(); };

    const BP = { '?:': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '^': 8 };

    function parseExpr(minBP) {
      let left = parsePrefix();
      while (true) {
        const tk = peek();
        if (!tk) break;
        let op = tk.type;
        if (op === '?' ) {
          if (minBP > 1) break;
          next();
          const a = parseExpr(1);
          expect(':');
          const b = parseExpr(1);
          left = { type: 'ternary', cond: left, a, b };
          continue;
        }
        if (!(op in BP)) break;
        const bp = BP[op];
        if (bp <= minBP) break;
        next();
        const right = parseExpr(op === '^' ? bp - 1 : bp);
        left = { type: 'bin', op, a: left, b: right };
      }
      return left;
    }
    function parsePrefix() {
      const tk = next();
      if (!tk) throw new Error('表达式不完整');
      if (tk.type === 'num') return { type: 'num', v: tk.value };
      if (tk.type === 'str') return { type: 'str', v: tk.value };
      if (tk.type === '-') return { type: 'neg', a: parseExpr(8) };
      if (tk.type === '!') return { type: 'not', a: parseExpr(7) };
      if (tk.type === '+') return parseExpr(8);
      if (tk.type === '(') { const e = parseExpr(1); expect(')'); return { type: 'paren', a: e }; }
      if (tk.type === '[') {
        const items = [];
        if (peek() && peek().type !== ']') {
          while (true) {
            items.push(parseExpr(1));
            if (peek() && peek().type === ',') { next(); continue; }
            break;
          }
        }
        expect(']');
        return { type: 'array', items };
      }
      if (tk.type === 'id') {
        let node = { type: 'ident', name: tk.value };
        return parsePostfix(node);
      }
      throw new Error('语法错误：意外的 “' + (tk.value || tk.type) + '”');
    }
    function parsePostfix(node) {
      while (true) {
        const tk = peek();
        if (!tk) break;
        if (tk.type === '.') {
          next();
          const id = next();
          if (!id || id.type !== 'id') throw new Error('语法错误：属性名缺失');
          node = { type: 'member', obj: node, name: id.value };
        } else if (tk.type === '(') {
          next();
          const args = [];
          if (peek() && peek().type !== ')') {
            while (true) {
              args.push(parseExpr(1));
              if (peek() && peek().type === ',') { next(); continue; }
              break;
            }
          }
          expect(')');
          node = { type: 'call', callee: node, args };
        } else if (tk.type === '[') {
          next();
          const idx = parseExpr(1);
          expect(']');
          node = { type: 'index', obj: node, idx };
        } else break;
      }
      return node;
    }
    const ast = parseExpr(0);
    if (pos < tokens.length) throw new Error('语法错误：多余内容 “' + tokens[pos].value + '”');
    return ast;
  }

  // ---- runtime proxies ----
  function PropRef(comp, layer, prop, time) {
    this.__t = 'prop'; this.comp = comp; this.layer = layer; this.prop = prop; this.time = time;
  }
  Object.defineProperty(PropRef.prototype, 'value', {
    get() { return A.evalProp(this.prop, this.time, this.makeCtx()); },
  });
  PropRef.prototype.makeCtx = function () {
    return global.AEProject.makeCtx(this.comp, this.layer, this.time);
  };
  PropRef.prototype.valueOf = function () { return this.value; };
  PropRef.prototype.valueAtTime = function (t) {
    return A.evalProp(this.prop, t, this.makeCtx());
  };
  PropRef.prototype.velocity = function () { return A.propSpeed(this.prop, this.time, this.makeCtx()); };

  function LayerProxy(comp, layer) { this.__t = 'layer'; this.comp = comp; this.layer = layer; }
  function TransformProxy(comp, layer) { this.__t = 'transform'; this.comp = comp; this.layer = layer; }
  function CompProxy(comp) { this.__t = 'comp'; this.comp = comp; }
  Object.defineProperty(CompProxy.prototype, 'name', { get() { return this.comp.name; } });
  Object.defineProperty(CompProxy.prototype, 'width', { get() { return this.comp.width; } });
  Object.defineProperty(CompProxy.prototype, 'height', { get() { return this.comp.height; } });
  Object.defineProperty(CompProxy.prototype, 'duration', { get() { return this.comp.duration; } });
  Object.defineProperty(CompProxy.prototype, 'time', { get() { return global.AEProject.currentTime || 0; } });
  CompProxy.prototype.layer = function (arg) {
    if (typeof arg === 'number') return new LayerProxy(this.comp, this.comp.layers[arg - 1]);
    const name = String(arg);
    const l = this.comp.layers.find(l => l.name === name);
    if (!l) throw new Error('合成中不存在名为 “' + name + '” 的图层');
    return new LayerProxy(this.comp, l);
  };
  Object.defineProperty(LayerProxy.prototype, 'name', { get() { return this.layer.name; } });
  Object.defineProperty(LayerProxy.prototype, 'index', { get() { return this.comp.layers.indexOf(this.layer) + 1; } });
  Object.defineProperty(LayerProxy.prototype, 'transform', { get() { return new TransformProxy(this.comp, this.layer); } });
  Object.defineProperty(TransformProxy.prototype, 'position', { get() { return new PropRef(this.comp, this.layer, this.layer.transform.position, global.AEProject.currentTime); } });
  Object.defineProperty(TransformProxy.prototype, 'anchor', { get() { return new PropRef(this.comp, this.layer, this.layer.transform.anchor, global.AEProject.currentTime); } });
  Object.defineProperty(TransformProxy.prototype, 'scale', { get() { return new PropRef(this.comp, this.layer, this.layer.transform.scale, global.AEProject.currentTime); } });
  Object.defineProperty(TransformProxy.prototype, 'rotation', { get() { return new PropRef(this.comp, this.layer, this.layer.transform.rotation, global.AEProject.currentTime); } });
  Object.defineProperty(TransformProxy.prototype, 'opacity', { get() { return new PropRef(this.comp, this.layer, this.layer.transform.opacity, global.AEProject.currentTime); } });

  function evalNode(node, env) {
    switch (node.type) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'array': return node.items.map(x => evalNode(x, env));
      case 'paren': return evalNode(node.a, env);
      case 'neg': return -toNum(evalNode(node.a, env));
      case 'not': return !truthy(evalNode(node.a, env));
      case 'ident': {
        if (node.name === 'time') return env.time;
        if (node.name === 'value') return env.value;
        if (node.name === 'index') return env.layerIndex;
        if (node.name === 'name') return env.layerName;
        if (node.name === 'thisComp' || node.name === 'comp') return new CompProxy(env.comp);
        if (node.name === 'thisLayer' || node.name === 'layer') return new LayerProxy(env.comp, env.layer);
        if (node.name === 'width') return env.comp.width;
        if (node.name === 'height') return env.comp.height;
        if (node.name === 'duration') return env.comp.duration;
        if (node.name === 'frame') return Math.floor(env.time * env.comp.fps);
        if (node.name === 'posterizeTime') return env.funcs.posterizeTime;
        if (node.name === 'linear') return env.funcs.linear;
        if (node.name === 'ease') return env.funcs.ease;
        if (node.name === 'wiggle') return env.funcs.wiggle;
        if (node.name === 'loopOut') return env.funcs.loopOut;
        if (node.name === 'loopIn') return env.funcs.loopIn;
        if (node.name === 'random') return env.funcs.random;
        if (node.name === 'clamp') return env.funcs.clamp;
        if (node.name === 'length') return env.funcs.length;
        if (node.name === 'degreesToRadians') return env.funcs.deg2rad;
        if (node.name === 'radiansToDegrees') return env.funcs.rad2deg;
        if (node.name === 'Math') return Math;
        throw new Error('未知标识符 “' + node.name + '”');
      }
      case 'member': {
        const obj = evalNode(node.obj, env);
        return getMember(obj, node.name, env);
      }
      case 'index': {
        const obj = evalNode(node.obj, env);
        const idx = Math.round(toNum(evalNode(node.idx, env)));
        if (obj && obj.__t === 'prop') { const v = obj.value; return (Array.isArray(v) ? v[idx] : (idx === 0 ? v : 0)) || 0; }
        if (Array.isArray(obj)) return obj[idx] || 0;
        return 0;
      }
      case 'call': {
        const callee = node.callee;
        if (callee.type === 'member') {
          const obj = evalNode(callee.obj, env);
          const name = callee.name;
          if (obj && obj.__t === 'prop') {
            if (name === 'valueAtTime') return obj.valueAtTime(toNum(evalNode(node.args[0], env)));
            if (name === 'velocity') return obj.velocity();
          }
          if (obj && obj.__t === 'comp') {
            if (name === 'layer') return obj.layer(evalNode(node.args[0], env));
          }
          if (obj === Math) {
            const fn = Math[name];
            if (typeof fn === 'function') return fn(...node.args.map(a => toNum(evalNode(a, env))));
          }
          if (name === 'valueAtTime' && obj && obj.__t === 'transform') {
            return 0;
          }
          throw new Error('无法调用方法 “' + name + '”');
        }
        const fn = evalNode(callee, env);
        if (typeof fn !== 'function') throw new Error('该表达式不可调用');
        const args = node.args.map(a => evalNode(a, env));
        return fn(...args);
      }
      case 'bin': {
        const op = node.op;
        if (op === '&&') return truthy(evalNode(node.a, env)) ? truthy(evalNode(node.b, env)) : false;
        if (op === '||') return truthy(evalNode(node.a, env)) ? true : truthy(evalNode(node.b, env));
        const a = evalNode(node.a, env), b = evalNode(node.b, env);
        switch (op) {
          case '+': return addv(a, b);
          case '-': return subv(a, b);
          case '*': return mulv(a, b);
          case '/': return divv(a, b);
          case '%': return toNum(a) % toNum(b);
          case '^': return Math.pow(toNum(a), toNum(b));
          case '==': return eqv(a, b);
          case '!=': return !eqv(a, b);
          case '<': return toNum(a) < toNum(b);
          case '>': return toNum(a) > toNum(b);
          case '<=': return toNum(a) <= toNum(b);
          case '>=': return toNum(a) >= toNum(b);
        }
        return 0;
      }
      case 'ternary': return truthy(evalNode(node.cond, env)) ? evalNode(node.a, env) : evalNode(node.b, env);
    }
    return 0;
  }

  function getMember(obj, name, env) {
    if (obj == null) throw new Error('无法读取 “' + name + '” 的属性');
    if (obj.__t === 'layer') {
      if (name === 'transform') return new TransformProxy(obj.comp, obj.layer);
      if (name === 'name') return obj.layer.name;
      if (name === 'index') return obj.comp.layers.indexOf(obj.layer) + 1;
      if (name === 'opacity') return new PropRef(obj.comp, obj.layer, obj.layer.transform.opacity, env.time);
      if (name === 'position') return new PropRef(obj.comp, obj.layer, obj.layer.transform.position, env.time);
      throw new Error('图层没有属性 “' + name + '”');
    }
    if (obj.__t === 'transform') {
      const t = obj.layer.transform;
      const p = t[name];
      if (p) return new PropRef(obj.comp, obj.layer, p, env.time);
      if (name === 'xPosition') return new PropRef(obj.comp, obj.layer, t.position, env.time, 0);
      if (name === 'yPosition') return new PropRef(obj.comp, obj.layer, t.position, env.time, 1);
      if (name === 'zPosition') return new PropRef(obj.comp, obj.layer, t.position, env.time, 2);
      throw new Error('变换没有属性 “' + name + '”');
    }
    if (obj.__t === 'prop') {
      if (name === 'value') return obj.value;
      if (name === 'valueAtTime') return obj.valueAtTime.bind(obj);
      if (name === 'velocity') return obj.velocity.bind(obj);
      if (name === 'index') return 1;
      throw new Error('属性没有成员 “' + name + '”');
    }
    if (obj.__t === 'comp') {
      if (name === 'name') return obj.name;
      if (name === 'width') return obj.width;
      if (name === 'height') return obj.height;
      if (name === 'duration') return obj.duration;
      if (name === 'time') return obj.time;
      if (name === 'layer') return obj.layer.bind(obj);
      throw new Error('合成没有属性 “' + name + '”');
    }
    if (obj === Math) return Math[name];
    if (Array.isArray(obj)) { if (name === 'length') return obj.length; return undefined; }
    return undefined;
  }

  function toNum(v) {
    if (Array.isArray(v)) return v[0] || 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return 0;
  }
  function truthy(v) { if (Array.isArray(v)) return toNum(v) !== 0; return !!v; }
  function addv(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
      const n = Math.max(A.length, B.length), out = [];
      for (let i = 0; i < n; i++) out.push((A[i] || 0) + (B[i] || 0));
      return out;
    }
    if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
    return toNum(a) + toNum(b);
  }
  function subv(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
      const n = Math.max(A.length, B.length), out = [];
      for (let i = 0; i < n; i++) out.push((A[i] || 0) - (B[i] || 0));
      return out;
    }
    return toNum(a) - toNum(b);
  }
  function mulv(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
      const n = Math.max(A.length, B.length), out = [];
      for (let i = 0; i < n; i++) out.push((A[i] || 0) * (B[i] || 0));
      return out;
    }
    return toNum(a) * toNum(b);
  }
  function divv(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
      const n = Math.max(A.length, B.length), out = [];
      for (let i = 0; i < n; i++) out.push((A[i] || 0) / (B[i] || 1));
      return out;
    }
    return toNum(a) / (toNum(b) || 1e-9);
  }
  function eqv(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
      if (A.length !== B.length) return false;
      for (let i = 0; i < A.length; i++) if (Math.abs(toNum(A[i]) - toNum(B[i])) > 1e-6) return false;
      return true;
    }
    return Math.abs(toNum(a) - toNum(b)) < 1e-6;
  }

  function makeEnv(comp, layer, time, value, stack) {
    let seed = 1.618;
    const uidv = layer && layer.uid;
    if (typeof uidv === 'string') {
      let h = 0;
      for (let i = 0; i < uidv.length; i++) h = (h * 31 + uidv.charCodeAt(i)) | 0;
      seed = 1.618 + (Math.abs(h) % 997) / 100;
    } else if (typeof uidv === 'number') {
      seed = 1.618 + (uidv % 97) / 10;
    }
    const funcs = {
      posterizeTime: (fps) => {
        const q = 1 / Math.max(1, toNum(fps));
        return Math.floor(time / q + 1e-6) * q;
      },
      linear: (t, a, b, c, d) => {
        t = toNum(t); a = toNum(a); b = toNum(b); c = toNum(c); d = toNum(d);
        const u = clamp((t - c) / ((d - c) || 1e-9), 0, 1);
        return a + (b - a) * u;
      },
      ease: (t, a, b, c, d) => {
        t = toNum(t); a = toNum(a); b = toNum(b); c = toNum(c); d = toNum(d);
        const u = clamp((t - c) / ((d - c) || 1e-9), 0, 1);
        const e = u * u * (3 - 2 * u);
        return a + (b - a) * e;
      },
      wiggle: (freq, amp, octaves, sdim) => {
        const f = toNum(freq) || 1, a = toNum(amp) || 0;
        const base = Array.isArray(value) ? value : [value];
        const out = base.map((v, i) => {
          const sd = seed + i * 7.13 + toNum(sdim) * 0.0;
          let n = 0, ampSum = 0, ff = f;
          const oct = Math.max(1, Math.round(toNum(octaves) || 1));
          for (let o = 0; o < oct; o++) {
            n += smoothNoise(time * ff + o * 11.3, sd + o) / (o + 1);
            ampSum += 1 / (o + 1);
            ff *= 2;
          }
          n /= ampSum;
          const av = Array.isArray(amp) ? (amp[i] || 0) : a;
          return v + n * av;
        });
        return out.length === 1 ? out[0] : out;
      },
      loopOut: (type) => loopGeneric('out', toNum(type) === 2 || String(type) === 'pingpong'),
      loopIn: (type) => loopGeneric('in', String(type) === 'pingpong'),
      random: (s) => {
        const r = Math.abs(Math.sin((toNum(s) + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
        return r;
      },
      clamp: (v, a, b) => clamp(toNum(v), toNum(a), toNum(b)),
      length: (a, b) => {
        const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
        let s = 0;
        for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); s += d * d; }
        return Math.sqrt(s);
      },
      deg2rad: (d) => toNum(d) * Math.PI / 180,
      rad2deg: (r) => toNum(r) * 180 / Math.PI,
    };
    function loopGeneric(dir, pingpong) {
      const prop = envProp;
      if (!prop || !prop.keys || prop.keys.length < 2) return value;
      const first = prop.keys[0].t, last = prop.keys[prop.keys.length - 1].t;
      const dur = last - first;
      if (dur <= 1e-6) return value;
      if (dir === 'out' && time < first) return value;
      if (dir === 'in' && time > last) return value;
      let u = time - first;
      if (pingpong) {
        const p = dur * 2;
        u = ((u % p) + p) % p;
        if (u > dur) u = p - u;
        return A.keysAt(prop, first + u);
      }
      u = ((u % dur) + dur) % dur;
      return A.keysAt(prop, first + u);
    }
    return {
      comp, layer, time, value, stack,
      layerIndex: comp.layers.indexOf(layer) + 1,
      layerName: layer.name,
      funcs,
      envProp: envPropOf(comp, layer),
    };
  }
  let currentEnvProp = null;
  function envPropOf() { return currentEnvProp; }

  function evaluate(src, time, baseValue, ctx) {
    try {
      const ast = cacheParse(src);
      const env = makeEnv(ctx.comp, ctx.layer, time, baseValue, ctx.shared);
      currentEnvProp = ctx.prop;
      try {
        const v = evalNode(ast, env);
        return { ok: true, value: normalize(v, baseValue) };
      } finally { currentEnvProp = null; }
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  function normalize(v, base) {
    if (Array.isArray(base)) {
      if (Array.isArray(v)) return base.map((b, i) => (typeof v[i] === 'number' ? v[i] : (v[i] !== undefined ? toNum(v[i]) : b)));
      if (typeof v === 'number') return base.map(() => v);
      return base;
    }
    if (Array.isArray(v)) return v[0] || 0;
    if (typeof v === 'number') return v;
    return base;
  }

  const parseCache = new Map();
  function cacheParse(src) {
    if (parseCache.has(src)) return parseCache.get(src);
    const ast = parse(src);
    parseCache.set(src, ast);
    return ast;
  }

  global.AEExpr = { evaluate, parse, cacheParse, tokenize };
})(window);