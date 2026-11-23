/* 表达式引擎：把属性的表达式编译为函数，在求值时提供 time / value / thisComp / thisLayer 等变量。
 * 跨图层引用通过 Anim.value 递归求值（按依赖），循环引用与语法错误会记录提示并退回关键帧值。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const Anim = AE.Anim;
  const Expr = (AE.Expr = {});

  // 表达式中可用的名字
  const PARAMS = [
    'time', 'value', 'thisComp', 'thisLayer', 'thisProperty', 'index',
    'wiggle', 'loopOut', 'loopIn', 'linear', 'ease', 'easeIn', 'easeOut',
    'clamp', 'lerp', 'length', 'normalize', 'random',
    'degreesToRadians', 'radiansToDegrees', 'Math',
  ];
  const cache = new Map();
  Expr.errors = new Map(); // prop.id -> 最近一次错误信息（供界面显示）

  // 编译：先尝试表达式形式；失败则按语句块处理，取最后一个语句的值
  Expr.compile = (src) => {
    if (cache.has(src)) return cache.get(src);
    let fn;
    try {
      fn = new Function(...PARAMS, 'return (' + src + ');');
    } catch (e1) {
      const parts = src.split(';').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) throw e1;
      const last = parts.pop();
      const body = parts.join(';') + ';return (' + last.replace(/^return\s+/, '') + ');';
      try {
        fn = new Function(...PARAMS, body);
      } catch (e2) {
        throw e1;
      }
    }
    cache.set(src, fn);
    return fn;
  };

  // 带 valueAtTime 的数值 / 向量引用
  function ref(comp, layer, prop, t) {
    const v = Anim.value(comp, layer, prop, t);
    const withTime = (x) => {
      x.valueAtTime = (tt) => Anim.value(comp, layer, prop, Number(tt));
      return x;
    };
    if (Array.isArray(v)) {
      const arr = withTime(v.slice());
      ['x', 'y', 'z'].forEach((k, i) => {
        if (i < arr.length) arr[k] = arr[i];
      });
      return arr;
    }
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v;
    return withTime(new Number(v));
  }

  // 图层的变换属性访问器：惰性求值，只有访问时才计算
  function transformRefs(comp, layer, t) {
    const tr = layer.tr;
    const names = {
      anchorPoint: 'anchor', anchor: 'anchor', position: 'position', scale: 'scale', rotation: 'rotation', zRotation: 'rotation',
      rotationX: 'rotationX', xRotation: 'rotationX', rotationY: 'rotationY', yRotation: 'rotationY', opacity: 'opacity',
    };
    const obj = {};
    Object.keys(names).forEach((alias) => {
      const p = tr[names[alias]];
      if (!p) return;
      Object.defineProperty(obj, alias, { enumerable: true, get: () => ref(comp, layer, p, t) });
    });
    return obj;
  }
  function layerRef(comp, layer, t) {
    return {
      name: layer.name,
      index: comp.layers.indexOf(layer) + 1,
      inPoint: layer.inPoint,
      outPoint: layer.outPoint,
      startTime: layer.startTime,
      enabled: layer.enabled,
      transform: transformRefs(comp, layer, t),
      sourceText: layer.type === 'text' ? layer.text.text.v : undefined,
    };
  }
  function compRef(comp, t) {
    return {
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameDuration: 1 / comp.fps,
      numLayers: comp.layers.length,
      layer(x) {
        const l = typeof x === 'number' ? comp.layers[x - 1] : comp.layers.find((q) => q.name === x);
        if (!l) throw new Error('找不到图层：' + x);
        return layerRef(comp, l, t);
      },
    };
  }

  // 噪声随机：依赖属性 id 与时间，结果可复现
  function seedOf(prop) {
    return U.strHash(prop.id);
  }

  Expr.evaluate = (comp, layer, prop, t, raw) => {
    const src = prop.expr;
    let fn;
    try {
      fn = Expr.compile(src);
    } catch (e) {
      Expr.errors.set(prop.id, '表达式语法错误：' + e.message);
      return raw;
    }
    const seed = seedOf(prop);
    const kind = prop.kind;
    const vraw = Array.isArray(raw) ? raw.slice() : raw;
    const wiggle = (freq, amp) => {
      const base = vraw;
      const nv = (k, a) => U.noise1(t * freq, seed + k * 131) * a;
      if (Array.isArray(base)) {
        return base.map((b, i) => b + nv(i, Array.isArray(amp) ? amp[i] : amp));
      }
      return base + nv(0, amp);
    };
    // 与 AE 一致：linear / ease 按 [a,b] 区间映射到 [v1,v2]，超出区间时夹紧
    const mapRange = (p, v1, v2) => U.vlerp(v1 === undefined ? 0 : v1, v2 === undefined ? 1 : v2, p);
    const linearFn = (x, a, b, v1, v2) => mapRange(U.clamp((x - a) / (b - a || 1e-9), 0, 1), v1, v2);
    const easeFn = (x, a, b, v1, v2) => mapRange(U.smoothstep(a, b, x), v1, v2);
    const easeInFn = (x, a, b, v1, v2) => mapRange(Math.pow(U.clamp((x - a) / (b - a || 1e-9), 0, 1), 2), v1, v2);
    const easeOutFn = (x, a, b, v1, v2) => mapRange(1 - Math.pow(1 - U.clamp((x - a) / (b - a || 1e-9), 0, 1), 2), v1, v2);
    // 放入函数内，使其中的求值错误（如循环引用）也落在下面的 try 里
    const buildHelpers = () => [
      t,
      vraw,
      compRef(comp, t),
      layer ? layerRef(comp, layer, t) : {},
      // thisProperty：指向本属性自身，取其关键帧值，避免在求值中再次进入本属性（会被判为循环）
      vraw,
      layer ? comp.layers.indexOf(layer) + 1 : 0,
      wiggle,
      (type) => Anim.keyValue(prop, t - (layer ? layer.startTime : 0), { loopOut: type || 'cycle' }),
      (type) => Anim.keyValue(prop, t - (layer ? layer.startTime : 0), { loopIn: type || 'cycle' }),
      linearFn,
      easeFn,
      easeInFn,
      easeOutFn,
      (x, a, b) => U.clamp(x, a, b),
      (a, b, s) => U.vlerp(a, b, s),
      (a, b) => (b === undefined ? U.vlen(a) : U.vlen(U.vsub(a, b))),
      (a) => (Array.isArray(a) ? U.vnorm(a) : Math.sign(a)),
      (a, b) => {
        if (b === undefined) return U.hash(t, seed) * (a === undefined ? 1 : a);
        return a + U.hash(t, seed) * (b - a);
      },
      (d) => (d * Math.PI) / 180,
      (r) => (r * 180) / Math.PI,
      Math,
    ];
    let res;
    try {
      res = fn(...buildHelpers());
      res = coerce(res, prop, raw);
      Expr.errors.delete(prop.id);
      return res;
    } catch (e) {
      Expr.errors.set(prop.id, e.message && e.message.indexOf('循环') >= 0 ? e.message : '表达式错误：' + e.message);
      return raw;
    }
  };

  function coerce(res, prop, raw) {
    const n = (x) => {
      const v = Number(x);
      if (!isFinite(v)) throw new Error('结果不是有效数值');
      return v;
    };
    if (prop.kind === 'num') return n(res);
    if (prop.kind === 'bool') return !!res;
    if (prop.kind === 'vec' || prop.kind === 'color') {
      const len = Array.isArray(raw) ? raw.length : 3;
      if (Array.isArray(res)) return Array.from({ length: len }, (_, i) => n(res[i] !== undefined ? res[i] : res[0]));
      return Array.from({ length: len }, () => n(res));
    }
    return res;
  }
})();
