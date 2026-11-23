'use strict';
/*
 * Nest Script 标准库：所有程序共用的原生函数。
 * 每个函数形如 (args, vm) => value。涉及数据规模的操作按字符数向 vm 计费（约 256 字符 1 单位）。
 * 随机数来自所属系统的随机状态（vm.env.rand），因此快照可以复现。
 */
(function (root) {
  const N = (typeof module !== 'undefined' && module.exports) ? require('./nos-vm.js') : root.NOS;
  const { tostr, typeName, isMap, hasOwn, sizeOf, cloneValue } = N;

  function need(args, n, name) {
    if (args.length !== n) throw new N.NosError(`${name} 需要 ${n} 个参数，收到 ${args.length} 个`);
  }
  function num(v, name) {
    if (typeof v !== 'number') throw new N.NosError(`${name} 需要数字，收到 ${typeName(v)}`);
    return v;
  }
  function str(v, name) {
    if (typeof v !== 'string') throw new N.NosError(`${name} 需要字符串，收到 ${typeName(v)}`);
    return v;
  }
  function bill(vm, n) {
    if (vm && vm.charge && n > 0) vm.charge(Math.ceil(n / 256));
  }

  function makeStdlib() {
    const lib = {};
    const def = (name, fn) => { lib[name] = fn; };

    def('len', (a, vm) => {
      need(a, 1, 'len');
      const v = a[0];
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      if (isMap(v)) return Object.keys(v).length;
      throw new N.NosError('len 不能用于 ' + typeName(v));
    });
    def('type', (a) => { need(a, 1, 'type'); return typeName(a[0]); });
    def('str', (a, vm) => { need(a, 1, 'str'); const s = tostr(a[0]); bill(vm, s.length); return s; });
    def('num', (a) => {
      need(a, 1, 'num');
      const v = a[0];
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
      return 0;
    });
    def('isnum', (a) => { need(a, 1, 'isnum'); return typeof a[0] === 'number' && isFinite(a[0]); });

    // 数组
    def('push', (a) => { need(a, 2, 'push'); if (!Array.isArray(a[0])) throw new N.NosError('push 的第一个参数必须是数组'); a[0].push(a[1]); return a[0].length; });
    def('pop', (a) => {
      need(a, 1, 'pop');
      if (!Array.isArray(a[0])) throw new N.NosError('pop 的参数必须是数组');
      if (!a[0].length) return null;
      return a[0].pop();
    });
    def('slice', (a, vm) => {
      if (a.length < 2 || a.length > 3) throw new N.NosError('slice 需要 2 或 3 个参数');
      const x = a[0];
      if (!Array.isArray(x) && typeof x !== 'string') throw new N.NosError('slice 只能用于数组或字符串');
      const from = Math.max(0, Math.floor(num(a[1], 'slice')));
      const to = a.length === 3 ? Math.floor(num(a[2], 'slice')) : x.length;
      const r = x.slice(from, to);
      bill(vm, Array.isArray(r) ? r.length * 4 : r.length);
      return r;
    });
    def('concat', (a, vm) => {
      need(a, 2, 'concat');
      if (!Array.isArray(a[0]) || !Array.isArray(a[1])) throw new N.NosError('concat 需要两个数组');
      const r = a[0].concat(a[1]);
      bill(vm, r.length * 4);
      return r;
    });
    def('indexOf', (a, vm) => {
      need(a, 2, 'indexOf');
      if (typeof a[0] === 'string') {
        bill(vm, a[0].length);
        return a[0].indexOf(str(a[1], 'indexOf'));
      }
      if (Array.isArray(a[0])) return a[0].indexOf(a[1]);
      throw new N.NosError('indexOf 只能用于字符串或数组');
    });
    def('sort', (a, vm) => {
      need(a, 1, 'sort');
      if (!Array.isArray(a[0])) throw new N.NosError('sort 的参数必须是数组');
      const r = a[0].slice().sort((x, y) => {
        if (typeof x === 'number' && typeof y === 'number') return x - y;
        return tostr(x) < tostr(y) ? -1 : tostr(x) > tostr(y) ? 1 : 0;
      });
      bill(vm, r.length * 8);
      return r;
    });
    def('reverse', (a) => { need(a, 1, 'reverse'); return a[0].slice().reverse(); });

    // 映射
    def('keys', (a) => { need(a, 1, 'keys'); if (!isMap(a[0])) throw new N.NosError('keys 需要映射'); return Object.keys(a[0]); });
    def('has', (a) => { need(a, 2, 'has'); return isMap(a[0]) && hasOwn(a[0], String(a[1])); });
    def('del', (a) => {
      need(a, 2, 'del');
      if (isMap(a[0])) { delete a[0][String(a[1])]; return true; }
      if (Array.isArray(a[0])) { const i = a[1]; if (typeof i === 'number' && i >= 0 && i < a[0].length) a[0].splice(i, 1); return true; }
      throw new N.NosError('del 需要映射或数组');
    });

    // 字符串
    def('substr', (a, vm) => {
      need(a, 3, 'substr');
      const s = str(a[0], 'substr');
      const r = s.substr(Math.max(0, Math.floor(num(a[1], 'substr'))), Math.max(0, Math.floor(num(a[2], 'substr'))));
      bill(vm, r.length);
      return r;
    });
    def('split', (a, vm) => {
      need(a, 2, 'split');
      const r = str(a[0], 'split').split(str(a[1], 'split'));
      bill(vm, a[0].length);
      return r;
    });
    def('join', (a, vm) => {
      need(a, 2, 'join');
      if (!Array.isArray(a[0])) throw new N.NosError('join 需要数组');
      const r = a[0].map(tostr).join(str(a[1], 'join'));
      bill(vm, r.length);
      return r;
    });
    def('chr', (a) => { need(a, 1, 'chr'); return String.fromCharCode(Math.floor(num(a[0], 'chr'))); });
    def('ord', (a) => { need(a, 1, 'ord'); const s = str(a[0], 'ord'); return s.length ? s.charCodeAt(0) : 0; });
    def('upper', (a) => { need(a, 1, 'upper'); return str(a[0], 'upper').toUpperCase(); });
    def('lower', (a) => { need(a, 1, 'lower'); return str(a[0], 'lower').toLowerCase(); });
    def('trim', (a) => { need(a, 1, 'trim'); return str(a[0], 'trim').trim(); });
    def('starts', (a) => { need(a, 2, 'starts'); return str(a[0], 'starts').startsWith(str(a[1], 'starts')); });
    def('ends', (a) => { need(a, 2, 'ends'); return str(a[0], 'ends').endsWith(str(a[1], 'ends')); });
    def('repeat', (a, vm) => {
      need(a, 2, 'repeat');
      const n = Math.max(0, Math.min(100000, Math.floor(num(a[1], 'repeat'))));
      const r = str(a[0], 'repeat').repeat(n);
      bill(vm, r.length);
      return r;
    });
    def('replace', (a, vm) => {
      need(a, 3, 'replace');
      const s = str(a[0], 'replace');
      const from = str(a[1], 'replace');
      const r = from === '' ? s : s.split(from).join(str(a[2], 'replace'));
      bill(vm, s.length);
      return r;
    });
    def('fmt', (a) => {
      need(a, 2, 'fmt');
      const d = Math.max(0, Math.min(10, Math.floor(num(a[1], 'fmt'))));
      return num(a[0], 'fmt').toFixed(d);
    });

    // 数学
    const m1 = (name, f) => def(name, (a) => { need(a, 1, name); return f(num(a[0], name)); });
    m1('floor', Math.floor);
    m1('ceil', Math.ceil);
    m1('round', Math.round);
    m1('abs', Math.abs);
    m1('sqrt', (x) => Math.sqrt(Math.max(0, x)));
    m1('sin', Math.sin);
    m1('cos', Math.cos);
    m1('exp', Math.exp);
    m1('log', (x) => Math.log(Math.max(1e-300, x)));
    def('atan2', (a) => { need(a, 2, 'atan2'); return Math.atan2(num(a[0], 'atan2'), num(a[1], 'atan2')); });
    def('pow', (a) => { need(a, 2, 'pow'); return Math.pow(num(a[0], 'pow'), num(a[1], 'pow')); });
    def('min', (a) => { if (!a.length) throw new N.NosError('min 需要参数'); return Math.min(...a.map((x) => num(x, 'min'))); });
    def('max', (a) => { if (!a.length) throw new N.NosError('max 需要参数'); return Math.max(...a.map((x) => num(x, 'max'))); });
    def('clamp', (a) => {
      need(a, 3, 'clamp');
      return Math.min(num(a[2], 'clamp'), Math.max(num(a[1], 'clamp'), num(a[0], 'clamp')));
    });
    def('rand', (a, vm) => {
      need(a, 0, 'rand');
      return vm.env.rand ? vm.env.rand() : Math.random();
    });

    // 数据
    def('json', (a, vm) => {
      need(a, 1, 'json');
      const s = JSON.stringify(a[0]);
      const r = s === undefined ? 'null' : s;
      bill(vm, r.length);
      return r;
    });
    def('parse', (a, vm) => {
      need(a, 1, 'parse');
      const s = str(a[0], 'parse');
      bill(vm, s.length);
      try { return JSON.parse(s); } catch (e) { throw new N.NosError('parse 失败：' + e.message); }
    });
    def('clone', (a, vm) => {
      need(a, 1, 'clone');
      bill(vm, sizeOf(a[0]));
      return cloneValue(a[0]);
    });
    def('print', (a, vm) => {
      vm.log(a.map(tostr).join(' '));
      return null;
    });
    def('assert', (a) => {
      if (!a[0]) throw new N.NosError(a.length > 1 ? tostr(a[1]) : '断言失败');
      return null;
    });
    return lib;
  }

  const api = { makeStdlib };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NOS.stdlib = api;
})(typeof window !== 'undefined' ? window : globalThis);
