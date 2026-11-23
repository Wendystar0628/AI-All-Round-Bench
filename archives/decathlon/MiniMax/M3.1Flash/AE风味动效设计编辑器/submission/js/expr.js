/* ============================================================
   expr.js — AE 风格表达式引擎
   词法 → 语法（Pratt）→ 求值（无 eval，错误可捕获）
   支持：time / value / wiggle / loopOut / loopIn / linear / ease
        valueAtTime / thisComp.layer(...).transform.xxx / thisLayer
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const E = AE.expr = {};

  /* ---------------- 词法 ---------------- */
  const KEYWORDS = ['true', 'false', 'null', 'undefined'];
  function tokenize(src) {
    const t = [];
    let i = 0;
    const isIdStart = c => /[A-Za-z_$]/.test(c);
    const isId = c => /[A-Za-z0-9_$]/.test(c);
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i, seenDot = false, seenExp = false;
        while (j < src.length) {
          const ch = src[j];
          if (/[0-9]/.test(ch)) { j++; continue; }
          if (ch === '.' && !seenDot && !seenExp) { seenDot = true; j++; continue; }
          if ((ch === 'e' || ch === 'E') && !seenExp && /[0-9+-]/.test(src[j + 1] || '')) {
            seenExp = true; j += (/[+-]/.test(src[j + 1]) ? 2 : 1); continue;
          }
          break;
        }
        t.push({ k: 'num', v: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1]; j += 2; } else s += src[j++]; }
        t.push({ k: 'str', v: s }); i = j + 1; continue;
      }
      if (isIdStart(c)) {
        let j = i; while (j < src.length && isId(src[j])) j++;
        const word = src.slice(i, j);
        t.push({ k: KEYWORDS.indexOf(word) >= 0 ? 'kw' : 'id', v: word });
        i = j; continue;
      }
      const three = src.substr(i, 3);
      if (three === '===' || three === '!==') { t.push({ k: 'op', v: three }); i += 3; continue; }
      const two = src.substr(i, 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
        t.push({ k: 'op', v: two }); i += 2; continue;
      }
      if ('+-*/%<>!?:.,()[]'.indexOf(c) >= 0) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new Error('无法识别的字符 "' + c + '"');
    }
    t.push({ k: 'eof' });
    return t;
  }

  /* ---------------- 语法 ---------------- */
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isOp = v => { const t = peek(); return t.k === 'op' && t.v === v; };
    const eat = v => { if (isOp(v)) { p++; return true; } return false; };
    const expect = v => { if (!eat(v)) throw new Error('缺少 "' + v + '"'); };

    function parseExpr() { return parseTernary(); }

    function parseTernary() {
      const c = parseOr();
      if (eat('?')) {
        const a = parseExpr(); expect(':'); const b = parseExpr();
        return { t: 'cond', c, a, b };
      }
      return c;
    }
    function parseOr() {
      let l = parseAnd();
      while (isOp('||')) { next(); const r = parseAnd(); l = { t: 'logic', op: '||', l, r }; }
      return l;
    }
    function parseAnd() {
      let l = parseEquality();
      while (isOp('&&')) { next(); const r = parseEquality(); l = { t: 'logic', op: '&&', l, r }; }
      return l;
    }
    function parseEquality() {
      let l = parseRel();
      while (isOp('==') || isOp('!=') || isOp('===') || isOp('!==')) {
        const op = next().v; const r = parseRel(); l = { t: 'bin', op, l, r };
      }
      return l;
    }
    function parseRel() {
      let l = parseAdd();
      while (isOp('<') || isOp('>') || isOp('<=') || isOp('>=')) {
        const op = next().v; const r = parseAdd(); l = { t: 'bin', op, l, r };
      }
      return l;
    }
    function parseAdd() {
      let l = parseMul();
      while (isOp('+') || isOp('-')) { const op = next().v; const r = parseMul(); l = { t: 'bin', op, l, r }; }
      return l;
    }
    function parseMul() {
      let l = parseUnary();
      while (isOp('*') || isOp('/') || isOp('%')) { const op = next().v; const r = parseUnary(); l = { t: 'bin', op, l, r }; }
      return l;
    }
    function parseUnary() {
      if (isOp('-')) { next(); return { t: 'neg', e: parseUnary() }; }
      if (isOp('!')) { next(); return { t: 'not', e: parseUnary() }; }
      return parsePostfix();
    }
    function parsePostfix() {
      let e = parsePrimary();
      for (;;) {
        if (isOp('.')) {
          next();
          const t = next();
          if (t.k !== 'id' && t.k !== 'kw') throw new Error('属性名无效');
          e = { t: 'member', o: e, p: { t: 'lit', v: t.v } };
        } else if (isOp('[')) {
          next();
          const idx = parseExpr(); expect(']');
          e = { t: 'index', o: e, i: idx };
        } else if (isOp('(')) {
          next();
          const args = [];
          if (!isOp(')')) {
            do { args.push(parseExpr()); } while (eat(','));
          }
          expect(')');
          e = { t: 'call', c: e, args };
        } else break;
      }
      return e;
    }
    function parsePrimary() {
      const t = next();
      if (t.k === 'num') return { t: 'lit', v: t.v };
      if (t.k === 'str') return { t: 'lit', v: t.v };
      if (t.k === 'kw') {
        if (t.v === 'true') return { t: 'lit', v: true };
        if (t.v === 'false') return { t: 'lit', v: false };
        if (t.v === 'null') return { t: 'lit', v: null };
        return { t: 'lit', v: undefined };
      }
      if (t.k === 'id') return { t: 'id', v: t.v };
      if (t.k === 'op') {
        if (t.v === '(') { const e = parseExpr(); expect(')'); return e; }
        if (t.v === '[') {
          const arr = [];
          if (!isOp(']')) { do { arr.push(parseExpr()); } while (eat(',')); }
          expect(']');
          return { t: 'arr', items: arr };
        }
      }
      throw new Error('无法解析的表达式片段');
    }
    const ast = parseExpr();
    if (peek().k !== 'eof') throw new Error('表达式结尾有多余内容');
    return ast;
  }

  E.parse = parse;

  /* ---------------- 求值 ---------------- */
  const ANIM_PROPS = {
    position: 'position', anchor: 'anchor', scale: 'scale', rotation: 'rotation',
    opacity: 'opacity', xRotation: 'rotationX', yRotation: 'rotationY',
    rotationX: 'rotationX', rotationY: 'rotationY', rotationZ: 'rotation',
    zPosition: 'position', skew: 'skew', orientation: 'orientation', startOpacity: 'opacity',
    endOpacity: 'opacity', tracking: 'tracking', fontSize: 'fontSize', leading: 'leading'
  };

  function layerProxy(ctx, layer) {
    if (!layer) return undefined;
    const cache = {};
    return new Proxy({}, {
      get(t, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'name') return layer.name;
        if (prop === 'index') return layer.index || 1;
        if (prop === 'id') return layer.id;
        if (prop === 'transform' || prop === 'content' || prop === 'effects' || prop === 'text') {
          return groupProxy(ctx, layer, prop);
        }
        if (ANIM_PROPS[prop]) return ctx.evalLayerProp(layer, ANIM_PROPS[prop], ctx.time);
        return undefined;
      }
    });
  }
  function groupProxy(ctx, layer, group) {
    return new Proxy({}, {
      get(t, prop) {
        if (typeof prop !== 'string') return undefined;
        if (group === 'transform') {
          if (prop === 'scale') return ctx.evalLayerProp(layer, 'scale', ctx.time);
          if (prop === 'position') return ctx.evalLayerProp(layer, 'position', ctx.time);
          if (prop === 'anchor') return ctx.evalLayerProp(layer, 'anchor', ctx.time);
          if (prop === 'rotation') return ctx.evalLayerProp(layer, 'rotation', ctx.time);
          if (prop === 'opacity') return ctx.evalLayerProp(layer, 'opacity', ctx.time);
          if (prop === 'xRotation') return ctx.evalLayerProp(layer, 'rotationX', ctx.time);
          if (prop === 'yRotation') return ctx.evalLayerProp(layer, 'rotationY', ctx.time);
          if (prop === 'rotationZ') return ctx.evalLayerProp(layer, 'rotation', ctx.time);
          return undefined;
        }
        if (group === 'content') {
          const sh = layer.shape;
          if (!sh) return undefined;
          if (prop === 'fill' || prop === 'stroke') return undefined;
          return undefined;
        }
        return undefined;
      }
    });
  }

  function compProxy(ctx, comp) {
    if (!comp) return undefined;
    return new Proxy({}, {
      get(t, prop) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'layer') return name => {
          const L = comp.layers.find(l => l.name === name || l.label === name);
          if (!L) throw new Error('找不到图层 "' + name + '"');
          return layerProxy(ctx, L);
        };
        if (prop === 'duration') return comp.duration;
        if (prop === 'frameRate' || prop === 'fps') return comp.fps;
        if (prop === 'width') return comp.w;
        if (prop === 'height') return comp.h;
        if (prop === 'time') return ctx.time;
        return undefined;
      }
    });
  }

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return v[0] || 0;
    if (v === undefined || v === null) return 0;
    return parseFloat(v) || 0;
  }

  function evalNode(n, ctx) {
    switch (n.t) {
      case 'lit': return n.v;
      case 'id': return resolveIdent(n.v, ctx);
      case 'arr': return n.items.map(i => evalNode(i, ctx));
      case 'neg': return -toNum(evalNode(n.e, ctx));
      case 'not': return !evalNode(n.e, ctx);
      case 'bin': {
        const l = evalNode(n.l, ctx), r = evalNode(n.r, ctx);
        switch (n.op) {
          case '+':
            if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
            if (Array.isArray(l) && Array.isArray(r)) {
              const n = Math.max(l.length, r.length);
              const out = [];
              for (let i = 0; i < n; i++) out.push(toNum(l[i]) + toNum(r[i]));
              return out;
            }
            return toNum(l) + toNum(r);
          case '-':
            if (Array.isArray(l) && Array.isArray(r)) {
              const n = Math.max(l.length, r.length);
              const out = [];
              for (let i = 0; i < n; i++) out.push(toNum(l[i]) - toNum(r[i]));
              return out;
            }
            return toNum(l) - toNum(r);
          case '*':
            if (Array.isArray(l) && typeof r === 'number') return l.map(v => v * r);
            if (typeof l === 'number' && Array.isArray(r)) return r.map(v => v * r);
            return toNum(l) * toNum(r);
          case '/': return toNum(l) / toNum(r);
          case '%': return toNum(l) % toNum(r);
          case '<': return toNum(l) < toNum(r);
          case '>': return toNum(l) > toNum(r);
          case '<=': return toNum(l) <= toNum(r);
          case '>=': return toNum(l) >= toNum(r);
          case '==': case '===': return l === r || toNum(l) === toNum(r);
          case '!=': case '!==': return !(l === r || toNum(l) === toNum(r));
        }
        return 0;
      }
      case 'logic': {
        const l = evalNode(n.l, ctx);
        if (n.op === '&&') return l && evalNode(n.r, ctx);
        return l || evalNode(n.r, ctx);
      }
      case 'cond': return evalNode(n.c, ctx) ? evalNode(n.a, ctx) : evalNode(n.b, ctx);
      case 'index': {
        const o = evalNode(n.o, ctx), i = evalNode(n.i, ctx);
        if (o === undefined || o === null) return undefined;
        if (typeof o === 'string') return o[Math.floor(toNum(i))];
        return o[Math.floor(toNum(i))];
      }
      case 'member': {
        const o = evalNode(n.o, ctx);
        if (o === undefined || o === null) throw new Error('无法访问 "' + n.p.v + '"（对象为空）');
        const v = o[n.p.v];
        if (v === undefined && !(n.p.v in Object(o))) {
          // 允许 thisComp.layer("x").someUnknown -> undefined
        }
        return v;
      }
      case 'call': {
        const callee = n.c;
        if (callee.t === 'member') {
          const obj = evalNode(callee.o, ctx);
          const fn = obj && obj[callee.p.v];
          if (typeof fn !== 'function') throw new Error('"' + callee.p.v + '" 不是可调用函数');
          return fn.apply(obj, n.args.map(a => evalNode(a, ctx)));
        }
        const name = callee.v;
        const args = n.args.map(a => evalNode(a, ctx));
        return callFn(name, args, ctx);
      }
    }
    throw new Error('无法求值的节点');
  }

  function resolveIdent(name, ctx) {
    switch (name) {
      case 'time': return ctx.time;
      case 'value': return ctx.value;
      case 'thisLayer': return layerProxy(ctx, ctx.layer);
      case 'thisComp': return compProxy(ctx, ctx.comp);
      case 'index': return ctx.layer ? (ctx.layer.index || 1) : 1;
      case 'Math': return Math;
      case 'PI': return Math.PI;
      case 'true': return true;
      case 'false': return false;
    }
    if (ctx.vars && name in ctx.vars) return ctx.vars[name];
    throw new Error('未知标识符 "' + name + '"');
  }

  function applyWiggle(val, freq, amp, octaves, type, ctx) {
    const seed = ctx.seed || 1;
    const f = toNum(freq) || 1, a = toNum(amp) || 0;
    const oct = octaves === undefined ? 1 : Math.max(1, Math.round(toNum(octaves)));
    const t = ctx.time;
    function noise1(x, s) {
      let v = 0, amp0 = 1, tot = 0;
      for (let o = 0; o < oct; o++) { v += amp0 * U.valueNoise1(x, s + o * 31); tot += amp0; amp0 *= .5; }
      return v / tot;
    }
    if (Array.isArray(val)) {
      return val.map((c, i) => c + a * noise1(t * f, seed + i * 101));
    }
    return toNum(val) + a * noise1(t * f, seed);
  }

  function cycleMap(t, track, type, duration) {
    if (!track || !track.keys || track.keys.length < 2) return t;
    const ks = track.keys;
    const last = ks[ks.length - 1], prev = ks[ks.length - 2];
    let dur = duration !== undefined ? toNum(duration) : (last.t - prev.t);
    if (!(dur > 0)) dur = 1;
    if (type === 'pingpong') {
      const start = last.t - dur;
      let p = U.mod(t - start, dur * 2);
      if (p > dur) p = dur * 2 - p;
      return start + p;
    }
    return last.t - dur + U.mod(t - last.t, dur);
  }

  function callFn(name, args, ctx) {
    switch (name) {
      case 'wiggle': return applyWiggle(ctx.value, args[0], args[1], args[2], args[3], ctx);
      case 'loopOut': {
        const type = typeof args[0] === 'string' ? args[0] : 'cycle';
        const tm = cycleMap(ctx.time, ctx.track, type, args[1]);
        return ctx.evalSelf(tm);
      }
      case 'loopIn': {
        const type = typeof args[0] === 'string' ? args[0] : 'cycle';
        const ks = ctx.track && ctx.track.keys;
        let tm = ctx.time;
        if (ks && ks.length >= 2) {
          const first = ks[0], second = ks[1];
          let dur = args[1] !== undefined ? toNum(args[1]) : (second.t - first.t);
          if (!(dur > 0)) dur = 1;
          if (type === 'pingpong') {
            let p = U.mod(tm, dur * 2);
            if (p > dur) p = dur * 2 - p;
            tm = p;
          } else tm = U.mod(tm, dur);
        }
        return ctx.evalSelf(tm);
      }
      case 'linear': {
        const t = toNum(args[0]), a = toNum(args[1]), b = toNum(args[2]), c = toNum(args[3]), d = toNum(args[4]);
        if (b === a) return c;
        return U.lerp(c, d, U.clamp((t - a) / (b - a), 0, 1));
      }
      case 'ease': {
        const t = toNum(args[0]), a = toNum(args[1]), b = toNum(args[2]), c = toNum(args[3]), d = toNum(args[4]);
        if (b === a) return c;
        const x = U.clamp((t - a) / (b - a), 0, 1);
        return U.lerp(c, d, U.smoothstep(x));
      }
      case 'valueAtTime': {
        const t = toNum(args[0]);
        return ctx.evalSelf(t);
      }
      case 'posterizeTime': {
        const t = toNum(args[0]);
        return Math.floor(ctx.time / t) * t;
      }
      case 'posterize': {
        const v = toNum(args[0]);
        const n = Math.max(1, Math.round(toNum(args[1])));
        return Math.round(v * n) / n;
      }
      case 'random': {
        const r = U.mulberry32((ctx.seed || 1) + Math.floor(ctx.time * 1000));
        return r();
      }
      case 'clamp': return U.clamp(toNum(args[0]), toNum(args[1]), toNum(args[2]));
      case 'length': {
        const v = args[0];
        if (Array.isArray(v)) return Math.hypot(v[0] || 0, v[1] || 0, v[2] || 0);
        return Math.abs(toNum(v));
      }
      case 'lerp': return U.lerp(toNum(args[0]), toNum(args[1]), toNum(args[2]));
      case 'abs': return Math.abs(toNum(args[0]));
      case 'floor': return Math.floor(toNum(args[0]));
      case 'round': return Math.round(toNum(args[0]));
      case 'sin': return Math.sin(U.rad(toNum(args[0])));
      case 'cos': return Math.cos(U.rad(toNum(args[0])));
      case 'tan': return Math.tan(U.rad(toNum(args[0])));
      case 'degrees': return U.deg(toNum(args[0]));
      case 'radians': return U.rad(toNum(args[0]));
      case 'min': return Math.min(...args.map(toNum));
      case 'max': return Math.max(...args.map(toNum));
      case 'parseFloat': return parseFloat(args[0]);
      case 'parseInt': return parseInt(args[0], 10);
      case 'toFixed': return toNum(args[0]).toFixed(toNum(args[1]));
      case 'Number': return toNum(args[0]);
      case 'String': return String(args[0]);
      case 'if': return args[0] ? args[1] : args[2];
    }
    throw new Error('未知函数 "' + name + '"');
  }

  /**
   * 求值表达式
   * ctx: { time, value, track, layer, comp, seed, evalLayerProp(layer,prop,t),
   *        evalSelf(t) -> 该属性在 t 时刻的值（含表达式，递归保护） }
   */
  E.eval = function (ast, ctx) {
    const c = Object.assign({
      vars: {},
      evalLayerProp: () => undefined,
      evalSelf: t => ctx.value
    }, ctx);
    return evalNode(ast, c);
  };

  /** 源码求值入口，错误抛出由调用方捕获 */
  E.run = function (src, ctx) {
    const ast = parse(src);
    return E.eval(ast, ctx);
  };
})(window);
