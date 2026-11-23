/* ============================================================
   composite.js — 合成：图层遍历、蒙版/轨道遮罩、特效、混合、
                  预合成、三维组（含运动模糊与景深）、调整层
   ============================================================ */
(function (global) {
  'use strict';

  const C = { RS: 1 };
  const S = {};

  function ensure(key, w, h, opts) {
    if (!S[key]) S[key] = R.createFBO(w, h, opts);
    else S[key] = R.resizeFBO(S[key], w, h, opts);
    return S[key];
  }

  /* ---------------- 主入口 ---------------- */
  function render(comp, time, opts = {}) {
    const RS = opts.RS || C.RS || 1;
    const W = Math.max(2, Math.round(comp.w * RS)), H = Math.max(2, Math.round(comp.h * RS));
    S.acc = ensure('acc', W, H);
    R.drawBackground(S.acc, comp, time);
    const ev = EVAL.evaluateComp(comp, time);
    const layers = ev.layers;
    let i = 0;
    while (i < layers.length) {
      const item = layers[i];
      const L = item.layer;
      if (L.threeD) {
        const group = [];
        while (i < layers.length && layers[i].layer.threeD) { group.push(layers[i]); i++; }
        render3DGroup(comp, ev.state, group, time, W, H, RS);
        continue;
      }
      i++;
      if (L.type === 'adjust') { applyAdjustment(comp, ev.state, L, time, W, H, RS); continue; }
      if (L.type === 'precomp') { renderPrecomp(comp, ev.state, L, item, time, W, H, RS); continue; }
      if (L.type === 'shape' || L.type === 'text') { render2DLayer(comp, ev.state, L, time, W, H, RS); continue; }
    }
    return { fbo: S.acc, w: W, h: H, ev };
  }

  /* ---------------- 二维图层 ---------------- */
  function render2DLayer(comp, st, L, time, W, H, RS) {
    const mb = comp.mb && comp.mb.on && L.mb;
    const shutter = comp.mb ? (comp.mb.shutter / 360) / comp.fps : 0;
    const samples = mb ? Math.min(8, Math.max(2, comp.mb.samples || 5)) : 1;
    let cv;
    try {
      cv = R2.renderLayer2D(comp, L, st, time, RS, { mb, mbSamples: samples, shutter });
    } catch (e) { console.warn('图层渲染失败', L.name, e); return; }
    if (!cv) return;
    let canvas = cv.canvas;
    // 蒙版
    if (L.masks && L.masks.length) {
      const mk = R2.buildMask(comp, L, st, time, cv.w, cv.h, RS, cv.x, cv.y);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.globalAlpha = 1;
      ctx.drawImage(mk, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      R2.releaseCanvas(mk);
    }
    // 轨道遮罩
    if (L.matte) {
      const matteLayer = comp.layers.find(l => l.id === L.matte);
      if (matteLayer) {
        const mres = renderLayerToCanvas(comp, st, matteLayer, time, W, H, RS, { forceRect: [cv.x, cv.y, cv.w, cv.h] });
        if (mres) {
          const mctx = mres.getContext('2d');
          if (L.matteType === 'luma') {
            const id = mctx.getImageData(0, 0, mres.width, mres.height);
            const d = id.data;
            for (let k = 0; k < d.length; k += 4) {
              const lum = (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) / 255;
              d[k + 3] = Math.round(d[k + 3] * (L.matteInvert ? 1 - lum : lum));
            }
            mctx.putImageData(id, 0, 0);
          } else if (L.matteInvert) {
            const id = mctx.getImageData(0, 0, mres.width, mres.height);
            const d = id.data;
            for (let k = 0; k < d.length; k += 4) d[k + 3] = 255 - d[k + 3];
            mctx.putImageData(id, 0, 0);
          }
          const ctx = canvas.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(mres, 0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-over';
          R2.releaseCanvas(mres);
        }
      }
    }
    // 上传并应用特效
    const fw = cv.w * RS, fh = cv.h * RS;
    const texFBO = ensure('layerTex', fw, fh);
    R.uploadTo(texFBO, canvas);
    R2.releaseCanvas(canvas);
    let fx = texFBO;
    if (L.effects && L.effects.length) {
      fx = R.applyEffects(texFBO, L.effects, fw, fh, { a: ensure('fxA', fw, fh), b: ensure('fxB', fw, fh), c: ensure('fxC', fw, fh), d: ensure('fxD', fw, fh) });
    }
    // 合成
    const rect = [cv.x * RS, cv.y * RS, cv.w * RS, cv.h * RS];
    const op = U.clamp(st.getProp(L, ['transform', 'opacity']) / 100, 0, 1);
    if (op <= 0.001) return;
    const tmp = ensure('compTmp', W, H);
    R.blit(tmp, fx.tex, { dstTex: S.acc.tex, opacity: op, blend: L.blend || 'normal' });
    const t = S.acc; S.acc = tmp; S.compTmp = t;
  }

  // 把图层渲染成整幅 comp 画布（用于遮罩/预合成/输出）
  function renderLayerToCanvas(comp, st, L, time, W, H, RS, opts = {}) {
    const cv = R2.getCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (opts.forceRect) {
      const r = opts.forceRect;
      const sub = R2.renderLayer2D(comp, L, st, time, RS, {});
      if (sub) {
        ctx.drawImage(sub.canvas, (sub.x - r[0]) * RS, (sub.y - r[1]) * RS);
        R2.releaseCanvas(sub.canvas);
      }
      return cv;
    }
    if (L.type === 'shape' || L.type === 'text') {
      const sub = R2.renderLayer2D(comp, L, st, time, RS, {});
      if (sub) {
        ctx.drawImage(sub.canvas, sub.x * RS, sub.y * RS);
        R2.releaseCanvas(sub.canvas);
      }
    } else if (L.type === 'precomp') {
      const pc = comp.comps ? null : null;
      const src = MODEL.Project.comps[L.precomp.compId];
      if (src) {
        const t2 = precompSourceTime(comp, L, st, time);
        const res = render(src, t2, { RS });
        const m = st.worldMatrix(L);
        ctx.setTransform(RS * m[0], RS * m[1], RS * m[4], RS * m[5], RS * m[12], RS * m[13]);
        ctx.globalAlpha = U.clamp(st.getProp(L, ['transform', 'opacity']) / 100, 0, 1);
        ctx.drawImage(res.fbo ? canvasFromFBO(res.fbo) : null, -src.w / 2, -src.h / 2);
      }
    }
    return cv;
  }
  let _fboCanvas = null;
  function canvasFromFBO(fbo) {
    // 读取 FBO 到 canvas（用于预合成嵌套时的 Canvas2D 路径）
    if (!_fboCanvas) _fboCanvas = document.createElement('canvas');
    const gl = R.gl;
    _fboCanvas.width = fbo.w; _fboCanvas.height = fbo.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    const px = new Uint8Array(fbo.w * fbo.h * 4);
    gl.readPixels(0, 0, fbo.w, fbo.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // 翻转 Y
    const ctx = _fboCanvas.getContext('2d');
    const id = ctx.createImageData(fbo.w, fbo.h);
    for (let y = 0; y < fbo.h; y++) {
      const src = (fbo.h - 1 - y) * fbo.w * 4;
      id.data.set(px.subarray(src, src + fbo.w * 4), y * fbo.w * 4);
    }
    ctx.putImageData(id, 0, 0);
    return _fboCanvas;
  }

  function precompSourceTime(comp, L, st, time) {
    const src = MODEL.Project.comps[L.precomp.compId];
    const start = st.getProp(L, ['precomp', 'startTime']);
    const stretch = st.getProp(L, ['precomp', 'stretch']) / 100;
    if (L.precomp.remapOn) {
      const rv = st.getProp(L, ['precomp', 'timeRemap']);
      if (rv !== null && rv !== undefined) return rv;
    }
    return (time - L.inPoint) * (stretch || 1) + start;
  }

  /* ---------------- 预合成 ---------------- */
  function renderPrecomp(comp, st, L, item, time, W, H, RS) {
    const src = MODEL.Project.comps[L.precomp.compId];
    if (!src) return;
    const t2 = precompSourceTime(comp, L, st, time);
    const res = render(src, t2, { RS, nested: true });
    const m = st.worldMatrix(L);
    const op = U.clamp(st.getProp(L, ['transform', 'opacity']) / 100, 0, 1);
    if (op <= 0.001) return;
    // 预合成图像作为 2D 图层：绘制到 comp 画布再合成
    const cv = R2.getCanvas(W, H);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(RS * m[0], RS * m[1], RS * m[4], RS * m[5], RS * m[12], RS * m[13]);
    ctx.globalAlpha = 1;
    const srcCanvas = canvasFromFBO(res.fbo);
    ctx.drawImage(srcCanvas, -src.w / 2, -src.h / 2);
    const texFBO = ensure('precompTex', W, H);
    R.uploadTo(texFBO, cv);
    R2.releaseCanvas(cv);
    let fx = texFBO;
    if (L.effects && L.effects.length) fx = R.applyEffects(texFBO, L.effects, W, H, { a: ensure('fxA', W, H), b: ensure('fxB', W, H), c: ensure('fxC', W, H), d: ensure('fxD', W, H) });
    const tmp = ensure('compTmp', W, H);
    R.blit(tmp, fx.tex, { dstTex: S.acc.tex, opacity: op, blend: L.blend || 'normal' });
    const t = S.acc; S.acc = tmp; S.compTmp = t;
  }

  /* ---------------- 调整层 ---------------- */
  function applyAdjustment(comp, st, L, time, W, H, RS) {
    if (!L.effects || !L.effects.length) return;
    const op = U.clamp(st.getProp(L, ['transform', 'opacity']) / 100, 0, 1);
    if (op <= 0.001) return;
    // 复制当前累积
    const copy = ensure('adjCopy', W, H);
    R.blit(copy, S.acc.tex, {});
    const fx = R.applyEffects(copy, L.effects, W, H, { a: ensure('fxA', W, H), b: ensure('fxB', W, H), c: ensure('fxC', W, H), d: ensure('fxD', W, H) });
    const tmp = ensure('compTmp', W, H);
    R.blit(tmp, fx.tex, { dstTex: S.acc.tex, opacity: op, blend: L.blend || 'normal' });
    const t = S.acc; S.acc = tmp; S.compTmp = t;
  }

  /* ---------------- 三维组 ---------------- */
  function render3DGroup(comp, st, group, time, W, H, RS) {
    const cam = EVAL.cameraFor(comp, st);
    const meshes = [], lights = [], particles = [];
    let pointLight = null, keyLight = null;
    let anyMB = false;
    for (const it of group) {
      const L = it.layer;
      if (L.type === 'light') {
        const pos = st.getProp(L, ['transform', 'position']);
        const tgt = st.getProp(L, ['light', 'target']);
        const kind = L.light.kind;
        const col = U.hex2rgb(st.getProp(L, ['light', 'color']));
        const inten = st.getProp(L, ['light', 'intensity']);
        const d = [M_v(tgt, 0) - M_v(pos, 0), M_v(tgt, 1) - M_v(pos, 1), M_v(tgt, 2) - M_v(pos, 2)];
        const dl = Math.hypot(...d) || 1;
        const ld = { kind, pos: [M_v(pos, 0), M_v(pos, 1), M_v(pos, 2)], dir: [d[0] / dl, d[1] / dl, d[2] / dl], color: col, intensity: inten, castShadow: st.getProp(L, ['light', 'castShadow']), softness: st.getProp(L, ['light', 'shadowSoftness']), layer: L };
        lights.push(ld);
        if (kind === 'point' || kind === 'spot') { if (!pointLight) pointLight = { pos: ld.pos, color: col, intensity: inten * 2200 }; }
        else if (!keyLight) keyLight = ld;
      } else if (L.type === 'solid') {
        const m = NODES.solidMesh(comp, L, st, time);
        if (!m) continue;
        const wm = st.worldMatrix(L);
        const mat = {
          baseColor: U.hex2rgb(st.getProp(L, ['material', 'color'])),
          metallic: st.getProp(L, ['material', 'metallic']),
          roughness: st.getProp(L, ['material', 'roughness']),
          emissive: U.hex2rgb(st.getProp(L, ['material', 'emissive'])),
          emissiveInt: st.getProp(L, ['material', 'emissiveIntensity']),
          opacity: U.clamp(st.getProp(L, ['material', 'opacity']), 0, 1),
          envInt: st.getProp(L, ['material', 'env'])
        };
        const gl = R.createMesh(m.verts, m.norms, m.uvs, m.idx);
        const depth = -((cam.matrix[2] * wm[12] + cam.matrix[6] * wm[13] + cam.matrix[10] * wm[14] + cam.matrix[14]));
        meshes.push({ mesh: gl, model: wm, mat, depth, transparent: mat.opacity < 0.999, layer: L, noShadow: !L.castShadow3D });
        if (L.mb) anyMB = anyMB || (comp.mb && comp.mb.on);
      } else if (L.type === 'particle') {
        const res = SIM.simulate(comp, L, st, time);
        if (res.count > 0) particles.push({ layer: L, res, opacity: U.clamp(st.getProp(L, ['transform', 'opacity']) / 100, 0, 1) });
        if (L.mb) anyMB = anyMB || (comp.mb && comp.mb.on);
      }
    }
    if (!meshes.length && !particles.length) { for (const m of meshes) R.deleteMesh(m.mesh); return; }
    if (!keyLight && lights.length) keyLight = lights[0];
    if (!keyLight) keyLight = { dir: [0.35, -0.75, 0.55], color: [1, 0.95, 0.88], intensity: 2.2, castShadow: true, softness: 1.2 };
    if (!pointLight) pointLight = { pos: [comp.w * 0.3, comp.h * 0.2, -400], color: [0.5, 0.7, 1], intensity: 0 };

    const scene = {
      camera: cam,
      meshes,
      lights: [keyLight],
      pointLight,
      ambient: 1.0,
      shadowCenter: [comp.w / 2, comp.h / 2, 0],
      shadowRadius: Math.max(comp.w, comp.h) * 0.85
    };
    // 粒子缓冲
    if (particles.length) {
      let total = 0;
      for (const p of particles) total += p.res.count;
      const buf = new Float32Array(total * 11);
      let o = 0;
      for (const p of particles) {
        const arr = p.res.buf;
        for (let i = 0; i < arr.length; i += 11) {
          arr[i + 6] *= p.opacity;
        }
        buf.set(arr, o); o += arr.length;
      }
      scene.particles = R.uploadParticles(buf);
      let trTotal = 0;
      for (const p of particles) if (p.res.trailBuf) trTotal += p.res.trailBuf.length;
      if (trTotal) {
        const tb = new Float32Array(trTotal);
        let oo = 0;
        for (const p of particles) if (p.res.trailBuf) { tb.set(p.res.trailBuf, oo); oo += p.res.trailBuf.length; }
        scene.trails = R.uploadTrails(tb);
      }
    }
    const mbOn = comp.mb && comp.mb.on && anyMB;
    const samples = mbOn ? Math.min(8, Math.max(2, comp.mb.samples || 5)) : 1;
    const shutter = (comp.mb ? comp.mb.shutter / 360 : 0.5) / comp.fps;
    const out = ensure('threeD', W, H, { depth: true });
    if (samples > 1) {
      const accu = ensure('threeDMB', W, H);
      R.bindTarget(accu);
      R.gl.clearColor(0, 0, 0, 0); R.gl.clear(R.gl.COLOR_BUFFER_BIT | R.gl.DEPTH_BUFFER_BIT);
      for (let s = 0; s < samples; s++) {
        const tt = time + (s / (samples - 1) - 0.5) * shutter;
        // 重新求值该时刻的场景
        const sc2 = buildSceneAt(comp, st, group, tt, cam, W, H);
        sc2.mbScale = 1 / samples;
        R.renderScene(sc2, out, {});
        R.blit(accu, out.tex, { glBlend: 'add' });
        for (const m of sc2.meshes) R.deleteMesh(m.mesh);
      }
      // 景深
      let final = accu;
      if (cam.aperture > 0.01 && cam.dof !== false) {
        const dof = ensure('dof', W, H);
        R.bindTarget(dof);
        const gl = R.gl, p = R.progs.dof;
        gl.useProgram(p);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accu.tex); gl.uniform1i(p._u.uColor, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, out.depthTex); gl.uniform1i(p._u.uDepth, 1);
        gl.uniform1f(p._u.uFocus, cam.focus); gl.uniform1f(p._u.uAperture, cam.aperture / 8); gl.uniform1f(p._u.uMaxBlur, 22 * RS);
        gl.uniform2f(p._u.uTexel, 1 / W, 1 / H);
        gl.uniform1f(p._u.uNear, cam.near); gl.uniform1f(p._u.uFar, cam.far);
        R.drawQuad(p);
        final = dof;
      }
      R.blit(S.acc, final.tex, { glBlend: 'premul' });
    } else {
      R.renderScene(scene, out, {});
      for (const m of scene.meshes) R.deleteMesh(m.mesh);
      let final = out;
      if (cam.aperture > 0.01 && cam.dof !== false) {
        const dof = ensure('dof', W, H);
        R.bindTarget(dof);
        const gl = R.gl, p = R.progs.dof;
        gl.useProgram(p);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, out.tex); gl.uniform1i(p._u.uColor, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, out.depthTex); gl.uniform1i(p._u.uDepth, 1);
        gl.uniform1f(p._u.uFocus, cam.focus); gl.uniform1f(p._u.uAperture, cam.aperture / 8); gl.uniform1f(p._u.uMaxBlur, 22 * RS);
        gl.uniform2f(p._u.uTexel, 1 / W, 1 / H);
        gl.uniform1f(p._u.uNear, cam.near); gl.uniform1f(p._u.uFar, cam.far);
        R.drawQuad(p);
        final = dof;
      }
      R.blit(S.acc, final.tex, { glBlend: 'premul' });
    }
  }

  function buildSceneAt(comp, st, group, time, cam, W, H) {
    const meshes = [], lights = [], particles = [];
    let pointLight = null, keyLight = null;
    for (const it of group) {
      const L = it.layer;
      const s2 = new EVAL.EvalState(comp, time);
      if (L.type === 'solid') {
        const m = NODES.solidMesh(comp, L, s2, time);
        if (!m) continue;
        const wm = s2.worldMatrix(L);
        const mat = {
          baseColor: U.hex2rgb(s2.getProp(L, ['material', 'color'])),
          metallic: s2.getProp(L, ['material', 'metallic']),
          roughness: s2.getProp(L, ['material', 'roughness']),
          emissive: U.hex2rgb(s2.getProp(L, ['material', 'emissive'])),
          emissiveInt: s2.getProp(L, ['material', 'emissiveIntensity']),
          opacity: U.clamp(s2.getProp(L, ['material', 'opacity']), 0, 1),
          envInt: s2.getProp(L, ['material', 'env'])
        };
        const gl = R.createMesh(m.verts, m.norms, m.uvs, m.idx);
        meshes.push({ mesh: gl, model: wm, mat, depth: 0, transparent: mat.opacity < 0.999, layer: L });
      } else if (L.type === 'particle') {
        const res = SIM.simulate(comp, L, s2, time);
        if (res.count) particles.push({ res, opacity: U.clamp(s2.getProp(L, ['transform', 'opacity']) / 100, 0, 1) });
      } else if (L.type === 'light') {
        const pos = s2.getProp(L, ['transform', 'position']);
        const tgt = s2.getProp(L, ['light', 'target']);
        const col = U.hex2rgb(s2.getProp(L, ['light', 'color']));
        const inten = s2.getProp(L, ['light', 'intensity']);
        const d = [M_v(tgt, 0) - M_v(pos, 0), M_v(tgt, 1) - M_v(pos, 1), M_v(tgt, 2) - M_v(pos, 2)];
        const dl = Math.hypot(...d) || 1;
        const ld = { kind: L.light.kind, pos: [M_v(pos, 0), M_v(pos, 1), M_v(pos, 2)], dir: [d[0] / dl, d[1] / dl, d[2] / dl], color: col, intensity: inten, castShadow: s2.getProp(L, ['light', 'castShadow']), softness: s2.getProp(L, ['light', 'shadowSoftness']) };
        lights.push(ld);
        if (ld.kind === 'point') pointLight = { pos: ld.pos, color: col, intensity: inten * 2200 };
        else if (!keyLight) keyLight = ld;
      }
    }
    if (!keyLight) keyLight = lights[0] || { dir: [0.35, -0.75, 0.55], color: [1, 0.95, 0.88], intensity: 2.2, castShadow: true, softness: 1.2 };
    const scene = { camera: cam, meshes, lights: [keyLight], pointLight: pointLight || { pos: [0, 0, 0], color: [1, 1, 1], intensity: 0 }, ambient: 1.0, shadowCenter: [comp.w / 2, comp.h / 2, 0], shadowRadius: Math.max(comp.w, comp.h) * 0.85 };
    if (particles.length) {
      let total = 0; for (const p of particles) total += p.res.count;
      const buf = new Float32Array(total * 11); let o = 0;
      for (const p of particles) { const arr = p.res.buf; for (let i = 0; i < arr.length; i += 11) arr[i + 6] *= p.opacity; buf.set(arr, o); o += arr.length; }
      scene.particles = R.uploadParticles(buf);
    }
    return scene;
  }

  function M_v(v, i) { return Array.isArray(v) ? (v[i] || 0) : (i === 0 ? v : 0); }

  /* ---------------- 取回像素 ---------------- */
  function readPixels() {
    const gl = R.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.acc.fb);
    const px = new Uint8Array(S.acc.w * S.acc.h * 4);
    gl.readPixels(0, 0, S.acc.w, S.acc.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px, w: S.acc.w, h: S.acc.h };
  }

  C.render = render;
  C.renderLayerToCanvas = renderLayerToCanvas;
  C.readPixels = readPixels;
  C.S = S;
  Object.defineProperty(C, 'acc', { get: () => S.acc });
  global.COMP = C;
})(window);
