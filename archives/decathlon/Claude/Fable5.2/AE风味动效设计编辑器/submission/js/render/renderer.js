// 合成渲染：图层栈合成、调整层、轨道遮罩、预合成与时间重映射、三维图层组、运动模糊、显示
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const S = () => MF.Scene, V = (p, t) => MF.Eval.val(p, t);
  const FS_PRESENT = `#version 300 es
  precision highp float; in vec2 vUV; uniform sampler2D uT0; uniform vec4 uRect; uniform vec2 uCanvas; uniform vec3 uBg; uniform vec3 uPanel; uniform float uChecker; uniform float uHasTex; out vec4 o;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){ vec2 px = vec2(vUV.x, 1. - vUV.y) * uCanvas; vec2 uv = (px - uRect.xy) / uRect.zw;
    vec3 c = uPanel;
    if (uv.x >= 0. && uv.x <= 1. && uv.y >= 0. && uv.y <= 1.) {
      vec3 bg = uBg; if (uChecker > 0.5) { vec2 q = floor(px / 9.); bg = mod(q.x + q.y, 2.) < 0.5 ? vec3(0.17) : vec3(0.23); }
      vec4 s = uHasTex > 0.5 ? texture(uT0, uv) : vec4(0.); c = s.rgb + bg * (1. - clamp(s.a, 0., 1.));
      c += (h(px) - 0.5) / 255.;
    } else { vec2 d = max(max(uRect.xy - px, px - (uRect.xy + uRect.zw)), 0.); float sh = exp(-length(d) / 14.) * 0.35; c = uPanel * (1. - sh); }
    o = vec4(c, 1.); }`;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.x = new MF.GLX(canvas); this.gl = this.x.gl; this.r2d = new MF.R2D(this.x); this.r3d = new MF.R3D(this.x, this.r2d);
      this.stats = { ms: 0, layers: 0 }; this.depth = 0; this.quality = { mbSamples: 0 };
    }
    // 渲染合成到纹理（调用方负责 release）
    renderComp(comp, t, rs, depth) {
      const x = this.x, r2d = this.r2d, gl = this.gl; depth = depth || 0;
      const W = Math.max(1, Math.round(comp.w * rs)), H = Math.max(1, Math.round(comp.h * rs));
      let acc = x.target(W, H, 'rgba16f'); x.clear(acc, 0, 0, 0, 0);
      if (depth > 6) return acc;
      const layers = comp.layers; const matteSrc = new Set();
      for (let i = 1; i < layers.length; i++) if (layers[i].matte && layers[i].matte !== 'none') matteSrc.add(layers[i - 1].id);
      const ctx = { comp, t, rs, W, H, depth };
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i]; if (!S().isActive(L, t) || matteSrc.has(L.id)) continue;
        const ty = L.type; if (ty === 'null' || ty === 'camera' || ty === 'light' || ty === 'audio') continue;
        if (S().is3DLayer(L)) {
          const bin = [L]; let j = i - 1;
          for (; j >= 0; j--) { const M = layers[j]; const mt = M.type; if (mt === 'null' || mt === 'camera' || mt === 'light' || mt === 'audio') continue; if (!S().is3DLayer(M)) break; if (S().isActive(M, t) && !matteSrc.has(M.id)) bin.push(M); }
          i = j + 1;
          const tex = this.render3D(ctx, bin); acc = r2d.composite(acc, tex, 1, 'normal'); x.release(tex); this.stats.layers += bin.length; continue;
        }
        if (ty === 'adjust') {
          const op = V(L.tr.opacity, t) / 100; if (op <= 0 || !L.fx.some((f) => f.on !== false)) continue;
          let copy = x.target(W, H, 'rgba16f'); gl.disable(gl.BLEND); x.blit(acc, copy); copy = r2d.applyEffects(copy, L.fx, t, rs);
          let mask = null; if (L.masks.length) { const wm = S().worldMatrix(comp, L, t); mask = r2d.maskTexture(L, t, [wm[0] * rs, wm[1] * rs, wm[4] * rs, wm[5] * rs, wm[12] * rs, wm[13] * rs], W, H, rs); }
          acc = r2d.adjust(acc, copy, mask, op); x.release(copy); if (mask) x.release(mask); this.stats.layers++; continue;
        }
        let tex = this.layer2D(ctx, L);
        if (L.matte && L.matte !== 'none' && i > 0) {
          const ML = layers[i - 1];
          if (t >= ML.in && t < ML.out && ML.type !== 'null' && ML.type !== 'camera' && ML.type !== 'light' && ML.type !== 'audio' && !S().is3DLayer(ML) && ML.type !== 'adjust') {
            let mt = this.layer2D(ctx, ML); const mo = V(ML.tr.opacity, t) / 100;
            if (mo < 0.999) { const tmp = x.target(W, H, 'rgba16f'); x.clear(tmp, 0, 0, 0, 0); r2d.composite(tmp, mt, mo, 'normal'); x.release(mt); mt = tmp; }
            tex = r2d.matte(tex, mt, L.matte); x.release(mt);
          }
        }
        acc = r2d.composite(acc, tex, V(L.tr.opacity, t) / 100, L.blend); x.release(tex); this.stats.layers++;
      }
      return acc;
    }
    shutter(comp, t, s, N) { const mb = comp.mb; const start = t + mb.phase / 360 / comp.fps, dur = mb.angle / 360 / comp.fps; return start + ((s + 0.5) / N) * dur; }
    mbSamples(comp) { return Math.max(2, Math.min(64, this.quality.mbSamples || comp.mb.samples || 8)); }
    // 图层在快门区间内是否有运动
    moves(comp, L, t) {
      const t0 = this.shutter(comp, t, 0, 2), t1 = this.shutter(comp, t, 1, 2);
      const a = S().worldMatrix(comp, L, t0), b = S().worldMatrix(comp, L, t1); for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-5) return true;
      const key = 'anim' + L.id; const animated = S().memo(key, 0, () => /"(k|x)":/.test(JSON.stringify([L.items, L.text, L.masks, L.remap, L.src && L.src.remapOn])));
      return animated;
    }
    layer2D(ctx, L) {
      const { comp, t, rs, W, H } = ctx, x = this.x, r2d = this.r2d;
      let pre = null;
      if (L.type === 'precomp') { const sc = MF.Model.getComp(MF.Eval.project, L.src.comp); if (sc && sc !== comp) pre = { comp: sc, tex: this.renderComp(sc, S().sourceTime(L, t), rs, ctx.depth + 1) }; }
      let tex;
      if (comp.mb.on && L.mb && this.moves(comp, L, t)) {
        const N = this.mbSamples(comp); tex = x.target(W, H, 'rgba16f'); x.clear(tex, 0, 0, 0, 0);
        for (let s = 0; s < N; s++) { const one = this.raster(ctx, L, this.shutter(comp, t, s, N), pre); r2d.accumulate(tex, one, 1 / N); x.release(one); }
      } else tex = this.raster(ctx, L, t, pre);
      if (pre) x.release(pre.tex);
      if (L.fx.some((f) => f.on !== false && !MF.Schema.effects[f.type].ctl)) tex = r2d.applyEffects(tex, L.fx, t, rs);
      return tex;
    }
    // 把图层内容光栅化到合成空间（含蒙版）
    raster(ctx, L, ts, pre) {
      const { comp, rs, W, H } = ctx, r2d = this.r2d, x = this.x;
      const wm = S().worldMatrix(comp, L, ts); const m = [wm[0] * rs, wm[1] * rs, wm[4] * rs, wm[5] * rs, wm[12] * rs, wm[13] * rs];
      r2d.begin(W, H); this.drawContent(comp, L, ts, m, pre);
      let tex = r2d.end();
      if (L.masks.length) { const mk = r2d.maskTexture(L, ts, m, W, H, rs); if (mk) { tex = r2d.applyMask(tex, mk); x.release(mk); } }
      return tex;
    }
    drawContent(comp, L, ts, m, pre) {
      const r2d = this.r2d;
      if (L.type === 'shape') r2d.drawItems(S().shape(comp, L, ts).items, m);
      else if (L.type === 'text') r2d.drawItems(this.textItems(comp, L, ts), m);
      else if (L.type === 'precomp' && pre) r2d.drawTexQuad(pre.tex, [0, 0, pre.comp.w, pre.comp.h], m, 1);
    }
    textItems(comp, L, ts) {
      const tx = S().text(comp, L, ts); const items = [];
      for (let i = tx.chars.length - 1; i >= 0; i--) { const c = tx.chars[i]; if (!c.contours.length || c.opacity <= 0) continue; items.push({ kind: 'fill', contours: c.contours, color: tx.fill, opacity: c.opacity, rule: 'nonzero' }); if (tx.strokeWidth > 0) items.push({ kind: 'stroke', contours: c.contours, color: tx.stroke, opacity: c.opacity, width: tx.strokeWidth, cap: 'round', join: 'round' }); }
      return items;
    }
    // 三维平面图层：在图层自身空间光栅化（含蒙版与效果），返回纹理与矩形
    layerLocal(ctx, L, ts, cam) {
      const { comp, rs } = ctx, r2d = this.r2d, x = this.x; const t = ctx.t;
      let b = S().contentBounds(comp, L, ts); let pad = 2;
      for (const f of L.fx) { if (f.on === false) continue; if (f.type === 'blur') pad += V(f.p.radius, t) * 1.5; else if (f.type === 'glow') pad += V(f.p.radius, t) * 3; else if (f.type === 'shadow') pad += V(f.p.distance, t) + V(f.p.softness, t) * 1.5; }
      const rect = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]; const rw = Math.max(1, rect[2] - rect[0]), rh = Math.max(1, rect[3] - rect[1]);
      const wm = S().worldMatrix(comp, L, ts); const c = MF.M4.tp(wm, [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2, 0]);
      const pr = S().project(comp, cam, c); const sc = Math.sqrt(Math.abs(wm[0] * wm[5] - wm[1] * wm[4])) || 1;
      let k = (pr ? cam.zoom / pr[2] : 1) * sc * rs * 1.25; k = MF.clamp(k, 0.05, Math.min(6, 4096 / Math.max(rw, rh)));
      const TW = Math.max(2, Math.ceil(rw * k)), TH = Math.max(2, Math.ceil(rh * k)); const m = [k, 0, 0, k, -rect[0] * k, -rect[1] * k];
      let pre = null; if (L.type === 'precomp') { const scp = MF.Model.getComp(MF.Eval.project, L.src.comp); if (scp && scp !== comp) pre = { comp: scp, tex: this.renderComp(scp, S().sourceTime(L, t), Math.min(2, Math.max(0.1, k)), ctx.depth + 1) }; }
      r2d.begin(TW, TH); this.drawContent(comp, L, ts, m, pre); let tex = r2d.end(); if (pre) x.release(pre.tex);
      if (L.masks.length) { const mk = r2d.maskTexture(L, ts, m, TW, TH, k); if (mk) { tex = r2d.applyMask(tex, mk); x.release(mk); } }
      if (L.fx.some((f) => f.on !== false && !MF.Schema.effects[f.type].ctl)) tex = r2d.applyEffects(tex, L.fx, t, k);
      return { tex, rect, center: c };
    }
    buildScene(ctx, bin, ts) {
      const { comp, t, rs, W, H } = ctx; const camT = S().cameraInfo(comp, t); const env = comp.env || {};
      const scene = { W, H, rs, cam: { vp: scaleVP(camT.vp), pos: camT.pos, zoom: camT.zoom, near: camT.near, far: camT.far, focus: camT.focus, aperture: camT.aperture }, lights: S().lights(comp, t), env: { preset: env.preset || 'studio', intensity: env.intensity === undefined ? 1 : env.intensity, rotation: env.rotation || 0, exposure: env.exposure === undefined ? 1 : env.exposure }, objects: [], temps: [] };
      scene.focus = MF.V3.add(camT.pos, MF.V3.mul(camT.fwd, camT.focus));
      for (const L of bin) {
        const tl = L.mb && comp.mb.on ? ts : t; const cam = tl === t ? camT : S().cameraInfo(comp, tl);
        const vp = tl === t ? null : scaleVP(cam.vp), camPos = tl === t ? null : cam.pos; const op = V(L.tr.opacity, tl) / 100;
        if (L.type === 'geo') {
          const mesh = MF.Nodes.layerGeo(comp, L, tl); if (!mesh || !mesh.idx.length) continue; const p = L.geo.p;
          const model = S().worldMatrix(comp, L, tl); const bb = mesh._bb || (mesh._bb = MF.Solid.bbox(mesh));
          const mo = (V(p.opacity, tl) / 100) * op; if (mo <= 0.001) continue;
          scene.objects.push({ kind: 'mesh', layer: L, mesh, model, vp, camPos, cast: !!L.geo.s.cast && mo > 0.5, receive: !!L.geo.s.receive, center: MF.M4.tp(model, [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2]),
            mat: { baseColor: V(p.baseColor, tl), metallic: MF.clamp(V(p.metallic, tl), 0, 1), roughness: MF.clamp(V(p.roughness, tl), 0.02, 1), emissive: V(p.emissive, tl), emissiveInt: Math.max(0, V(p.emissiveInt, tl)), heatGlow: Math.max(0, V(p.heatGlow, tl)), opacity: mo } });
        } else if (L.type === 'particles') {
          const data = MF.Particles.sample(comp, L, tl); if (!data.count && !data.segCount) continue;
          scene.objects.push({ kind: 'particles', layer: L, data, vp, camPos, opacity: op, center: MF.V3.add(camT.pos, MF.V3.mul(camT.fwd, 1)) });
        } else {
          if (op <= 0.001) continue; const lr = this.layerLocal(ctx, L, tl, cam); scene.temps.push(lr.tex);
          scene.objects.push({ kind: 'plane', layer: L, tex: lr.tex, rect: lr.rect, model: S().worldMatrix(comp, L, tl), vp, camPos, opacity: op, cast: false, receive: !!L.receiveShadow, center: lr.center });
        }
      }
      return scene;
    }
    render3D(ctx, bin) {
      const { comp, t, W, H } = ctx, x = this.x, r2d = this.r2d;
      let N = 1;
      if (comp.mb.on && bin.some((L) => L.mb)) {
        const t0 = this.shutter(comp, t, 0, 2), t1 = this.shutter(comp, t, 1, 2); let moving = false;
        const c0 = S().cameraInfo(comp, t0).vp, c1 = S().cameraInfo(comp, t1).vp; for (let i = 0; i < 16; i++) if (Math.abs(c0[i] - c1[i]) > 1e-7) moving = true;
        if (!moving) for (const L of bin) { if (!L.mb) continue; if (L.type === 'particles') { moving = true; break; } if (this.moves(comp, L, t)) { moving = true; break; } if (L.type === 'geo') { const term = MF.Nodes.terminalOf(comp, L.id); if (term && MF.Nodes.sig(MF.Nodes.top(comp), term, t0) !== MF.Nodes.sig(MF.Nodes.top(comp), term, t1)) { moving = true; break; } const p0 = JSON.stringify(Object.keys(L.geo.p).map((k) => V(L.geo.p[k], t0))), p1 = JSON.stringify(Object.keys(L.geo.p).map((k) => V(L.geo.p[k], t1))); if (p0 !== p1) { moving = true; break; } } }
        if (moving) N = this.mbSamples(comp);
      }
      if (N === 1) { const scene = this.buildScene(ctx, bin, t); const tex = this.r3d.render(scene); for (const tt of scene.temps) x.release(tt); return tex; }
      const acc = x.target(W, H, 'rgba16f'); x.clear(acc, 0, 0, 0, 0);
      for (let s = 0; s < N; s++) { const scene = this.buildScene(ctx, bin, this.shutter(comp, t, s, N)); const one = this.r3d.render(scene); for (const tt of scene.temps) x.release(tt); r2d.accumulate(acc, one, 1 / N); x.release(one); }
      return acc;
    }
    // 把合成结果显示到画布：view = {x, y, scale}（合成像素 → 画布像素）
    present(tex, comp, view, opts) {
      const gl = this.gl, x = this.x; opts = opts || {};
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
      const p = x.full('present', FS_PRESENT); x.use(p);
      x.tex(0, tex ? tex.tex : null); gl.uniform1i(p.u.uT0, 0); gl.uniform1f(p.u.uHasTex, tex ? 1 : 0);
      const cw = comp ? comp.w : 0, ch = comp ? comp.h : 0;
      gl.uniform4f(p.u.uRect, view.x, view.y, cw * view.scale, ch * view.scale); gl.uniform2f(p.u.uCanvas, this.canvas.width, this.canvas.height);
      const bg = comp ? comp.bg : [0, 0, 0]; gl.uniform3f(p.u.uBg, bg[0], bg[1], bg[2]); const pn = opts.panel || [0.075, 0.073, 0.072]; gl.uniform3f(p.u.uPanel, pn[0], pn[1], pn[2]); gl.uniform1f(p.u.uChecker, opts.checker ? 1 : 0);
      gl.bindVertexArray(x.quad); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    }
    // 一帧：渲染并显示
    frame(comp, t, view, opts) {
      const t0 = performance.now(); this.stats.layers = 0; let tex = null;
      if (comp) { const rs = MF.clamp((opts && opts.rs) || 1, 0.05, 2); tex = this.renderComp(comp, t, rs, 0); }
      this.present(tex, comp, view, opts); if (tex) this.x.release(tex);
      this.r3d.gc(); this.stats.ms = performance.now() - t0; this.stats.targets = this.x.live;
    }
    // 读取合成某像素（调试/测试用），返回 [r,g,b,a]（0..1，预乘）
    readPixels(comp, t, rs, pts) {
      const gl = this.gl; const tex = this.renderComp(comp, t, rs, 0); this.x.bind(tex); const out = [];
      for (const p of pts) { const buf = new Float32Array(4); gl.readPixels(Math.round(p[0] * rs), Math.round(p[1] * rs), 1, 1, gl.RGBA, gl.FLOAT, buf); out.push(Array.from(buf)); }
      this.x.release(tex); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return out;
    }
  }
  // 摄像机 VP：合成像素坐标 → NDC 已由投影矩阵完成（x 右、y 下不翻转）
  function scaleVP(vp) { return vp; }
  MF.Renderer = Renderer;
})();
