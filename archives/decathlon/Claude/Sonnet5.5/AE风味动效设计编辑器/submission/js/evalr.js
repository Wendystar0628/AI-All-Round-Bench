/* evalr.js — 求值器：属性(含表达式)、变换/父级、摄像机、灯光 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, M = U.M, Model = AE.Model;

  class Evaluator {
    constructor(getProject, getRev) {
      this.getProject = getProject; this.getRev = getRev || (() => 0); this.rev = -1;
      this.cache = new Map(); this.fcache = new Map(); this.stack = []; this.errors = new Map(); this._tmp = null;
    }
    get project() { return this.getProject(); }
    _sync() { const r = this.getRev(); if (r !== this.rev) { this.rev = r; this.cache.clear(); this.fcache.clear(); this.errors.clear(); this._tmp = null; } }
    invalidate() { this.rev = -1; this._sync(); }
    errorOf(owner, key) { return this.errors.get(owner.id + '|' + key) || null; }

    // 属性最终值（含表达式）
    value(comp, owner, key, t, noExpr) {
      this._sync();
      const p = owner.props[key]; if (!p) return undefined;
      const info = Model.propInfo(owner, key);
      if (noExpr || !Model.hasExpr(p) || info.type === 'path') return Model.evalKeys(p, t, info);
      const ck = comp.id + '|' + owner.id + '|' + key + '|' + t.toFixed(6);
      if (this.cache.has(ck)) return this.cache.get(ck);
      const frame = owner.id + '|' + key + '@' + t.toFixed(6);
      const ek = owner.id + '|' + key;
      const base = Model.evalKeys(p, t, info);
      const base0 = Array.isArray(base) ? base.slice() : base;
      if (this.stack.includes(frame)) {
        const chain = this.stack.slice(this.stack.indexOf(frame)).map(f => f.split('@')[0]).concat(frame.split('@')[0]);
        throw new AE.Expr.CycleError('循环引用：' + chain.map(c => this.pretty(c)).join(' → '), frame, chain);
      }
      if (this.stack.length > 48) throw new AE.Expr.ExprError('表达式递归过深');
      this.stack.push(frame);
      let res;
      try {
        let r = AE.Expr.run(this, comp, owner, key, p, base0, t, info);
        r = this.coerce(r, base0, info);
        this.errors.delete(ek); res = r; this.cache.set(ck, r);
      } catch (e) {
        const msg = e instanceof AE.Expr.CycleError || e instanceof AE.Expr.ExprError ? e.message : '表达式错误：' + (e && e.message);
        this.errors.set(ek, msg);
        if (e instanceof AE.Expr.CycleError && e.head !== frame) { this.stack.pop(); throw e; }
        res = base0; this.cache.set(ck, res);
      }
      this.stack.pop();
      return res;
    }
    pretty(id) { const [oid, ...k] = id.split('|'); const key = k.join('|'); const proj = this.project; for (const c of proj.comps) { const L = c.layers.find(l => l.id === oid); if (L) return `${L.name}.${(Model.propInfo(L, key).label || key)}`; } const n = proj.graph.nodes.find(n => n.id === oid); return n ? `${n.name}.${key}` : id; }
    coerce(r, base, info) {
      r = AE.Expr.unwrap(r);
      const type = info.type;
      if (type === 'num') { if (Array.isArray(r)) r = r[0]; if (typeof r === 'string') r = parseFloat(r); if (typeof r === 'boolean') r = r ? 1 : 0; if (typeof r !== 'number' || !isFinite(r)) throw new AE.Expr.ExprError('表达式结果不是有效数值'); return r; }
      if (type === 'vec' || type === 'color') {
        const n = Array.isArray(base) ? base.length : (info.dim || 3);
        if (typeof r === 'number') r = new Array(n).fill(r);
        if (!Array.isArray(r)) throw new AE.Expr.ExprError('表达式结果不是向量');
        r = r.map(x => { const v = typeof x === 'object' ? +x : x; if (typeof v !== 'number' || !isFinite(v)) throw new AE.Expr.ExprError('表达式结果含无效数值'); return v; });
        while (r.length < n) r.push(Array.isArray(base) ? base[r.length] : 0);
        return r.slice(0, n);
      }
      return r;
    }
    // 批量读取
    v(comp, L, key, t) { return this.value(comp, L, key, t); }

    // ===== 变换 =====
    local(comp, L, t) {
      const g = k => this.value(comp, L, k, t);
      return { anchor: g('transform.anchor'), pos: g('transform.position'), scale: g('transform.scale'), rot: g('transform.rotation'), rotX: g('transform.rotX'), rotY: g('transform.rotY'), opacity: g('transform.opacity') };
    }
    ownFrame(comp, L, t, m3) {
      const l = this.local(comp, L, t);
      if (m3) { const R = M.rotXYZ(l.rotX || 0, l.rotY || 0, l.rot || 0); return M.mul(M.translate(l.pos[0], l.pos[1], l.pos[2] || 0), M.mul(R, M.scale(l.scale[0] / 100, l.scale[1] / 100, (l.scale[2] === undefined ? 100 : l.scale[2]) / 100))); }
      return M.mul(M.translate(l.pos[0], l.pos[1], 0), M.mul(M.rotZ((l.rot || 0) * U.DEG), M.scale(l.scale[0] / 100, l.scale[1] / 100, 1)));
    }
    // 图层框架（含父级，不含锚点补偿）
    frame(comp, L, t, m3) {
      this._sync();
      const ck = comp.id + '|' + L.id + '|' + t.toFixed(6) + '|' + (m3 ? 1 : 0);
      let f = this.fcache.get(ck); if (f) return f;
      const guard = this._fg = (this._fg || 0) + 1;
      try {
        if (guard > 64) return M.id();
        const mine = this.ownFrame(comp, L, t, m3 && L.is3D);
        const P = L.parent ? Model.layer(comp, L.parent) : null;
        f = P && P !== L ? M.mul(this.frame(comp, P, t, m3 && P.is3D && L.is3D), mine) : mine;
      } finally { this._fg--; }
      this.fcache.set(ck, f); return f;
    }
    // 图层局部坐标 → 合成坐标
    worldMatrix(comp, L, t) {
      const m3 = !!L.is3D; const f = this.frame(comp, L, t, m3);
      const a = this.value(comp, L, 'transform.anchor', t);
      return M.mul(f, M.translate(-a[0], -a[1], m3 ? -(a[2] || 0) : 0));
    }
    parentFrame(comp, L, t, m3) { const P = L.parent ? Model.layer(comp, L.parent) : null; return P ? this.frame(comp, P, t, m3 && P.is3D) : M.id(); }

    // ===== 可见性 / 时间 =====
    active(L, t) { return L.visible && t >= L.in - 1e-9 && t < L.out - 1e-9; }
    innerTime(comp, L, t, inner) {
      let tin;
      if (L.remap && L.remap.on) tin = this.value(comp, L, 'remap.t', t);
      else { const sp = (L.stretch === undefined ? 100 : L.stretch) / 100; tin = sp >= 0 ? (t - L.start) * sp : inner.dur + (t - L.start) * sp; }
      return U.clamp(tin, 0, Math.max(0, inner.dur - 1e-4));
    }

    // ===== 摄像机 =====
    activeCamera(comp, t) { return comp.layers.find(l => l.type === 'camera' && this.active(l, t)) || null; }
    cameraData(comp, t) {
      const C = this.activeCamera(comp, t);
      if (!C) { const fov = 30; const d = comp.h / 2 / Math.tan(fov / 2 * U.DEG); return { layer: null, pos: [comp.w / 2, comp.h / 2, -d], target: [comp.w / 2, comp.h / 2, 0], fov, focus: d, aperture: 0, roll: 0, dof: false }; }
      const pf = this.parentFrame(comp, C, t, true);
      const pos0 = this.value(comp, C, 'transform.position', t), tg0 = this.value(comp, C, 'cam.target', t);
      return { layer: C, pos: M.pt(pf, [pos0[0], pos0[1], pos0[2] || 0]), target: M.pt(pf, [tg0[0], tg0[1], tg0[2] || 0]), fov: this.value(comp, C, 'cam.fov', t), focus: this.value(comp, C, 'cam.focus', t), aperture: this.value(comp, C, 'cam.aperture', t), roll: this.value(comp, C, 'cam.roll', t), dof: !!(C.cam && C.cam.dof) };
    }
    cameraMatrices(comp, t, aspect, near, far) {
      const c = this.cameraData(comp, t);
      near = near || 10; far = far || 40000;
      const f = U.V.norm(U.V.sub(c.target, c.pos));
      let hint = [0, 1, 0]; if (Math.abs(f[1]) > 0.9995) hint = [0, 0, 1];
      let r = U.V.norm(U.V.cross(hint, f)); let d = U.V.cross(f, r);
      if (c.roll) { const a = c.roll * U.DEG, ca = Math.cos(a), sa = Math.sin(a); const r2 = r.map((x, i) => x * ca + d[i] * sa), d2 = d.map((x, i) => -r[i] * sa + d[i] * ca); r = r2; d = d2; }
      const pos = c.pos;
      const view = [r[0], d[0], f[0], 0, r[1], d[1], f[1], 0, r[2], d[2], f[2], 0, -U.V.dot(r, pos), -U.V.dot(d, pos), -U.V.dot(f, pos), 1];
      const th = Math.tan(c.fov / 2 * U.DEG); const A = (far + near) / (far - near), B = -2 * far * near / (far - near);
      const proj = [1 / (th * aspect), 0, 0, 0, 0, -1 / th, 0, 0, 0, 0, A, 1, 0, 0, B, 0];
      return { view, proj, vp: M.mul(proj, view), pos, fwd: f, right: r, down: d, tanHalf: th, aspect, near, far, focus: c.focus, aperture: c.dof ? c.aperture : 0, cam: c };
    }
    // ===== 灯光 =====
    lights(comp, t) {
      const out = [];
      for (const L of comp.layers) {
        if (L.type !== 'light' || !this.active(L, t)) continue;
        const pf = this.parentFrame(comp, L, t, true); const p0 = this.value(comp, L, 'transform.position', t), t0 = this.value(comp, L, 'light.target', t);
        const pos = M.pt(pf, [p0[0], p0[1], p0[2] || 0]), tg = M.pt(pf, [t0[0], t0[1], t0[2] || 0]);
        const col = this.value(comp, L, 'light.color', t), inten = this.value(comp, L, 'light.intensity', t);
        out.push({ layer: L, type: L.light.type, pos, target: tg, dir: U.V.norm(U.V.sub(tg, pos)), color: [col[0] * inten, col[1] * inten, col[2] * inten], shadow: !!L.light.shadow, soft: this.value(comp, L, 'light.soft', t), radius: this.value(comp, L, 'light.radius', t) });
      }
      return out;
    }
  }
  AE.Evaluator = Evaluator;
})();
