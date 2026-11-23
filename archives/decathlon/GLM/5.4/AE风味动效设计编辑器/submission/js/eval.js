/* ============================================================
   eval.js — 属性求值、依赖图、变换矩阵、摄像机、场景装配
   ============================================================ */
(function (global) {
  'use strict';
  const M = MODEL, U_ = U;

  function isProp(o) { return o && typeof o === 'object' && o.keys !== undefined; }

  /* ---------------- 求值状态 ---------------- */
  class EvalState {
    constructor(comp, time, opts = {}) {
      this.comp = comp;
      this.time = time;
      this.cache = new Map();
      this.matCache = new Map();
      this.stack = new Set();
      this.errors = [];
      this.subTimes = new Map();
      this.depth = opts.depth || 0;
      this.frameKey = opts.frameKey || 0;
    }
    key(layer, path) { return layer.id + '|' + path.join('.'); }

    getProp(layer, path, t) {
      if (t === undefined || t === null) t = this.time;
      if (Math.abs(t - this.time) > 1e-9) {
        if (this.depth > 6) { const p = M.getPropAt(layer, path); return p && p.keys ? M.evalKeyframes(p, t) : (p ? p.v : 0); }
        let sub = this.subTimes.get(t);
        if (!sub) { sub = new EvalState(this.comp, t, { depth: this.depth + 1 }); this.subTimes.set(t, sub); }
        return sub.getProp(layer, path, t);
      }
      const k = this.key(layer, path);
      if (this.cache.has(k)) return this.cache.get(k);
      if (this.stack.has(k)) {
        this.errors.push({ layer, path, msg: '表达式循环引用：' + path.join('.') });
        const p = M.getPropAt(layer, path);
        const v = p && p.keys ? M.evalKeyframes(p, t) : (p ? p.v : 0);
        this.cache.set(k, v);
        return v;
      }
      const p = M.getPropAt(layer, path);
      if (!isProp(p)) { this.cache.set(k, p); return p; }
      this.stack.add(k);
      let v = M.evalKeyframes(p, t);
      if (p.exprOn && p.expr) {
        try {
          const ast = EXPR.parse(p.expr);
          const ctx = this.makeContext(layer, p, path);
          const out = EXPR.evaluate(ast, ctx);
          v = unwrap(out);
          if (isProp(out)) v = out.__value;
        } catch (e) {
          this.errors.push({ layer, path, msg: '表达式错误：' + (e.message || e) });
          p._err = e.message || String(e);
        }
      }
      if (p && p._err !== undefined && !(p.exprOn && p.expr)) p._err = undefined;
      this.cache.set(k, v);
      this.stack.delete(k);
      return v;
    }

    makeContext(layer, prop, path) {
      const state = this;
      const self = this;
      const ctx = {
        ident(name) {
          switch (name) {
            case 'time': return state.time;
            case 'value': {
              const v = M.evalKeyframes(prop, state.time);
              return v;
            }
            case 'thisLayer': return { __layer: layer, __state: state };
            case 'thisComp': return { __comp: state.comp, __state: state };
            case 'thisProperty': return { __prop: prop, __layer: layer, __path: path, __state: state };
            case 'Math': return Math;
            case 'undefined': return undefined;
            default: throw new EXPR.ExprError('未知标识符 ' + name);
          }
        },
        member(o, name, ast) {
          if (o && o.__layer) {
            const layer2 = o.__layer;
            const p = M.getPropAt(layer2, [name]);
            if (isProp(p)) return o.__state.getProp(layer2, [name]);
            if (p && typeof p === 'object') return { __layer: layer2, __state: o.__state, __base: [name] };
            return p;
          }
          if (o && o.__base) {
            const path2 = o.__base.concat(name);
            const p = M.getPropAt(o.__layer, path2);
            if (isProp(p)) return o.__state.getProp(o.__layer, path2);
            if (p && typeof p === 'object') return { __layer: o.__layer, __state: o.__state, __base: path2 };
            return p;
          }
          if (o && o.__prop) {
            if (name === 'numKeys') return prop.keys.length;
            if (name === 'value') return M.evalKeyframes(prop, state.time);
            if (name === 'speed' || name === 'velocity') {
              const e = 1 / 120;
              return M.vscale(M.vsub(M.evalKeyframes(prop, state.time + e), M.evalKeyframes(prop, state.time - e)), 1 / (2 * e));
            }
            return undefined;
          }
          if (o && o.__comp) {
            if (name === 'numLayers') return o.__comp.layers.length;
            if (name === 'width') return o.__comp.w;
            if (name === 'height') return o.__comp.h;
            if (name === 'duration') return o.__comp.duration;
            if (name === 'fps') return o.__comp.fps;
            return undefined;
          }
          if (Array.isArray(o)) {
            if (name === 'length') return o.length;
            return o[name];
          }
          if (o && typeof o === 'object') {
            if (name === 'length' && o.length !== undefined) return o.length;
            return o[name];
          }
          return undefined;
        },
        call(name, args, ast, obj) {
          // 合成代理上的 layer()
          if (obj && obj.__comp && name === 'layer') {
            const a = args[0];
            const l = (typeof a === 'number')
              ? state.comp.layers[a - 1]
              : state.comp.layers.find(x => x.name === a);
            if (!l) throw new EXPR.ExprError('找不到图层 ' + a);
            return { __layer: l, __state: state };
          }
          // 属性引用上的方法
          const ref = resolveRef(ast && ast.obj, state, layer);
          if (ref) {
            if (name === 'valueAtTime') return state.getProp(ref.layer, ref.path, args[0]);
            if (name === 'numKeys') { const p = M.getPropAt(ref.layer, ref.path); return p && p.keys ? p.keys.length : 0; }
            if (name === 'key') { const p = M.getPropAt(ref.layer, ref.path); const i = Math.round(args[0]) - 1; return p && p.keys && p.keys[i] ? p.keys[i].v : undefined; }
            if (name === 'keyTime') { const p = M.getPropAt(ref.layer, ref.path); const i = Math.round(args[0]) - 1; return p && p.keys && p.keys[i] ? p.keys[i].t : undefined; }
            if (name === 'speedAtTime') { const p = M.getPropAt(ref.layer, ref.path); return p ? M.vlen(M.evalVelocity(p, args[0], state, ref.layer, ref.path)) : 0; }
          }
          switch (name) {
            case 'wiggle': return wiggle(prop, state, args, layer, path);
            case 'loopOut': return loopOut(prop, state, args, false);
            case 'loopIn': return loopOut(prop, state, args, true);
            case 'loopOutDuration': return loopOut(prop, state, args, false);
            case 'linear': {
              if (args.length === 3) return EXPR.isArr(args[2]) ? args[2] : U_.clamp((args[0] - args[1]) / (args[2] - args[1] || 1e-9), 0, 1);
              const [t, a, b, c, d] = args;
              const u = U_.clamp((t - a) / (b - a || 1e-9), 0, 1);
              if (EXPR.isArr(c) || EXPR.isArr(d)) {
                const n = Math.max(EXPR.dim(c), EXPR.dim(d));
                const o = []; for (let i = 0; i < n; i++) o.push(U_.lerp(M.vget(c, i), M.vget(d, i), u)); return o;
              }
              return U_.lerp(c, d, u);
            }
            case 'ease': case 'easeIn': case 'easeOut': {
              if (args.length === 3) {
                let u = U_.clamp((args[0] - args[1]) / (args[2] - args[1] || 1e-9), 0, 1);
                u = name === 'ease' ? U_.Ease.inOutCubic(u) : name === 'easeIn' ? U_.Ease.inQuad(u) : U_.Ease.outQuad(u);
                return u;
              }
              const [t, a, b, c, d] = args;
              let u = U_.clamp((t - a) / (b - a || 1e-9), 0, 1);
              u = name === 'ease' ? U_.Ease.inOutCubic(u) : name === 'easeIn' ? U_.Ease.inQuad(u) : U_.Ease.outQuad(u);
              if (EXPR.isArr(c) || EXPR.isArr(d)) {
                const n = Math.max(EXPR.dim(c), EXPR.dim(d));
                const o = []; for (let i = 0; i < n; i++) o.push(U_.lerp(M.vget(c, i), M.vget(d, i), u)); return o;
              }
              return U_.lerp(c, d, u);
            }
            case 'clamp': return U_.clamp(args[0], args[1], args[2]);
            case 'random': {
              const s = Math.floor(args[2] !== undefined ? args[2] : (state.time * 1000));
              const r = new U_.RNG(s + (layer.id.length * 13));
              return args.length >= 2 ? r.range(args[0], args[1]) : r.next();
            }
            case 'length': return EXPR.isArr(args[0]) ? Math.hypot(...args[0]) : Math.abs(args[0]);
            case 'normalize': { const l = Math.hypot(...(EXPR.isArr(args[0]) ? args[0] : [args[0]])) || 1; return EXPR.isArr(args[0]) ? args[0].map(v => v / l) : Math.sign(args[0]); }
            case 'dot': { const a = args[0], b = args[1]; return (EXPR.isArr(a) ? a : [a]).reduce((s, v, i) => s + v * (EXPR.isArr(b) ? b[i] || 0 : b), 0); }
            case 'cross': { const a = args[0], b = args[1]; return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
            case 'radians': return args[0] * Math.PI / 180;
            case 'degrees': return args[0] * 180 / Math.PI;
            case 'seedRandom': return 0;
            case 'timeToFrames': return Math.round(args[0] * state.comp.fps);
            case 'framesToTime': return args[0] / state.comp.fps;
            case 'rgbToHsl': { const c = args[0]; return U_.rgb2hsl(c[0], c[1], c[2]); }
            case 'hslToRgb': return U_.hsl2rgb(args[0], args[1], args[2]);
            case 'smooth': { const t = args[0], w = args[1]; return U_.smoothstep(-w, w, t); }
            case 'add': return M.vadd(args[0], args[1]);
            case 'sub': return M.vsub(args[0], args[1]);
            case 'mul': return M.vscale(args[0], args[1]);
            case 'div': return M.vscale(args[0], 1 / (args[1] || 1e-9));
            case 'lookAt': { const e = args[0], c = args[1]; const d = M.vnorm(M.vsub(c, e)); return d; }
            case 'gaussRandom': { const r = new U_.RNG(Math.floor(state.time * 1000) + (args[0] || 0)); return r.gauss(); }
            default: break;
          }
          // Math.*
          if (obj === Math && typeof Math[name] === 'function') return Math[name](...args);
          if (obj && typeof obj === 'object' && typeof obj[name] === 'function') return obj[name](...args);
          throw new EXPR.ExprError('未知函数 ' + name);
        }
      };
      return ctx;
    }

    localMatrix(layer) {
      if (this.matCache.has('l' + layer.id)) return this.matCache.get('l' + layer.id);
      const tr = layer.transform;
      const pos = this.getProp(layer, ['transform', 'position']);
      const anc = this.getProp(layer, ['transform', 'anchor']);
      const scl = this.getProp(layer, ['transform', 'scale']);
      const rot = this.getProp(layer, ['transform', 'rotation']);
      const is3 = layer.threeD || (layer.parent && is3DAncestor(this.comp, layer));
      const px = M.vget(pos, 0), py = M.vget(pos, 1), pz = M.vget(pos, 2);
      const ax = M.vget(anc, 0), ay = M.vget(anc, 1), az = M.vget(anc, 2);
      const sx = M.vget(scl, 0) / 100, sy = M.vget(scl, 1) / 100, sz = M.vget(scl, 2) / 100;
      let m = U_.M4.mul(U_.M4.translation(px, py, pz), U_.M4.translation(-ax, -ay, -az));
      if (is3) {
        const ori = this.getProp(layer, ['transform', 'orientation']);
        const xr = this.getProp(layer, ['transform', 'xRotation']) * U_.DEG;
        const yr = this.getProp(layer, ['transform', 'yRotation']) * U_.DEG;
        const zr = this.getProp(layer, ['transform', 'zRotation']) * U_.DEG;
        const r = U_.M4.mul(U_.M4.rotZ(M.vget(ori, 2) * U_.DEG), U_.M4.mul(U_.M4.rotY(M.vget(ori, 1) * U_.DEG), U_.M4.rotX(M.vget(ori, 0) * U_.DEG)));
        const r2 = U_.M4.mul(U_.M4.rotZ(zr), U_.M4.mul(U_.M4.rotY(yr), U_.M4.rotX(xr)));
        m = U_.M4.mul(m, U_.M4.mul(r, r2));
        m = U_.M4.mul(m, U_.M4.scale(sx, sy, sz));
      } else {
        m = U_.M4.mul(m, U_.M4.rotZ(rot * U_.DEG));
        m = U_.M4.mul(m, U_.M4.scale(sx, sy, sz));
      }
      this.matCache.set('l' + layer.id, m);
      return m;
    }

    worldMatrix(layer) {
      const key = 'w' + layer.id;
      if (this.matCache.has(key)) return this.matCache.get(key);
      let m = this.localMatrix(layer);
      if (layer.parent) {
        const p = this.comp.layers.find(l => l.id === layer.parent);
        if (p && p.id !== layer.id) m = U_.M4.mul(this.worldMatrix(p), m);
      }
      this.matCache.set(key, m);
      return m;
    }
    // 世界坐标下的锚点/中心
    worldAnchor(layer) {
      const m = this.worldMatrix(layer);
      return [m[12], m[13], m[14]];
    }
    opacity(layer) { return U_.clamp(this.getProp(layer, ['transform', 'opacity']) / 100, 0, 1); }
    visible(layer, t) {
      if (!layer.enabled) return false;
      if (t < layer.inPoint - 1e-6 || t > layer.outPoint + 1e-6) return false;
      return true;
    }
  }

  function unwrap(v) {
    if (v && typeof v === 'object' && v.__layer) return 0;
    return v;
  }
  function resolveRef(node, state, selfLayer) {
    if (!node) return null;
    // 收集 member/index/call 链
    const names = [];
    let n = node;
    while (n) {
      if (n.k === 'member') { names.unshift(n.name); n = n.obj; }
      else if (n.k === 'index') { names.unshift(null); n = n.obj; }
      else break;
    }
    if (n && n.k === 'call' && n.name === 'layer' && n.obj && n.obj.k === 'ident' && n.obj.name === 'thisComp') {
      const arg = n.args[0];
      let layer = null;
      if (arg && arg.k === 'str') layer = state.comp.layers.find(l => l.name === arg.v);
      else if (arg && arg.k === 'num') layer = state.comp.layers[arg.v - 1];
      if (!layer) return null;
      return { layer, path: names };
    }
    if (n && n.k === 'ident' && n.name === 'thisLayer') {
      return { layer: selfLayer, path: names };
    }
    return null;
  }

  function is3DAncestor(comp, layer) {
    let p = layer.parent, guard = 0;
    while (p && guard++ < 20) {
      const pl = comp.layers.find(l => l.id === p);
      if (!pl) return false;
      if (pl.threeD) return true;
      p = pl.parent;
    }
    return false;
  }

  /* ---------------- 循环 / 抖动 ---------------- */
  function loopOut(prop, state, args, isIn) {
    const type = args[0] || 'cycle';
    const keys = prop.keys;
    if (!keys || keys.length < 2) return M.evalKeyframes(prop, state.time);
    const t = state.time;
    const first = keys[0], last = keys[keys.length - 1];
    const dur = last.t - first.t;
    if (dur <= 0) return M.evalKeyframes(prop, t);
    if (!isIn && t <= last.t) return M.evalKeyframes(prop, t);
    if (isIn && t >= first.t) return M.evalKeyframes(prop, t);
    let tt, cycles;
    if (!isIn) {
      const rel = t - first.t;
      cycles = Math.floor(rel / dur);
      tt = first.t + (rel - cycles * dur);
    } else {
      const rel = first.t - t;
      cycles = Math.floor(rel / dur);
      tt = last.t - (rel - cycles * dur);
    }
    if (type === 'pingpong') {
      if (cycles % 2 === 1) tt = first.t + (last.t - tt);
    } else if (type === 'continue') {
      return M.evalKeyframes(prop, isIn ? first.t : last.t);
    } else if (type === 'offset') {
      const base = M.evalKeyframes(prop, tt);
      const dv = M.vsub(last.v, first.v);
      return M.vadd(base, M.vscale(dv, isIn ? -cycles : cycles));
    }
    return M.evalKeyframes(prop, tt);
  }
  function wiggle(prop, state, args, layer, path) {
    const freq = args[0] !== undefined ? args[0] : 3;
    const amp = args[1] !== undefined ? args[1] : 50;
    const oct = args[2] !== undefined ? Math.max(1, Math.round(args[2])) : 1;
    const base = M.evalKeyframes(prop, state.time);
    let seed = 0;
    const s = (layer.id + path.join('.'));
    for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) % 100000;
    if (EXPR.isArr(base)) {
      return base.map((v, i) => v + EXPR.wiggleValue(state.time, freq, amp, oct, seed + i * 17.7));
    }
    return base + EXPR.wiggleValue(state.time, freq, amp, oct, seed);
  }

  /* ---------------- 全场景求值 ---------------- */
  function evaluateComp(comp, time, opts = {}) {
    const st = new EvalState(comp, time, opts);
    const layers = comp.layers;
    const anySolo = layers.some(l => l.solo);
    const out = [];
    for (let i = layers.length - 1; i >= 0; i--) { // 底层在前
      const L = layers[i];
      if (anySolo && !L.solo) continue;
      if (!st.visible(L, time)) continue;
      out.push({
        layer: L,
        state: st,
        world: st.worldMatrix(L),
        opacity: st.opacity(L),
        index: i
      });
    }
    return { state: st, layers: out };
  }

  /* ---------------- 摄像机 ---------------- */
  function cameraFor(comp, state) {
    let cam = null;
    if (comp.cameraId) cam = comp.layers.find(l => l.id === comp.cameraId && l.type === 'camera');
    if (!cam) cam = comp.layers.find(l => l.type === 'camera');
    if (!cam) {
      return {
        eye: [comp.w / 2, comp.h / 2, -1400], target: [comp.w / 2, comp.h / 2, 0], up: [0, 1, 0],
        fov: 40 * U_.DEG, focus: 1400, aperture: 0, zoom: 1400, matrix: null
      };
    }
    const pos = state.getProp(cam, ['transform', 'position']);
    const useTarget = cam.camera.targetEnable === undefined ? true : state.getProp(cam, ['camera', 'targetEnable']);
    const tgt = state.getProp(cam, ['camera', 'target']);
    const fovDeg = state.getProp(cam, ['camera', 'fov']);
    const focus = state.getProp(cam, ['camera', 'focus']);
    const aperture = state.getProp(cam, ['camera', 'aperture']);
    const focusLayer = cam.camera.focusLayer ? comp.layers.find(l => l.id === cam.camera.focusLayer) : null;
    let f = focus;
    if (focusLayer) {
      const wm = state.worldMatrix(focusLayer);
      f = Math.hypot(wm[12] - M.vget(pos, 0), wm[13] - M.vget(pos, 1), wm[14] - M.vget(pos, 2));
    }
    let eye, target, up = [0, 1, 0];
    if (useTarget) {
      eye = [M.vget(pos, 0), M.vget(pos, 1), M.vget(pos, 2)];
      target = [M.vget(tgt, 0), M.vget(tgt, 1), M.vget(tgt, 2)];
    } else {
      const wm = state.worldMatrix(cam);
      eye = [wm[12], wm[13], wm[14]];
      // 相机朝 -Z
      const dz = [-wm[2], -wm[6], -wm[10]];
      target = [eye[0] + dz[0], eye[1] + dz[1], eye[2] + dz[2]];
      up = [wm[1], wm[5], wm[9]];
    }
    return {
      eye, target, up, fov: fovDeg * U_.DEG, focus: f, aperture, zoom: (comp.w / 2) / Math.tan(fovDeg * U_.DEG / 2),
      matrix: U_.M4.lookAt(eye, target, up), near: 1, far: 20000, layer: cam
    };
  }

  /* ---------------- 变换工具 ---------------- */
  function matrix2D(m) {
    // 从 4x4 提取 2D 仿射
    return [m[0], m[1], m[4], m[5], m[12], m[13]];
  }
  function applyMat2(m, x, y) { return U_.M2.apply(m, x, y); }

  global.EVAL = { EvalState, evaluateComp, cameraFor, is3DAncestor, resolveRef, matrix2D, applyMat2 };
})(window);
