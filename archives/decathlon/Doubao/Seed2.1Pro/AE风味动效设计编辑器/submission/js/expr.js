/* ============================================================
 * expr.js — 表达式引擎
 * 支持：time / value / 常量与四则 / wiggle / loopOut / linear / ease /
 *       easeIn / easeOut / 跨图层属性引用 thisComp.layer("名")... /
 *       向量分量 [i] 与 .x/.y/.z / valueAtTime(t) / 数学函数
 * 依赖求值带循环检测，错误返回 keyframe 值并给出错误信息。
 * ============================================================ */
(function (global) {
'use strict';

/* ---------------- Tokenizer ---------------- */
const OPS3 = ['===', '!=='];
const OPS2 = ['==', '!=', '<=', '>=', '&&', '||', '**'];
const OPS1 = '+-*/%<>(),[]?.:';
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if (OPS3.includes(three)) { toks.push({ t: 'op', v: three }); i += 3; continue; }
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.eE+\-]/.test(src[j])) {
        if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1])) break;
        j++;
      }
      const num = parseFloat(src.slice(i, j));
      if (isNaN(num)) throw new Error('数字格式错误：' + src.slice(i, j));
      toks.push({ t: 'num', v: num }); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { s += src[j++]; }
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (/[A-Za-z_$一-龥]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_$一-龥]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    throw new Error('无法识别的字符：' + c);
  }
  return toks;
}

/* ---------------- Parser（递归下降） ---------------- */
function Parser(toks) { this.toks = toks; this.i = 0; }
Parser.prototype.peek = function (v) { const t = this.toks[this.i]; return t && (!v || t.v === v); };
Parser.prototype.eat = function (v) {
  const t = this.toks[this.i];
  if (!t || (v && t.v !== v)) throw new Error('语法错误，需要 ' + v + (t ? '，实际 ' + t.v : '（到结尾）'));
  this.i++; return t;
};
Parser.prototype.parse = function () {
  const e = this.parseTernary();
  if (this.i < this.toks.length) throw new Error('多余的标记：' + this.toks[this.i].v);
  return e;
};
Parser.prototype.parseTernary = function () {
  const c = this.parseBinary(0);
  if (this.peek('?')) {
    this.eat('?'); const a = this.parseTernary(); this.eat(':'); const b = this.parseTernary();
    return { k: 'ternary', c, a, b };
  }
  return c;
};
const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '===': 3, '!==': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '**': 7 };
Parser.prototype.parseBinary = function (minPrec) {
  let left = this.parseUnary();
  for (;;) {
    const t = this.toks[this.i];
    if (!t || t.t !== 'op') break;
    const prec = PREC[t.v];
    if (!prec || prec < minPrec) break;
    this.i++;
    const right = this.parseBinary(t.v === '**' ? prec : prec + 1);
    left = { k: 'bin', op: t.v, l: left, r: right };
  }
  return left;
};
Parser.prototype.parseUnary = function () {
  const t = this.toks[this.i];
  if (t && t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
    this.i++;
    return { k: 'un', op: t.v, e: this.parseUnary() };
  }
  return this.parsePostfix();
};
Parser.prototype.parsePostfix = function () {
  let e = this.parsePrimary();
  for (;;) {
    if (this.peek('.')) {
      this.eat('.');
      const name = this.eat(null);
      if (name.t !== 'id') throw new Error('属性名错误');
      e = { k: 'mem', o: e, name: name.v };
    } else if (this.peek('(')) {
      this.eat('(');
      const args = [];
      if (!this.peek(')')) { args.push(this.parseTernary()); while (this.peek(',')) { this.eat(','); args.push(this.parseTernary()); } }
      this.eat(')');
      e = { k: 'call', fn: e, args };
    } else if (this.peek('[')) {
      this.eat('[');
      const idx = this.parseTernary();
      this.eat(']');
      e = { k: 'idx', o: e, idx };
    } else break;
  }
  return e;
};
Parser.prototype.parsePrimary = function () {
  const t = this.toks[this.i];
  if (!t) throw new Error('表达式不完整');
  if (t.t === 'num') { this.i++; return { k: 'num', v: t.v }; }
  if (t.t === 'str') { this.i++; return { k: 'str', v: t.v }; }
  if (t.v === '(') { this.i++; const e = this.parseTernary(); this.eat(')'); return e; }
  if (t.v === '[') {
    this.i++;
    const items = [];
    if (!this.peek(']')) { items.push(this.parseTernary()); while (this.peek(',')) { this.eat(','); items.push(this.parseTernary()); } }
    this.eat(']');
    return { k: 'vec', items };
  }
  if (t.t === 'id') { this.i++; return { k: 'id', name: t.v }; }
  throw new Error('意外的标记：' + t.v);
};

/* ---------------- 求值器 ---------------- */
function Evaluator(engine, ctx, stack) {
  this.eng = engine; this.ctx = ctx; this.stack = stack;
}
Evaluator.prototype.eval = function (node) {
  switch (node.k) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'vec': return node.items.map(n => this.eval(n));
    case 'un': {
      const v = this.eval(node.e);
      if (node.op === '-') return neg(v);
      if (node.op === '+') return v;
      return !truthy(v);
    }
    case 'bin': return this.binop(node);
    case 'ternary': return truthy(this.eval(node.c)) ? this.eval(node.a) : this.eval(node.b);
    case 'id': return this.resolveId(node.name);
    case 'mem': return this.member(this.eval(node.o), node.name);
    case 'idx': {
      const o = this.eval(node.o), i = this.eval(node.idx);
      return this.member(o, String(i | 0));
    }
    case 'call': return this.call(node);
  }
};
function neg(v) { return Array.isArray(v) ? v.map(x => -x) : -v; }
function truthy(v) { return !(v === 0 || v === false || v == null); }
Evaluator.prototype.binop = function (node) {
  const op = node.op;
  if (op === '&&') { const l = this.eval(node.l); return truthy(l) ? this.eval(node.r) : l; }
  if (op === '||') { const l = this.eval(node.l); return truthy(l) ? l : this.eval(node.r); }
  const l = this.eval(node.l), r = this.eval(node.r);
  const arr = Array.isArray(l) || Array.isArray(r);
  if (arr && (op === '+' || op === '-' || op === '*' || op === '/')) {
    const la = Array.isArray(l) ? l : [l, l, l], ra = Array.isArray(r) ? r : [r, r, r];
    const n = Math.max(la.length, ra.length), out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = scalarBin(op, la[i] === undefined ? la[la.length - 1] : la[i], ra[i] === undefined ? ra[ra.length - 1] : ra[i]);
    return out;
  }
  return scalarBin(op, l, r);
};
function scalarBin(op, l, r) {
  switch (op) {
    case '+': return l + r;
    case '-': return l - r;
    case '*': return l * r;
    case '/': return l / r;
    case '%': return l % r;
    case '**': return Math.pow(l, r);
    case '<': return l < r; case '>': return l > r;
    case '<=': return l <= r; case '>=': return l >= r;
    case '==': case '===': return l === r;
    case '!=': case '!==': return l !== r;
  }
}
Evaluator.prototype.member = function (o, name) {
  if (o == null) throw new Error('访问了空值的 .' + name);
  if (Array.isArray(o)) {
    const map = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 };
    if (name in map) return o[map[name]] !== undefined ? o[map[name]] : 0;
    if (/^\d+$/.test(name)) return o[+name] || 0;
    if (name === 'length') return o.length;
  }
  if (typeof o === 'object') {
    if (name in o) return o[name];
    if (typeof o[name] === 'function') return o[name].bind(o);
  }
  if (typeof o === 'number') {
    if (Math[name] && typeof Math[name] === 'function') return Math[name](o);
  }
  throw new Error('没有属性 "' + name + '"');
};

Evaluator.prototype.resolveId = function (name) {
  if (name === 'true') return true;
  if (name === 'false') return false;
  if (name === 'null' || name === 'undefined') return 0;
  if (name === 'time') return this.ctx.time;
  if (name === 'value') return M.deepClone(this.ctx.value);
  if (name === 'thisComp') return this.ctx.compApi;
  if (name === 'thisLayer') return this.ctx.layerApi;
  if (name === 'degreesToRadians') return d => d * Math.PI / 180;
  if (name === 'radiansToDegrees') return r => r * 180 / Math.PI;
  if (name in BUILTINS) return BUILTINS[name];
  if (typeof Math[name] === 'function') return Math[name];
  if (name in Math) return Math[name];
  throw new Error('未知标识符：' + name);
};

Evaluator.prototype.call = function (node) {
  /* thisComp.layer(...) 等成员函数调用 */
  if (node.fn.k === 'mem') {
    const obj = this.eval(node.fn.o);
    const args = node.args.map(a => this.eval(a));
    if (obj && typeof obj.__call === 'function') return obj.__call(node.fn.name, args);
    if (typeof obj === 'function') return obj(...args);
    throw new Error(obj + '.' + node.fn.name + ' 不是函数');
  }
  if (node.fn.k === 'id') {
    const fn = this.resolveId(node.fn.name);
    const args = node.args.map(a => this.eval(a));
    if (typeof fn !== 'function') throw new Error(node.fn.name + ' 不是函数');
    return fn.call(this.ctx, ...args);
  }
  throw new Error('不能调用该表达式');
};

/* ---------------- 内置函数 ---------------- */
const BUILTINS = {
  wiggle: function (freq, amp, octaves, ampMult, t) {
    const ctx = this;
    const tt = t !== undefined ? t : ctx.time;
    const seedKey = ctx.layerId + ':' + ctx.propId;
    const seed = M.hashStr(seedKey + ':' + (ctx.wiggleSeed || 0));
    const rnd = M.rng(seed);
    const ph1 = rnd() * 100, ph2 = rnd() * 100, ph3 = rnd() * 100;
    const n = Math.sin(tt * freq * Math.PI * 2 + ph1) * 0.6 +
              Math.sin(tt * freq * Math.PI * 4.13 + ph2) * 0.3 +
              Math.sin(tt * freq * Math.PI * 8.31 + ph3) * 0.1;
    const base = M.deepClone(ctx.value);
    const apply = v => Array.isArray(v) ? v.map(x => x + n * amp) : v + n * amp;
    return apply(base);
  },
  random: function (a, b) {
    const ctx = this;
    const seed = M.hashStr(ctx.layerId + ctx.propId + Math.floor(ctx.time * 1000));
    const r = M.rng(seed)();
    if (a === undefined) return r;
    if (b === undefined) return r * a;
    return a + r * (b - a);
  },
  loopOut: function (type, numKeyframes) {
    const ctx = this;
    const p = ctx.rawProp;
    if (!p || !p.keys || p.keys.length < 2) return M.deepClone(ctx.value);
    type = type || 'cycle';
    const ks = p.keys;
    const t0 = ks[0].t, t1 = ks[ks.length - 1].t;
    const span = t1 - t0;
    let lt = ctx.time - t0;
    if (lt < 0) return M.sampleKeys(p, ctx.time);
    let phase = lt % span;
    const cyc = Math.floor(lt / span);
    if (type === 'pingpong' && (cyc % 2 === 1)) phase = span - phase;
    return M.sampleKeys(p, t0 + phase);
  },
  loopIn: function (type) { return BUILTINS.loopOut.call(this, type); },
  linear: makeInterp(M.lerp),
  ease: makeInterp(t => t * t * (3 - 2 * t)),
  easeIn: makeInterp(t => t * t * t),
  easeOut: makeInterp(t => 1 - Math.pow(1 - t, 3)),
  clamp: (v, a, b) => M.clamp(v, a, b),
  length: function (a, b) {
    if (b === undefined) return Math.hypot(...[].concat(a));
    const v = [].concat(a).map((x, i) => x - b[i]);
    return Math.hypot(...v);
  },
  normalize: function (v) { const l = Math.hypot(...v) || 1; return v.map(x => x / l); },
  dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lookAt,
  timeToFrames: function (t) { return Math.round((t === undefined ? this.time : t) * this.fps); },
  framesToTime: function (f) { return f / this.fps },
  rgb: (r, g, b) => [r / 255, g / 255, b / 255, 1],
  rgba: (r, g, b, a) => [r / 255, g / 255, b / 255, a],
  hex: function (h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1];
  },
  ifThenElse: (c, a, b) => truthy(c) ? a : b,
  abs: Math.abs, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sqrt: Math.sqrt, pow: Math.pow, exp: Math.exp, log: Math.log,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: Math.atan2, sign: Math.sign, mod: (a, b) => ((a % b) + b) % b,
  noise: function (x, y, z) {
    y = y || 0; z = z || 0;
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }
};
function makeInterp(easeFn) {
  return function (t, a, b, c, d) {
    if (arguments.length === 4) { d = c; c = b; b = a; a = 0; }
    let u = (t - a) / (b - a);
    u = M.clamp(u, 0, 1);
    const e = easeFn(u);
    if (Array.isArray(c)) return c.map((v, i) => M.lerp(v, d[i], e));
    return M.lerp(c, d, e);
  };
}
function lookAt(from, at) { return [at[0] - from[0], at[1] - from[1], at[2] - from[2]]; }

/* ---------------- 引擎 ---------------- */
function ExprEngine() { this.cache = new Map(); }
ExprEngine.prototype.compile = function (src) {
  const ast = new Parser(tokenize(src)).parse();
  return { src, ast };
};
/* 求值一个属性在 ctx 下的表达式最终值。getPropValue(prop,t,layerId,compId) 由外部求值器提供 */
ExprEngine.prototype.evaluate = function (compiled, ctx, evalStack) {
  ctx.engine = this;
  ctx.compApi = this._compApi(ctx, evalStack);
  ctx.layerApi = this._layerApi(ctx, evalStack);
  ctx.fps = ctx.fps || 30;
  const ev = new Evaluator(this, ctx, evalStack || []);
  return ev.eval(compiled.ast);
};
ExprEngine.prototype._compApi = function (ctx, stack) {
  const self = this;
  return {
    name: ctx.compName,
    width: ctx.compWidth, height: ctx.compHeight, duration: ctx.compDuration,
    layer: function (ref) {
      const layer = self._findLayer(ctx, ref);
      return self._layerApi(Object.assign({}, ctx, { refLayerId: layer.id, refLayerName: layer.name }), stack);
    },
    __call(name, args) {
      if (name === 'layer') return this.layer(args[0]);
      if (name === 'marker') return 0;
      throw new Error('comp.' + name + ' 不存在');
    }
  };
};
ExprEngine.prototype._findLayer = function (ctx, ref) {
  if (typeof ref === 'number') {
    const L = ctx.comp.layers[ref - 1];
    if (L) return L;
    throw new Error('找不到第 ' + ref + ' 个图层');
  }
  const byName = ctx.comp.layers.find(L => L.name === ref);
  if (byName) return byName;
  throw new Error('找不到图层 "' + ref + '"');
};
const COMP_NAMES = {
  position: '位置', anchor: '锚点', scale: '缩放', rotation: '旋转', opacity: '不透明度',
  x: 'x', y: 'y', z: 'z'
};
ExprEngine.prototype._layerApi = function (ctx, stack) {
  const self = this;
  const layerId = ctx.refLayerId || ctx.layerId;
  const layer = ctx.comp.layers.find(L => L.id === layerId);
  const api = {
    __call(name, args) {
      if (name === 'valueAtTime') {
        return api;
      }
      throw new Error('layer.' + name + ' 不存在');
    }
  };
  api.transform = this._transformApi(ctx, layer, stack);
  api.name = layer.name;
  api.index = ctx.comp.layers.indexOf(layer) + 1;
  api.width = ctx.comp.width; api.height = ctx.comp.height;
  api.inPoint = layer.inPoint; api.outPoint = layer.outPoint;
  const text = {};
  Object.defineProperty(text, 'sourceText', { get: () => self._readRef(ctx, layer, ['text', 'sourceText'], stack) });
  api.text = text;
  /* valueAtTime：返回一个代理，访问属性时按指定 t 求值 */
  api._atTime = null;
  const origTransform = api.transform;
  function timeProxy(t) {
    const sub = Object.assign({}, ctx, { time: t, refLayerId: layer.id });
    return self._layerApi(sub, stack);
  }
  api.valueAtTime = t => timeProxy(t);
  return api;
};
ExprEngine.prototype._transformApi = function (ctx, layer, stack) {
  const self = this;
  const get = key => {
    const sub = Object.assign({}, ctx, { time: ctx.time, refLayerId: layer.id });
    return self._readRef(sub, layer, ['transform', key], stack);
  };
  const posProxy = {
    get 0() { return this.x; }, get 1() { return this.y; }, get 2() { return this.z; },
    get x() { return get('position')[0]; },
    get y() { return get('position')[1]; },
    get z() { return get('position')[2] || 0; },
    length: 3,
    valueAtTime(tt) {
      const sub = Object.assign({}, ctx, { time: tt, refLayerId: layer.id });
      return self._readRef(sub, layer, ['transform', 'position'], stack);
    }
  };
  const scaleProxy = {
    get 0() { return get('scale')[0]; }, get 1() { return get('scale')[1]; }, get 2() { return (get('scale')[2] ?? get('scale')[0]); },
    get x() { return get('scale')[0]; }, get y() { return get('scale')[1]; }, length: 2,
    valueAtTime(tt) { const sub = Object.assign({}, ctx, { time: tt, refLayerId: layer.id }); return self._readRef(sub, layer, ['transform', 'scale'], stack); }
  };
  const scalarProxy = key => ({
    valueOf() { return get(key); }, toString() { return String(get(key)); },
    valueAtTime(tt) { const sub = Object.assign({}, ctx, { time: tt, refLayerId: layer.id }); return self._readRef(sub, layer, ['transform', key], stack); }
  });
  return {
    position: posProxy, anchor: { get x() { return get('anchor')[0]; }, get y() { return get('anchor')[1]; } },
    scale: scaleProxy,
    rotation: scalarProxy('rotation'), opacity: scalarProxy('opacity')
  };
};
ExprEngine.prototype._readRef = function (ctx, layer, pathArr, stack) {
  let obj = layer;
  for (let i = 0; i < pathArr.length - 1; i++) obj = obj[pathArr[i]];
  const prop = obj[pathArr[pathArr.length - 1]];
  if (!prop || !prop.id) throw new Error('引用的属性不存在');
  const key = ctx.comp.id + '|' + layer.id + '|' + prop.id + '|' + ctx.time.toFixed(5);
  if (stack && stack.includes(key)) throw new Error('表达式循环引用：' + layer.name + '.' + prop.name);
  return ctx.getPropValue(prop, ctx.time, layer.id, ctx.comp.id, stack ? stack.concat(key) : [key]);
};

const Expr = {
  tokenize, Parser, BUILTINS,
  create() { return new ExprEngine(); }
};
global.Expr = Expr;
})(window);
