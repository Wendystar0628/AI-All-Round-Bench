/* expr.js — 表达式引擎：转译器（向量运算重载）+ 运行时（thisComp/thisLayer/wiggle/loopOut/…） */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, Model = AE.Model;
  const Expr = AE.Expr = {};

  class ExprError extends Error { }
  class CycleError extends Error { constructor(msg, head, chain) { super(msg); this.head = head; this.chain = chain; } }
  Expr.ExprError = ExprError; Expr.CycleError = CycleError;

  // ---------- 词法 ----------
  function tokenize(src) {
    const toks = []; let i = 0; const n = src.length;
    const isId0 = c => /[A-Za-z_$一-鿿]/.test(c), isId = c => /[A-Za-z0-9_$一-鿿]/.test(c);
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { let j = i; let nl = false; while (j < n && /\s/.test(src[j])) { if (src[j] === '\n') nl = true; j++; } toks.push({ t: 'ws', v: src.slice(i, j), nl }); i = j; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { let j = i; while (j < n && /[0-9.]/.test(src[j])) j++; if (/[eE]/.test(src[j] || '') && /[0-9+-]/.test(src[j + 1] || '')) { j += 2; while (j < n && /[0-9]/.test(src[j])) j++; } toks.push({ t: 'num', v: src.slice(i, j) }); i = j; continue; }
      if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } toks.push({ t: 'str', v: src.slice(i, j + 1) }); i = j + 1; continue; }
      if (isId0(c)) { let j = i; while (j < n && isId(src[j])) j++; toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue; }
      const three = src.substr(i, 3), two = src.substr(i, 2);
      if (['===', '!==', '>>>', '**='].includes(three)) { toks.push({ t: 'op', v: three }); i += 3; continue; }
      if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '++', '--', '=>', '<<', '>>', '**'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      toks.push({ t: 'op', v: c }); i++;
    }
    return toks;
  }

  // ---------- 转译 ----------
  const KEYWORDS = new Set(['var', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'function', 'true', 'false', 'null', 'undefined', 'typeof', 'new', 'break', 'continue', 'do', 'in', 'of', 'try', 'catch', 'throw', 'this']);
  Expr.transpile = function (src) {
    const all = tokenize(src); const toks = all.filter(t => t.t !== 'ws'); let p = 0;
    const peek = (o = 0) => toks[p + o]; const isOp = (v, o = 0) => { const t = toks[p + o]; return t && t.t === 'op' && t.v === v; }; const isId = (v, o = 0) => { const t = toks[p + o]; return t && t.t === 'id' && t.v === v; };
    const fail = m => { throw new ExprError('语法错误：' + m); };
    const expect = v => { if (!isOp(v)) fail(`缺少 "${v}"（位于 ${peek() ? peek().v : '结尾'} 附近）`); p++; };
    const BIN = { '||': 1, '&&': 2, '==': 5, '!=': 5, '===': 5, '!==': 5, '<': 6, '>': 6, '<=': 6, '>=': 6, '+': 8, '-': 8, '*': 9, '/': 9, '%': 9 };
    const FN = { '+': '__add', '-': '__sub', '*': '__mul', '/': '__div' };
    function primary() {
      const t = peek(); if (!t) fail('表达式不完整');
      if (t.t === 'num') { p++; return t.v; }
      if (t.t === 'str') { p++; return t.v; }
      if (t.t === 'id') {
        if (t.v === 'function') { return funcExpr(); }
        if (t.v === 'new') { p++; const e = postfix(primaryNoPost()); return 'new ' + e; }
        p++; return t.v;
      }
      if (isOp('(')) { p++; const e = expression(); expect(')'); if (isOp('=>')) fail('不支持箭头函数'); return '(' + e + ')'; }
      if (isOp('[')) { p++; const items = []; while (!isOp(']')) { items.push(assign()); if (isOp(',')) p++; else break; } expect(']'); return '[' + items.join(',') + ']'; }
      if (isOp('{')) { p++; const items = []; while (!isOp('}')) { const k = peek(); p++; let key = k.v; expect(':'); items.push(key + ':' + assign()); if (isOp(',')) p++; else break; } expect('}'); return '({' + items.join(',') + '})'; }
      fail('无法识别 "' + t.v + '"');
    }
    function primaryNoPost() { const t = peek(); p++; return t.v; }
    function funcExpr() {
      p++; let name = ''; if (peek() && peek().t === 'id') { name = peek().v; p++; }
      expect('('); const ps = []; while (!isOp(')')) { ps.push(peek().v); p++; if (isOp(',')) p++; } expect(')'); const body = block(); return `function ${name}(${ps.join(',')})${body}`;
    }
    function postfix(base) {
      for (; ;) {
        if (isOp('.')) { p++; const t = peek(); p++; base += '.' + t.v; }
        else if (isOp('[')) { p++; const e = expression(); expect(']'); base += '[' + e + ']'; }
        else if (isOp('(')) { p++; const args = []; while (!isOp(')')) { args.push(assign()); if (isOp(',')) p++; else break; } expect(')'); base += '(' + args.join(',') + ')'; }
        else if (isOp('++') || isOp('--')) { base += peek().v; p++; }
        else return base;
      }
    }
    function unary() {
      if (isOp('-')) { p++; return '__neg(' + unary() + ')'; }
      if (isOp('+')) { p++; return '__pos(' + unary() + ')'; }
      if (isOp('!')) { p++; return '!' + unary(); }
      if (isOp('++') || isOp('--')) { const o = peek().v; p++; return o + unary(); }
      if (isId('typeof')) { p++; return 'typeof ' + unary(); }
      return postfix(primary());
    }
    function binary(minPrec) {
      let left = unary();
      for (; ;) {
        const t = peek(); if (!t || t.t !== 'op' || !(t.v in BIN)) break; const prec = BIN[t.v]; if (prec < minPrec) break; p++;
        const right = binary(prec + 1);
        left = FN[t.v] ? `${FN[t.v]}(${left},${right})` : `(${left} ${t.v} ${right})`;
      }
      return left;
    }
    function ternary() { const c = binary(1); if (isOp('?')) { p++; const a = assign(); expect(':'); const b = assign(); return `(${c} ? ${a} : ${b})`; } return c; }
    function assign() {
      const left = ternary();
      const t = peek();
      if (t && t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(t.v)) {
        p++; const right = assign();
        if (t.v === '=') return `${left} = ${right}`;
        const f = FN[t.v[0]]; return f ? `${left} = ${f}(${left},${right})` : `${left} = (${left} ${t.v[0]} ${right})`;
      }
      return left;
    }
    function expression() { let e = assign(); while (isOp(',')) { p++; e += ',' + assign(); } return e; }
    function block() { expect('{'); const out = []; while (!isOp('}')) { if (!peek()) fail('缺少 "}"'); out.push(statement()); } expect('}'); return '{' + out.join('\n') + '}'; }
    function statement() {
      const t = peek(); if (!t) return '';
      if (isOp(';')) { p++; return ';'; }
      if (isOp('{')) return block();
      if (t.t === 'id') {
        if (t.v === 'var' || t.v === 'let' || t.v === 'const') { p++; const ds = []; for (; ;) { const nm = peek().v; p++; let d = nm; if (isOp('=')) { p++; d += ' = ' + assign(); } ds.push(d); if (isOp(',')) p++; else break; } if (isOp(';')) p++; return `var ${ds.join(',')};`; }
        if (t.v === 'if') { p++; expect('('); const c = expression(); expect(')'); const a = statement(); let s = `if (${c}) ${a}`; if (isId('else')) { p++; s += ' else ' + statement(); } return s; }
        if (t.v === 'for') { p++; expect('('); let init = ''; if (!isOp(';')) { if (isId('var') || isId('let') || isId('const')) { p++; const ds = []; for (; ;) { const nm = peek().v; p++; let d = nm; if (isOp('=')) { p++; d += ' = ' + assign(); } ds.push(d); if (isOp(',')) p++; else break; } init = 'var ' + ds.join(','); } else init = expression(); } expect(';'); const cond = isOp(';') ? '' : expression(); expect(';'); const step = isOp(')') ? '' : expression(); expect(')'); return `for (${init};${cond};${step}) ${statement()}`; }
        if (t.v === 'while') { p++; expect('('); const c = expression(); expect(')'); return `while (${c}) ${statement()}`; }
        if (t.v === 'return') { p++; let e = ''; if (!isOp(';') && !isOp('}') && peek()) e = expression(); if (isOp(';')) p++; return `return ${e};`; }
        if (t.v === 'break' || t.v === 'continue') { p++; if (isOp(';')) p++; return t.v + ';'; }
        if (t.v === 'function' && peek(1) && peek(1).t === 'id') { const f = funcExpr(); return f; }
        if (t.v === 'try') { p++; const b = block(); let s = 'try ' + b; if (isId('catch')) { p++; let nm = 'e'; if (isOp('(')) { p++; nm = peek().v; p++; expect(')'); } s += ` catch (${nm}) ` + block(); } return s; }
      }
      const e = expression(); if (isOp(';')) p++; return e + ';';
    }
    const out = []; while (p < toks.length) out.push(statement());
    return out.join('\n');
  };

  // ---------- 向量运算 ----------
  const isPR = x => x && x.__ref === true;
  const unwrap = x => isPR(x) ? x.value : x;
  const vop = (a, b, f) => {
    a = unwrap(a); b = unwrap(b);
    if (Array.isArray(a) && Array.isArray(b)) { const n = Math.max(a.length, b.length); const o = new Array(n); for (let i = 0; i < n; i++) o[i] = f(a[i] === undefined ? 0 : a[i], b[i] === undefined ? 0 : b[i]); return o; }
    if (Array.isArray(a)) return a.map(x => f(x, b)); if (Array.isArray(b)) return b.map(x => f(a, x));
    return f(a, b);
  };
  const rt = {
    __add: (a, b) => { a = unwrap(a); b = unwrap(b); if (typeof a === 'string' || typeof b === 'string') return a + b; return vop(a, b, (x, y) => x + y); },
    __sub: (a, b) => vop(a, b, (x, y) => x - y),
    __mul: (a, b) => vop(a, b, (x, y) => x * y),
    __div: (a, b) => vop(a, b, (x, y) => x / y),
    __neg: a => { a = unwrap(a); return Array.isArray(a) ? a.map(x => -x) : -a; },
    __pos: a => unwrap(a),
  };

  // ---------- 运行时辅助 ----------
  const num = x => { x = unwrap(x); return typeof x === 'number' ? x : (x && x.valueOf ? +x.valueOf() : +x); };
  const mapv = (f, ...args) => { args = args.map(unwrap); const arr = args.find(Array.isArray); if (!arr) return f(...args); return arr.map((_, i) => f(...args.map(a => Array.isArray(a) ? a[i] : a))); };
  const sstep = t => t * t * (3 - 2 * t);
  function lin(t, a, b, c, d, kind) {
    t = num(t);
    if (d === undefined) { // linear(t, v1, v2)
      const v1 = a, v2 = b; let u = U.clamp(t, 0, 1); u = kind === 'ease' ? sstep(u) : kind === 'in' ? u * u : kind === 'out' ? 1 - (1 - u) * (1 - u) : u; return mapv((x, y) => x + (y - x) * u, v1, v2);
    }
    const t0 = num(a), t1 = num(b); let u = t1 === t0 ? 0 : U.clamp((t - t0) / (t1 - t0), 0, 1);
    u = kind === 'ease' ? sstep(u) : kind === 'in' ? u * u : kind === 'out' ? 1 - (1 - u) * (1 - u) : u;
    return mapv((x, y) => x + (y - x) * u, c, d);
  }

  // ---------- 属性引用 ----------
  const TRANSFORM_ALIAS = { anchorPoint: 'transform.anchor', position: 'transform.position', scale: 'transform.scale', rotation: 'transform.rotation', zRotation: 'transform.rotation', xRotation: 'transform.rotX', yRotation: 'transform.rotY', opacity: 'transform.opacity', 锚点: 'transform.anchor', 位置: 'transform.position', 缩放: 'transform.scale', 旋转: 'transform.rotation', 不透明度: 'transform.opacity' };
  function makeCtx(ev, comp, owner, key, base, t) { return { ev, comp, owner, key, base, t }; }

  function propRef(ctx, comp, owner, key) {
    const info = Model.propInfo(owner, key);
    const same = () => owner === ctx.owner && key === ctx.key;
    const ref = {
      __ref: true, name: info.label || key, propertyIndex: 1,
      get value() { return same() && ref._self !== false ? ctx.ev.value(comp, owner, key, ctx.t, true) : ctx.ev.value(comp, owner, key, ctx.t); },
      valueAtTime(t) { t = num(t); if (same()) return Model.evalKeys(owner.props[key], t, info); return ctx.ev.value(comp, owner, key, t); },
      get velocity() { const dt = 1 / 120; const a = ctx.ev.value(comp, owner, key, ctx.t - dt), b = ctx.ev.value(comp, owner, key, ctx.t + dt); return mapv((x, y) => (y - x) / (2 * dt), a, b); },
      get numKeys() { const p = owner.props[key]; return p && p.k ? p.k.length : 0; },
      key(i) { const p = owner.props[key]; const k = p && p.k && p.k[Math.round(num(i)) - 1]; if (!k) throw new ExprError('关键帧索引超出范围'); return { time: k.t, value: k.v, index: Math.round(num(i)) }; },
      nearestKey(t) { const p = owner.props[key]; if (!p || !p.k) throw new ExprError('属性没有关键帧'); t = num(t); let bi = 0; p.k.forEach((k, i) => { if (Math.abs(k.t - t) < Math.abs(p.k[bi].t - t)) bi = i; }); return { time: p.k[bi].t, value: p.k[bi].v, index: bi + 1 }; },
      wiggle: (...a) => wiggleFn(ctx, owner, key, ref.value, ...a),
      loopOut: (...a) => loopFn(ctx, owner, key, 'out', ...a), loopIn: (...a) => loopFn(ctx, owner, key, 'in', ...a),
      valueOf() { const v = ref.value; return v; },
      toString() { const v = ref.value; return Array.isArray(v) ? '[' + v.join(',') + ']' : String(v); },
      get length() { const v = ref.value; return Array.isArray(v) ? v.length : undefined; },
    };
    return new Proxy(ref, {
      get(tg, k) {
        if (typeof k === 'string' && /^\d+$/.test(k)) { const v = tg.value; return Array.isArray(v) ? v[+k] : undefined; }
        if (k === Symbol.toPrimitive) return (hint) => { const v = tg.value; return Array.isArray(v) ? tg.toString() : v; };
        if (k === Symbol.iterator) return function* () { const v = tg.value; if (Array.isArray(v)) yield* v; };
        return tg[k];
      },
    });
  }

  function groupProxy(ctx, comp, L, map) {
    return new Proxy({}, { get(_, k) { if (typeof k !== 'string') return undefined; const key = map[k]; if (!key) throw new ExprError(`图层「${L.name}」没有属性 ${k}`); if (!L.props[key]) throw new ExprError(`图层「${L.name}」没有属性 ${k}`); return propRef(ctx, comp, L, key); } });
  }
  function effectProxy(ctx, comp, L) {
    return (nameOrIdx) => {
      const fx = typeof nameOrIdx === 'number' ? L.effects[nameOrIdx - 1] : (L.effects.find(e => e.name === nameOrIdx) || L.effects.find(e => e.type === nameOrIdx));
      if (!fx) throw new ExprError(`图层「${L.name}」没有效果「${nameOrIdx}」`);
      const defs = Model.EFFECTS[fx.type].params; const names = Object.keys(defs);
      return (pn) => { let nm = typeof pn === 'number' ? names[pn - 1] : (names.find(n => n === pn) || names.find(n => defs[n].label === pn)); if (!nm) throw new ExprError(`效果「${fx.name}」没有参数「${pn}」`); return propRef(ctx, comp, L, `fx.${fx.id}.${nm}`); };
    };
  }
  const MAT_ALIAS = { baseColor: 'mat.base', metallic: 'mat.metal', roughness: 'mat.rough', emission: 'mat.emit', emissionIntensity: 'mat.emitI', opacity: 'mat.opacity', 基础色: 'mat.base', 金属度: 'mat.metal', 粗糙度: 'mat.rough', 发光色: 'mat.emit', 发光强度: 'mat.emitI' };
  const LIGHT_ALIAS = { intensity: 'light.intensity', color: 'light.color', pointOfInterest: 'light.target', 强度: 'light.intensity', 颜色: 'light.color' };
  const CAM_ALIAS = { pointOfInterest: 'cam.target', focusDistance: 'cam.focus', aperture: 'cam.aperture', fov: 'cam.fov', 视角: 'cam.fov', 光圈: 'cam.aperture', 对焦距离: 'cam.focus' };

  function layerProxy(ctx, comp, L) {
    const idx = comp.layers.indexOf(L) + 1;
    const obj = {
      name: L.name, index: idx, inPoint: L.in, outPoint: L.out, startTime: L.start, enabled: L.visible, hasParent: !!L.parent, width: comp.w, height: comp.h,
      active: L.visible && ctx.t >= L.in && ctx.t < L.out,
      transform: groupProxy(ctx, comp, L, TRANSFORM_ALIAS), effect: effectProxy(ctx, comp, L),
      material: groupProxy(ctx, comp, L, MAT_ALIAS), lightOption: groupProxy(ctx, comp, L, LIGHT_ALIAS), cameraOption: groupProxy(ctx, comp, L, CAM_ALIAS),
      prop: key => { if (!L.props[key]) throw new ExprError(`图层「${L.name}」没有属性 ${key}`); return propRef(ctx, comp, L, key); },
      toWorld: (p) => { p = unwrap(p); const m = ctx.ev.worldMatrix(comp, L, ctx.t); return U.M.pt(m, [p[0], p[1], p[2] || 0]).slice(0, p.length > 2 ? 3 : 2); },
      fromWorld: (p) => { p = unwrap(p); const m = U.M.invert(ctx.ev.worldMatrix(comp, L, ctx.t)); return U.M.pt(m, [p[0], p[1], p[2] || 0]).slice(0, p.length > 2 ? 3 : 2); },
      get parent() { if (!L.parent) return null; const P = Model.layer(comp, L.parent); return P ? layerProxy(ctx, comp, P) : null; },
    };
    return new Proxy(obj, { get(tg, k) { if (k in tg) return tg[k]; if (typeof k === 'string' && TRANSFORM_ALIAS[k]) return tg.transform[k]; return undefined; } });
  }
  function compProxy(ctx, comp) {
    return {
      name: comp.name, width: comp.w, height: comp.h, duration: comp.dur, frameDuration: 1 / comp.fps, numLayers: comp.layers.length, frameRate: comp.fps,
      layer: (x) => {
        let L = typeof x === 'number' ? comp.layers[x - 1] : comp.layers.find(l => l.name === x);
        if (!L && typeof x === 'string' && /^\d+$/.test(x)) L = comp.layers[+x - 1];
        if (!L) throw new ExprError(`找不到图层「${x}」（合成「${comp.name}」中）`);
        return layerProxy(ctx, comp, L);
      },
    };
  }

  // ---------- wiggle / loop ----------
  function wiggleFn(ctx, owner, key, val, freq, amp, octaves = 1, ampMult = 0.5, tm) {
    freq = num(freq); amp = num(amp); octaves = Math.max(1, Math.round(num(octaves))); ampMult = num(ampMult); const t = tm === undefined ? ctx.t : num(tm);
    const seed = U.hashStr(owner.id + '|' + key) & 0xffff;
    const base = unwrap(val);
    const one = (c) => { let s = 0, a = 1, f = freq; for (let o = 0; o < octaves; o++) { s += U.noise1(t * f, seed + c * 101 + o * 977) * a * amp; a *= ampMult; f *= 2; } return s * 1.6; };
    if (Array.isArray(base)) return base.map((x, i) => x + one(i));
    return base + one(0);
  }
  function loopFn(ctx, owner, key, dir, type = 'cycle', numKeys = 0) {
    const p = owner.props[key]; const info = Model.propInfo(owner, key); const t = ctx.t;
    if (!p.k || p.k.length < 2) return ctx.ev.value(ctx.comp, owner, key, t, true);
    const k = p.k; const n = k.length; let i0 = 0, i1 = n - 1; if (numKeys > 0) { if (dir === 'out') i0 = Math.max(0, n - 1 - numKeys); else i1 = Math.min(n - 1, numKeys); }
    const t0 = k[i0].t, t1 = k[i1].t, dur = t1 - t0;
    const K = tt => Model.evalKeys(p, tt, info);
    if (dur <= 0) return K(t);
    if (dir === 'out') { if (t <= t1) return K(t); } else { if (t >= t0) return K(t); }
    type = String(type);
    const el = dir === 'out' ? t - t0 : t1 - t; // 越过的时长
    const cycles = Math.floor(el / dur); let tt;
    if (type === 'cycle') tt = dir === 'out' ? t0 + el % dur : t1 - el % dur;
    else if (type === 'pingpong') { const m = el % (2 * dur); const f = m < dur ? m : 2 * dur - m; tt = dir === 'out' ? t0 + f : t1 - f; }
    else if (type === 'offset') { tt = dir === 'out' ? t0 + el % dur : t1 - el % dur; const v = K(tt); const d = mapv((a, b) => b - a, k[i0].v, k[i1].v); return mapv((x, dd) => dir === 'out' ? x + dd * cycles : x - dd * cycles, v, d); }
    else if (type === 'continue') { const e = dir === 'out' ? t1 : t0; const dt = 1 / 120; const va = K(dir === 'out' ? e - dt : e + dt), vb = K(e); const vel = mapv((a, b) => (b - a) / dt * (dir === 'out' ? 1 : -1), va, vb); const dd = Math.abs(t - e); return mapv((v, s) => v + s * dd * (dir === 'out' ? 1 : -1) * (dir === 'out' ? 1 : -1), vb, vel); }
    else throw new ExprError('loop 类型无效：' + type);
    return K(tt);
  }

  // ---------- 运行 ----------
  const compiled = new Map();
  Expr.compile = src => {
    let c = compiled.get(src); if (c) return c;
    let code; try { code = Expr.transpile(src); } catch (e) { if (e instanceof ExprError) { // 回退：直接按原生 JS 执行
      code = src; } else throw e; }
    let fn;
    try { fn = new Function('__S', '__src', 'with (__S) { return eval(__src); }'); }
    catch (e) { throw new ExprError('编译失败'); }
    // 语法预检
    try { new Function(code); } catch (e) { throw new ExprError('语法错误：' + e.message.replace(/^Unexpected /, '意外的 ')); }
    c = { fn, code }; compiled.set(src, c); if (compiled.size > 500) compiled.clear(); return c;
  };

  Expr.run = (ev, comp, owner, key, p, base, t, info) => {
    const c = Expr.compile(p.x);
    const ctx = makeCtx(ev, comp, owner, key, base, t);
    const idx = comp.layers.indexOf(owner) + 1;
    let seedState = null; let rng = null; const fps = comp.fps;
    const initRng = (seed, timeless) => { rng = U.rng(U.hash2(U.hashStr(owner.id + key) , (seed | 0) * 7919 + (timeless ? 0 : Math.round(t * fps) + 1))); };
    const R = () => { if (!rng) initRng(0, false); return rng(); };
    const S = {
      time: t, value: base, index: idx, thisComp: null, thisLayer: null, thisProperty: null,
      PI: Math.PI,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2, sqrt: Math.sqrt, pow: Math.pow, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, exp: Math.exp, log: Math.log, Math,
      clamp: (x, a, b) => mapv((v, lo, hi) => Math.min(Math.max(v, lo), hi), x, a, b),
      linear: (t_, a, b, c_, d_) => lin(t_, a, b, c_, d_, 'lin'), ease: (t_, a, b, c_, d_) => lin(t_, a, b, c_, d_, 'ease'), easeIn: (t_, a, b, c_, d_) => lin(t_, a, b, c_, d_, 'in'), easeOut: (t_, a, b, c_, d_) => lin(t_, a, b, c_, d_, 'out'),
      length: (a, b) => { a = unwrap(a); if (b !== undefined) { b = unwrap(b); return Math.hypot(...a.map((x, i) => x - b[i])); } return Array.isArray(a) ? Math.hypot(...a) : Math.abs(a); },
      add: rt.__add, sub: rt.__sub, mul: rt.__mul, div: rt.__div,
      dot: (a, b) => unwrap(a).reduce((s, x, i) => s + x * unwrap(b)[i], 0), cross: (a, b) => U.V.cross(unwrap(a), unwrap(b)),
      normalize: a => U.V.norm(unwrap(a)),
      degreesToRadians: x => num(x) * U.DEG, radiansToDegrees: x => num(x) / U.DEG,
      timeToFrames: (tm = t, f = fps) => Math.round(num(tm) * f), framesToTime: (fr, f = fps) => num(fr) / f,
      seedRandom: (seed, timeless = false) => initRng(num(seed), !!timeless),
      random: (a, b) => { const r = R(); if (a === undefined) return r; a = unwrap(a); if (b === undefined) return Array.isArray(a) ? a.map(x => x * r) : a * r; b = unwrap(b); return Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * r) : a + (b - a) * r; },
      gaussRandom: () => { let u = 0, v = 0; while (!u) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.5; },
      noise: x => { x = unwrap(x); return Array.isArray(x) ? U.noise3(x[0] || 0, x[1] || 0, x[2] || 0, 7) : U.noise1(x, 7); },
      comp: name => { const c2 = ev.project.comps.find(c => c.name === name); if (!c2) throw new ExprError(`找不到合成「${name}」`); return compProxy(ctx, c2); },
      name: owner.name,
    };
    const me = propRef(ctx, comp, owner, key); me._self = true;
    const thisL = owner.props && owner.type ? layerProxy(ctx, comp, owner) : null;
    S.thisComp = compProxy(ctx, comp); S.thisLayer = thisL; S.thisProperty = me;
    S.wiggle = (...a) => wiggleFn(ctx, owner, key, base, ...a);
    S.loopOut = (...a) => loopFn(ctx, owner, key, 'out', ...a); S.loopIn = (...a) => loopFn(ctx, owner, key, 'in', ...a);
    S.valueAtTime = tm => me.valueAtTime(tm);
    Object.defineProperty(S, 'velocity', { get: () => me.velocity, enumerable: true });
    if (thisL) { S.transform = thisL.transform; S.effect = thisL.effect; S.position = thisL.transform.position; S.scale = thisL.transform.scale; S.rotation = thisL.transform.rotation; S.opacity = thisL.transform.opacity; S.anchorPoint = thisL.transform.anchorPoint; }
    Object.assign(S, rt);
    const proxy = new Proxy(S, {
      has: (tg, k) => typeof k === 'string' && k !== '__src' && k !== 'eval',
      get: (tg, k) => { if (k === Symbol.unscopables) return undefined; if (k in tg) return tg[k]; if (k in globalThis) return globalThis[k]; throw new ExprError(`未定义的名称「${String(k)}」`); },
      set: (tg, k, v) => { tg[k] = v; return true; },
    });
    let res;
    try { res = c.fn(proxy, c.code); }
    catch (e) { if (e instanceof ExprError || e instanceof CycleError) throw e; throw new ExprError(translateErr(e)); }
    return res;
  };
  function translateErr(e) {
    const m = String(e && e.message || e);
    if (e instanceof SyntaxError) return '语法错误：' + m;
    if (e instanceof ReferenceError) return '未定义的名称：' + m.replace(/ is not defined/, '');
    if (e instanceof TypeError) return '类型错误：' + m.replace('Cannot read properties of undefined', '读取了未定义对象的属性').replace('is not a function', '不是函数');
    return m;
  }
  Expr.unwrap = unwrap;
})();
