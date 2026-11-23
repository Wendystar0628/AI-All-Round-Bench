/* comp.js — 合成渲染编排：图层顺序、预合成、调整层、轨道遮罩、运动模糊、三维分组 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, M = U.M, Model = AE.Model, A2 = G.A2, Shapes = AE.Shapes;
  const R = AE.Renderer.prototype;

  const RENDERABLE3D = new Set(['shape', 'text', 'precomp', 'geo', 'particles']);
  const matteModeOf = L => { const m = L.matte; if (!m || m.mode === 'none' || !m.layer) return 0; return m.mode === 'alpha' ? (m.inv ? 3 : 1) : (m.inv ? 4 : 2); };
  R.mbOn = function (comp, L, ctx) { return !!(comp.mb && comp.mb.on && L.mb && !(ctx && ctx.noMB)); };
  R.shutter = function (comp) { const fd = 1 / comp.fps; const a = comp.mb.phase / 360 * fd, b = (comp.mb.phase + comp.mb.angle) / 360 * fd; return [a, b]; };

  // 图层内容 → premult RT（目标像素空间，经 Mt 变换；含蒙版与效果）
  R.layerContent = function (comp, L, t, Mt, W, H, scale, ctx) {
    const g = this.g, ev = this.ev; let rt = null;
    if (L.type === 'shape') { const draws = Shapes.evalShapeLayer(ev, comp, L, t, 0.3 / scale); rt = this.withMS(W, H, () => this.drawRecords(draws, Mt, W, H)); }
    else if (L.type === 'text') { const draws = Shapes.evalTextLayer(ev, comp, L, t); rt = this.withMS(W, H, () => this.drawRecords(draws, Mt, W, H)); }
    else if (L.type === 'precomp') {
      const inner = Model.comp(ev.project, L.comp); if (!inner || (ctx && ctx.depth > 8)) return null;
      const tin = ev.innerTime(comp, L, t, inner); const ls = Math.sqrt(Math.abs(Mt[0] * Mt[3] - Mt[1] * Mt[2])) || scale;
      const sw = U.clamp(Math.round(inner.w * ls), 8, 4096), sh = U.clamp(Math.round(inner.h * ls), 8, 4096);
      const subCtx = Object.assign({}, ctx, { depth: ((ctx && ctx.depth) || 0) + 1, root: false, noMB: (ctx && ctx.noMB) || this.mbOn(comp, L, ctx) });
      const sub = this.renderComp(inner, tin, sw, sh, subCtx);
      rt = this.withMS(W, H, () => this.drawTexQuad(sub.tex, [0, 0, inner.w, inner.h], Mt, W, H)); g.release(sub);
    }
    if (!rt) return null;
    if (L.masks.length) { const mt = this.maskTexture(comp, L, t, Mt, W, H, scale); if (mt) { const o = g.rt(W, H); this.pass(this.fsProg('applymask', AE.SH.applyMaskFS), o, pr => { pr.i('uTex', 0).i('uMask', 1); g.tex(0, rt.tex, this.gl.LINEAR); g.tex(1, mt.tex, this.gl.LINEAR); }); g.release(rt); g.release(mt); rt = o; } }
    if (L.effects.length) rt = this.applyEffects(comp, L, t, rt, scale);
    return rt;
  };
  // 图层局部范围（用于 3D 平面纹理）
  R.layerLocalBounds = function (comp, L, t) {
    const ev = this.ev; let bb = null;
    if (L.type === 'shape') bb = Shapes.drawsBBox(Shapes.evalShapeLayer(ev, comp, L, t, 0.5));
    else if (L.type === 'text') bb = Shapes.drawsBBox(Shapes.evalTextLayer(ev, comp, L, t));
    else if (L.type === 'precomp') { const inner = Model.comp(ev.project, L.comp); if (inner) bb = [0, 0, inner.w, inner.h]; }
    if (!bb) return null;
    let m = 0;
    for (const fx of L.effects) { if (!fx.on) continue; const q = k => ev.value(comp, L, `fx.${fx.id}.${k}`, t); if (fx.type === 'blur') m += q('radius') * 1.6; else if (fx.type === 'glow') m += q('radius') * 1.4; else if (fx.type === 'shadow') m += q('distance') + q('softness') * 1.6; }
    return [bb[0] - m - 2, bb[1] - m - 2, bb[2] + m + 2, bb[3] + m + 2];
  };
  // 3D 平面：返回 {rt, rect}
  R.layerPlane = function (comp, L, t, pxPerUnit, ctx) {
    const rect = this.layerLocalBounds(comp, L, t); if (!rect) return null;
    let s = U.clamp(pxPerUnit, 0.1, 3); const maxD = 2048; const w0 = rect[2] - rect[0], h0 = rect[3] - rect[1]; if (w0 <= 0 || h0 <= 0) return null;
    if (w0 * s > maxD) s = maxD / w0; if (h0 * s > maxD) s = maxD / h0;
    const W = Math.max(4, Math.ceil(w0 * s)), H = Math.max(4, Math.ceil(h0 * s)); const sx = W / w0, sy = H / h0;
    const Mt = [sx, 0, 0, sy, -rect[0] * sx, -rect[1] * sy];
    const rt = this.layerContent(comp, L, t, Mt, W, H, s, ctx); if (!rt) return null;
    return { rt, rect };
  };

  R.world2d = function (comp, L, t) { return M.to2d(this.ev.worldMatrix(comp, L, t)); };
  R.addAccum = function (acc, src, w) {
    const gl = this.gl, g = this.g; g.bind(acc); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
    const p = this.fsProg('copy', AE.SH.copyFS).use(); p.i('uTex', 0).f('uMul', w); g.tex(0, src.tex, gl.LINEAR); g.fullscreen(); gl.disable(gl.BLEND);
  };

  // 2D 图层渲染（含运动模糊）
  R.layer2D = function (comp, L, t, sc, W, H, ctx) {
    const g = this.g, ev = this.ev;
    const one = tt => this.layerContent(comp, L, tt, A2.mul([sc, 0, 0, sc, 0, 0], this.world2d(comp, L, tt)), W, H, sc, ctx);
    if (!this.mbOn(comp, L, ctx)) return one(t);
    const [a, b] = this.shutter(comp);
    // 判断是否有运动
    const m0 = this.world2d(comp, L, t + a), m1 = this.world2d(comp, L, t + b);
    let disp = 0; for (let i = 0; i < 6; i++) disp = Math.max(disp, Math.abs(m0[i] - m1[i]) * (i < 4 ? 100 : 1));
    const animated = Object.values(L.props).some(p => Model.isAnimated(p) || Model.hasExpr(p)) || L.type === 'precomp';
    if (disp < 0.01 && !animated) return one(t);
    const N = U.clamp(Math.ceil(disp * sc / 4) + 2, 3, comp.mb.samples || 12);
    const acc = g.rt(W, H); g.bind(acc); g.clear(0, 0, 0, 0); let any = false;
    for (let k = 0; k < N; k++) { const tk = t + a + (b - a) * (k + 0.5) / N; const rt = one(tk); if (!rt) continue; this.addAccum(acc, rt, 1 / N); g.release(rt); any = true; }
    if (!any) { g.release(acc); return null; } return acc;
  };

  // ===== 合成渲染 =====
  // ctx: {root:boolean, noMB, depth}；返回 RT（premult）
  R.renderComp = function (comp, t, W, H, ctx) {
    ctx = ctx || {}; const g = this.g, gl = this.gl, ev = this.ev; const sc = W / comp.w;
    let acc = g.rt(W, H); g.bind(acc); if (ctx.root) g.clear(comp.bg[0], comp.bg[1], comp.bg[2], 1); else g.clear(0, 0, 0, 0);
    const layers = comp.layers; const anySolo = layers.some(l => l.solo);
    const matteSrc = new Set(); for (const L of layers) if (matteModeOf(L)) matteSrc.add(L.matte.layer);
    const act = L => ev.active(L, t) && (!anySolo || L.solo);
    const flip = (src) => { /* 把 src 合成到 acc（normal）后释放 */ };
    const put = (rt, L, opacity, blendOverride) => {
      let matte = null; const mm = L ? matteModeOf(L) : 0;
      if (mm) { const ML = Model.layer(comp, L.matte.layer); if (ML) matte = this.layer2D(comp, ML, t, sc, W, H, ctx); }
      const out = g.rt(W, H);
      this.composite(acc, rt, out, { blend: blendOverride || (L ? L.blend : 'normal'), opacity, matte, matteMode: matte ? mm : 0 });
      g.release(acc); acc = out; if (matte) g.release(matte); g.release(rt);
    };
    // 自底向上
    let i = layers.length - 1;
    while (i >= 0) {
      const L = layers[i];
      if (RENDERABLE3D.has(L.type) && L.is3D) {
        // 收集连续的 3D 图层（跳过非渲染类型）
        const group = []; let j = i;
        while (j >= 0) { const X = layers[j]; if (RENDERABLE3D.has(X.type) && X.is3D) { if (act(X) && !matteSrc.has(X.id)) group.push(X); j--; } else if (X.type === 'null' || X.type === 'camera' || X.type === 'light' || X.type === 'audio') j--; else break; }
        if (group.length) { const rt = this.render3DGroup(comp, t, group, W, H, ctx); if (rt) put(rt, null, 1, 'normal'); }
        i = j; continue;
      }
      i--;
      if (!act(L) || matteSrc.has(L.id)) continue;
      if (L.type === 'null' || L.type === 'camera' || L.type === 'light' || L.type === 'audio') continue;
      if (L.type === 'adjust') {
        const opa = ev.value(comp, L, 'transform.opacity', t) / 100; if (opa <= 0) continue;
        const cp = g.rt(W, H); this.copy(acc, cp); const fx = this.applyEffects(comp, L, t, cp, sc);
        const Mt = A2.mul([sc, 0, 0, sc, 0, 0], this.world2d(comp, L, t)); const mt = L.masks.length ? this.maskTexture(comp, L, t, Mt, W, H, sc) : null;
        const out = g.rt(W, H); this.pass(this.fsProg('adj', AE.SH.adjFS), out, pr => { pr.i('uDst', 0).i('uFx', 1).i('uMask', 2).f('uAmt', opa).i('uUseMask', mt ? 1 : 0); g.tex(0, acc.tex, gl.NEAREST); g.tex(1, fx.tex, gl.LINEAR); g.tex(2, mt ? mt.tex : g.dummy2D, gl.LINEAR); });
        g.release(acc); g.release(fx); if (mt) g.release(mt); acc = out; continue;
      }
      const rt = this.layer2D(comp, L, t, sc, W, H, ctx); if (!rt) continue;
      put(rt, L, ev.value(comp, L, 'transform.opacity', t) / 100);
    }
    g.trimPool();
    return acc;
  };
})();
