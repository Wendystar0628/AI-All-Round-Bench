/* Expression language: time, value, wiggle, loopOut, linear, ease, layer refs, valueAtTime. */
(function (G) {
  const AE = (G.AE = G.AE || {});
  const M = AE.math;

  function tokenize(src) {
    const t = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === " " || c === "\n" || c === "\t" || c === "\r") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === '"' || c === "'") {
        const q = c; i++; let s = "";
        while (i < src.length && src[i] !== q) {
          if (src[i] === "\\") { i++; s += src[i] || ""; i++; }
          else s += src[i++];
        }
        if (src[i] !== q) throw new Error("字符串没有结束");
        i++;
        t.push({ k: "str", v: s });
        continue;
      }
      if ((c >= "0" && c <= "9") || (c === "." && src[i + 1] >= "0" && src[i + 1] <= "9")) {
        let s = "";
        while (i < src.length && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) s += src[i++];
        const n = parseFloat(s);
        if (!isFinite(n)) throw new Error("数字无效");
        t.push({ k: "num", v: n });
        continue;
      }
      const two = src.slice(i, i + 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") {
        t.push({ k: "op", v: two }); i += 2; continue;
      }
      if ("+-*/%(),.[]?:!<>".indexOf(c) >= 0) { t.push({ k: "op", v: c }); i++; continue; }
      if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_") {
        let s = "";
        while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) s += src[i++];
        t.push({ k: "id", v: s });
        continue;
      }
      throw new Error("无法识别的字符「" + c + "」");
    }
    t.push({ k: "eof" });
    return t;
  }

  function parse(src) {
    const tok = tokenize(src);
    let i = 0;
    const peek = () => tok[i];
    const eat = (k, v) => {
      const t = tok[i];
      if (t.k !== k || (v != null && t.v !== v)) throw new Error("语法错误，遇到「" + (t.v != null ? t.v : t.k) + "」");
      i++;
      return t;
    };
    function parseExpr() { return parseTernary(); }
    function parseTernary() {
      const c = parseOr();
      if (peek().k === "op" && peek().v === "?") {
        i++;
        const a = parseExpr();
        eat("op", ":");
        const b = parseExpr();
        return { t: "cond", c, a, b };
      }
      return c;
    }
    function binLevel(ops, next) {
      let left = next();
      while (peek().k === "op" && ops.indexOf(peek().v) >= 0) {
        const op = peek().v; i++;
        const right = next();
        left = { t: "bin", op, left, right };
      }
      return left;
    }
    function parseOr() { return binLevel(["||"], parseAnd); }
    function parseAnd() { return binLevel(["&&"], parseCmp); }
    function parseCmp() { return binLevel(["==", "!=", "<", ">", "<=", ">="], parseAdd); }
    function parseAdd() { return binLevel(["+", "-"], parseMul); }
    function parseMul() { return binLevel(["*", "/", "%"], parseUnary); }
    function parseUnary() {
      if (peek().k === "op" && (peek().v === "-" || peek().v === "+" || peek().v === "!")) {
        const op = peek().v; i++;
        return { t: "unary", op, x: parseUnary() };
      }
      return parsePost();
    }
    function parsePost() {
      let left = parsePrimary();
      for (;;) {
        if (peek().k === "op" && peek().v === ".") {
          i++;
          const name = eat("id").v;
          if (peek().k === "op" && peek().v === "(") {
            i++;
            const args = parseArgs();
            left = { t: "call", callee: { t: "member", obj: left, name }, args };
          } else left = { t: "member", obj: left, name };
        } else if (peek().k === "op" && peek().v === "[") {
          i++;
          const index = parseExpr();
          eat("op", "]");
          left = { t: "index", obj: left, index };
        } else if (peek().k === "op" && peek().v === "(") {
          i++;
          const args = parseArgs();
          left = { t: "call", callee: left, args };
        } else break;
      }
      return left;
    }
    function parseArgs() {
      const args = [];
      if (!(peek().k === "op" && peek().v === ")")) {
        args.push(parseExpr());
        while (peek().k === "op" && peek().v === ",") { i++; args.push(parseExpr()); }
      }
      eat("op", ")");
      return args;
    }
    function parsePrimary() {
      const t = peek();
      if (t.k === "num") { i++; return { t: "num", v: t.v }; }
      if (t.k === "str") { i++; return { t: "str", v: t.v }; }
      if (t.k === "id") { i++; return { t: "id", v: t.v }; }
      if (t.k === "op" && t.v === "(") { i++; const e = parseExpr(); eat("op", ")"); return e; }
      if (t.k === "op" && t.v === "[") {
        i++;
        const items = [];
        if (!(peek().k === "op" && peek().v === "]")) {
          items.push(parseExpr());
          while (peek().k === "op" && peek().v === ",") { i++; items.push(parseExpr()); }
        }
        eat("op", "]");
        return { t: "arr", items };
      }
      throw new Error("语法错误");
    }
    const ast = parseExpr();
    if (peek().k !== "eof") throw new Error("表达式末尾还有多余内容");
    return ast;
  }

  function num(v, env) {
    v = coerce(v, env);
    if (typeof v === "number") return v;
    if (Array.isArray(v)) return v[0] || 0;
    throw new Error("需要数值");
  }
  function coerce(v, env) {
    if (v && v.kind === "prop") return env.readProp(v, env.time);
    if (v && v.kind === "effect") return env.readProp(v.prop, env.time);
    return v;
  }
  function asVec(v) {
    v = Array.isArray(v) ? v : [v];
    return v.map((x) => (typeof x === "number" ? x : 0));
  }

  function exec(node, env) {
    switch (node.t) {
      case "num": return node.v;
      case "str": return node.v;
      case "arr": return node.items.map((n) => coerce(exec(n, env), env));
      case "id": return env.resolve(node.v);
      case "unary": {
        const x = coerce(exec(node.x, env), env);
        if (node.op === "!") return !truthy(x);
        if (node.op === "+") return num(x, env);
        if (node.op === "-") return Array.isArray(x) ? x.map((n) => -n) : -num(x, env);
        break;
      }
      case "cond": return truthy(coerce(exec(node.c, env), env)) ? exec(node.a, env) : exec(node.b, env);
      case "bin": return binOp(node.op, exec(node.left, env), exec(node.right, env), env);
      case "member": return member(exec(node.obj, env), node.name, env);
      case "index": return indexOf(exec(node.obj, env), exec(node.index, env), env);
      case "call": return call(node.callee, node.args, env);
      default: throw new Error("无法执行的表达式");
    }
  }

  function truthy(v) {
    if (Array.isArray(v)) return v.some((x) => !!x);
    return !!v;
  }
  function binOp(op, a0, b0, env) {
    const a = coerce(a0, env), b = coerce(b0, env);
    if (op === "+") {
      if (typeof a === "string" || typeof b === "string") return String(a) + String(b);
      if (Array.isArray(a) || Array.isArray(b)) return M.addN(asVec(a), asVec(b));
      return num(a, env) + num(b, env);
    }
    if (op === "-" || op === "*" || op === "/" || op === "%") {
      if (Array.isArray(a) || Array.isArray(b)) {
        const A = asVec(a), B = asVec(b);
        const n = Math.max(A.length, B.length);
        const o = [];
        for (let i = 0; i < n; i++) {
          const x = A[i] || 0, y = B.length === 1 ? B[0] : (B[i] || 0);
          if (op === "-" ) o.push(x - y);
          else if (op === "*") o.push(x * y);
          else if (op === "/") o.push(y === 0 ? 0 : x / y);
          else o.push(y === 0 ? 0 : x % y);
        }
        return o.length === 1 ? o[0] : o;
      }
      const x = num(a, env), y = num(b, env);
      if (op === "-") return x - y;
      if (op === "*") return x * y;
      if (op === "/") return y === 0 ? 0 : x / y;
      return y === 0 ? 0 : x % y;
    }
    if (op === "==" || op === "!=") {
      const eq = JSON.stringify(a) === JSON.stringify(b);
      return op === "==" ? eq : !eq;
    }
    const x = num(a, env), y = num(b, env);
    if (op === "<") return x < y;
    if (op === ">") return x > y;
    if (op === "<=") return x <= y;
    if (op === ">=") return x >= y;
    if (op === "&&") return truthy(a) ? b : a;
    if (op === "||") return truthy(a) ? a : b;
    throw new Error("未知运算 " + op);
  }

  function member(obj, name, env) {
    if (obj && obj.kind === "prop" && name !== "valueAtTime" && name !== "wiggle" && name !== "loopOut") {
      obj = env.readProp(obj, env.time);
    }
    if (obj && obj.kind === "comp") {
      if (name === "layer") return { kind: "fn", fn: "compLayer", comp: obj.comp };
      if (name === "name") return obj.comp.name;
      if (name === "width") return obj.comp.width;
      if (name === "height") return obj.comp.height;
      if (name === "duration") return obj.comp.duration;
      if (name === "frameDuration") return 1 / obj.comp.fps;
    }
    if (obj && obj.kind === "layer") {
      if (name === "transform") return { kind: "ns", layer: obj.layer, ns: "transform" };
      if (name === "effect") return { kind: "fn", fn: "effect", layer: obj.layer };
      if (name === "name") return obj.layer.name;
      if (name === "index") return obj.comp.layers.indexOf(obj.layer);
    }
    if (obj && obj.kind === "ns" && obj.ns === "transform") {
      const map = {
        position: "transform.position",
        anchor: "transform.anchor",
        anchorPoint: "transform.anchor",
        scale: "transform.scale",
        rotation: "transform.rotation",
        opacity: "transform.opacity",
        xRotation: "transform.rotationX",
        yRotation: "transform.rotationY",
        zRotation: "transform.rotationZ",
        rotationX: "transform.rotationX",
        rotationY: "transform.rotationY",
        rotationZ: "transform.rotationZ",
      };
      const path = map[name];
      if (!path) throw new Error("没有变换属性「" + name + "」");
      const prop = obj.layer.props[path];
      if (!prop) throw new Error("图层没有属性「" + name + "」");
      return { kind: "prop", layer: obj.layer, prop, comp: env.compOf(obj.layer) };
    }
    if (obj && obj.kind === "prop" && name === "valueAtTime") {
      return { kind: "fn", fn: "valueAtTime", propRef: obj };
    }
    if (obj && obj.kind === "prop" && name === "wiggle") return { kind: "fn", fn: "wiggle", propRef: obj };
    if (obj && obj.kind === "prop" && name === "loopOut") return { kind: "fn", fn: "loopOut", propRef: obj };
    if (obj && typeof obj === "object" && !obj.kind && name in obj) return obj[name];
    throw new Error("无法读取「" + name + "」");
  }

  function indexOf(obj, index, env) {
    obj = coerce(obj, env);
    const i = num(index, env) | 0;
    if (typeof obj === "number") return i === 0 ? obj : 0;
    if (typeof obj === "string") return obj.charAt(i);
    if (Array.isArray(obj)) return obj[i] == null ? 0 : obj[i];
    if (obj && obj.kind === "prop") return indexOf(env.readProp(obj, env.time), i, env);
    throw new Error("不能用下标访问这个值");
  }

  function call(callee, argNodes, env) {
    const args = argNodes.map((n) => exec(n, env));
    if (callee.t === "id") {
      return callFn(callee.v, args.map((a) => coerce(a, env)), env, null);
    }
    const fn = exec(callee, env);
    if (fn && fn.kind === "fn") {
      const cargs = args.map((a) => (fn.fn === "compLayer" || fn.fn === "effect") ? a : coerce(a, env));
      return callFn(fn.fn, cargs, env, fn);
    }
    throw new Error("这不是函数");
  }

  function callFn(name, args, env, fn) {
    if (name === "compLayer") {
      const layerName = String(args[0] && args[0].kind === "prop" ? env.readProp(args[0], env.time) : args[0]);
      const layer = fn.comp.layers.find((l) => l.name === layerName);
      if (!layer) throw new Error("找不到图层「" + layerName + "」");
      return { kind: "layer", layer, comp: fn.comp };
    }
    if (name === "effect") {
      const en = String(coerce(args[0], env));
      const ef = (fn.layer.effects || []).find((e) => e.name === en);
      if (!ef) throw new Error("找不到效果「" + en + "」");
      const prop = ef.props.value || ef.props[Object.keys(ef.props)[0]];
      return { kind: "prop", layer: fn.layer, prop, comp: env.compOf(fn.layer) };
    }
    if (name === "valueAtTime") {
      const t = num(args[0], env);
      const ref = fn.propRef;
      return env.readProp(ref, t);
    }
    if (name === "wiggle") {
      const freq = num(args[0], env);
      const amp = num(args[1], env);
      const prop = (fn && fn.propRef && fn.propRef.prop) || env.prop;
      const dim = prop ? prop.dim : 1;
      const seed = prop && prop.seed ? prop.seed : 1000;
      const out = [];
      for (let d = 0; d < dim; d++) out.push(M.valueNoise1(env.time * freq + d * 17.2, seed + d * 101) * amp);
      return dim === 1 ? out[0] : out;
    }
    if (name === "loopOut") {
      const mode = String(args[0] == null ? "cycle" : args[0]);
      const prop = (fn && fn.propRef && fn.propRef.prop) || env.prop;
      return loopOut(prop, env.time, mode);
    }
    if (name === "linear" || name === "ease") {
      const t = num(args[0], env);
      let a, b, c, d;
      if (args.length <= 3) { a = 0; b = 1; c = args[1]; d = args[2]; }
      else { a = num(args[1], env); b = num(args[2], env); c = coerce(args[3], env); d = coerce(args[4], env); }
      let u = b === a ? 0 : M.clamp((t - a) / (b - a), 0, 1);
      if (name === "ease") u = u * u * (3 - 2 * u);
      if (typeof c === "number" && typeof d === "number") return M.lerp(c, d, u);
      return M.lerpN(asVec(c), asVec(d), u);
    }
    if (name === "clamp") return M.clamp(num(args[0], env), num(args[1], env), num(args[2], env));
    if (name === "min") return Math.min(num(args[0], env), num(args[1], env));
    if (name === "max") return Math.max(num(args[0], env), num(args[1], env));
    if (name === "abs") return Math.abs(num(args[0], env));
    if (name === "sin") return Math.sin(num(args[0], env));
    if (name === "cos") return Math.cos(num(args[0], env));
    if (name === "floor") return Math.floor(num(args[0], env));
    if (name === "fract") { const x = num(args[0], env); return x - Math.floor(x); }
    if (name === "len") { const v = asVec(coerce(args[0], env)); return Math.hypot(...v); }
    throw new Error("未知函数「" + name + "」");
  }

  function loopOut(prop, time, mode) {
    if (!prop || !prop.keys || prop.keys.length < 2) return prop ? AE.model.sampleKeys(prop, time) : 0;
    const t0 = prop.keys[0].t;
    const t1 = prop.keys[prop.keys.length - 1].t;
    const dur = t1 - t0;
    if (dur <= 1e-8 || time <= t1) return AE.model.sampleKeys(prop, time);
    const n = Math.floor((time - t0) / dur);
    const u = (time - t0) - n * dur;
    let tt;
    if (mode === "pingpong") tt = (n % 2 === 0) ? t0 + u : t1 - u;
    else if (mode === "cycle") tt = t0 + u;
    else throw new Error("loopOut 只支持 cycle 和 pingpong");
    return AE.model.sampleKeys(prop, Math.min(t1, Math.max(t0, tt)));
  }

  const cache = new Map();
  function compile(src) {
    const hit = cache.get(src);
    if (hit) return hit;
    const ast = parse(src);
    cache.set(src, ast);
    if (cache.size > 400) cache.clear();
    return ast;
  }

  function evaluate(src, env) {
    if (!src || !String(src).trim()) return env.value;
    const ast = compile(String(src));
    const full = {
      time: env.time,
      value: env.value,
      prop: env.prop,
      layer: env.layer,
      comp: env.comp,
      project: env.project,
      readProp: env.readProp,
      compOf: env.compOf,
      resolve(name) {
        if (name === "time") return env.time;
        if (name === "value") return env.value;
        if (name === "thisComp") return { kind: "comp", comp: env.comp };
        if (name === "thisLayer") return { kind: "layer", layer: env.layer, comp: env.comp };
        if (["wiggle", "loopOut", "linear", "ease", "clamp", "min", "max", "abs", "sin", "cos", "floor", "fract", "len", "valueAtTime"].indexOf(name) >= 0) {
          return { kind: "fn", fn: name };
        }
        throw new Error("未知名称「" + name + "」");
      },
    };
    const result = exec(ast, full);
    return coerce(result, full);
  }

  AE.expr = { tokenize, parse, evaluate, clearCache() { cache.clear(); } };
})(typeof window !== "undefined" ? window : globalThis);
