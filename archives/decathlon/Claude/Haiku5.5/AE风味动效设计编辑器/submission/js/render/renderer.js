/* 合成渲染器（WebGL2）。
 * 图层自下而上合成：2D 图层经过效果 / 遮罩 / 轨道遮罩 / 混合模式；
 * 连续的 3D 图层（含三维几何、粒子）合并进一次带深度缓冲的渲染：阴影贴图、光照、景深。
 * 合成坐标为合成像素；渲染目标尺寸 = 合成尺寸 × S（S 由视口决定）。
 * 所有权约定：传入的 RT 由被调用函数消耗（必要时释放）；返回的 RT 由调用方释放。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const U = AE.U;
  const M = U.mat;
  const GL = AE.GL;
  const SH = AE.Shaders;
  const Anim = AE.Anim;
  const P = AE.Path;
  const Shapes = AE.Shapes;
  const Model = AE.Model;

  const BLEND_MODES = { normal: 0, add: 1, screen: 2, multiply: 3, overlay: 4 };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = GL.create(canvas);
      if (!gl) throw new Error('当前浏览器不支持 WebGL 2');
      this.gl = gl;
      this.pool = new GL.Pool(gl);
      this.S = 1;
      this.progs = {};
      this._buildPrograms();
      // 单位方块（两个三角形，属性 aPos 为 vec2）
      this.unitVAO = gl.createVertexArray();
      const ub = gl.createBuffer();
      gl.bindVertexArray(this.unitVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, ub);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.geo = new GL.Geo(gl);
      this.spriteVAO = gl.createVertexArray();
      this.spriteBufs = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
      this.shadowMaps = {};
      this._blank = null;
    }

    _buildPrograms() {
      const gl = this.gl;
      const G = (name, vs, fs) => (this.progs[name] = GL.program(gl, vs, fs, name));
      G('flat', SH.flatVS, SH.flatFS);
      G('lit', SH.litVS, SH.litFS);
      G('shadow', SH.shadowVS, SH.shadowFS);
      G('sprite', SH.spriteVS, SH.spriteFS);
      G('quad', SH.quadVS, SH.texFS);
      G('full', SH.fullVS, SH.texFS);
      G('blend', SH.fullVS, SH.blendFS);
      G('blur', SH.fullVS, SH.blurFS);
      G('glowx', SH.fullVS, SH.glowExtractFS);
      G('hsl', SH.fullVS, SH.hslFS);
      G('shadow2', SH.fullVS, SH.shadowFS2);
      G('maskop', SH.fullVS, SH.maskOpFS);
      G('mulalpha', SH.fullVS, SH.mulAlphaFS);
      G('matte', SH.fullVS, SH.matteFS);
      G('dof', SH.fullVS, SH.dofFS);
      G('present', SH.fullVS, SH.presentFS);
    }

    // ---------- 小工具 ----------
    _vp2(W, H) {
      return M.ortho(0, W, H, 0, -100000, 100000);
    }
    _fullDraw(prog, setup) {
      const gl = this.gl;
      gl.useProgram(prog.prog);
      setup(prog);
      gl.bindVertexArray(this.unitVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }
    _bindTex(unit, tex) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    _setU(prog, name, v) {
      const gl = this.gl;
      const loc = prog.u[name];
      if (loc === undefined || loc === null) return;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
    }
    _setI(prog, name, v) {
      const loc = prog.u[name];
      if (loc !== undefined && loc !== null) this.gl.uniform1i(loc, v);
    }
    // 全屏 pass：写入 dst（不做混合）
    _pass(name, dst, setup) {
      const gl = this.gl;
      dst.bind(null);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      this._fullDraw(this.progs[name], setup);
      dst.resolve();
    }
    _copy(src) {
      const dst = this.pool.get(src.w, src.h);
      this._bindTex(0, src.textures[0]);
      this._pass('full', dst, (p) => {
        this._setI(p, 'uTex', 0);
        this._setU(p, 'uOpacity', 1);
      });
      return dst;
    }

    // 高斯模糊：radiusPx 为合成像素；返回新 RT（输入不释放）；半径为零时返回输入本身
    _blur(rt, radiusPx) {
      const sigma = radiusPx * this.S;
      if (sigma < 0.25) return rt;
      let cur = rt;
      // 单侧最多 32 个采样；半径大时拉开采样间距
      const step = Math.max(1, Math.ceil((3 * sigma) / 32));
      const taps = Math.min(32, Math.ceil((3 * sigma) / step));
      const sTaps = sigma / step;
      for (let pass = 0; pass < 2; pass++) {
        const dst = this.pool.get(rt.w, rt.h);
        this._bindTex(0, cur.textures[0]);
        const dir = pass === 0 ? [step / rt.w, 0] : [0, step / rt.h];
        this._pass('blur', dst, (p) => {
          this._setI(p, 'uSrc', 0);
          this._setU(p, 'uDir', dir);
          this._setI(p, 'uTaps', taps);
          this._setU(p, 'uSigma', sTaps);
        });
        if (cur !== rt) this.pool.release(cur);
        cur = dst;
      }
      return cur;
    }

    // 两个 RT 做混合：返回新 RT（src、dst 都不释放）
    _blend2(src, dst0, mode, opacity) {
      const dst = this.pool.get(dst0.w, dst0.h);
      this._bindTex(0, src.textures[0]);
      this._bindTex(1, dst0.textures[0]);
      this._pass('blend', dst, (p) => {
        this._setI(p, 'uSrc', 0);
        this._setI(p, 'uDst', 1);
        this._setI(p, 'uMode', mode);
        this._setU(p, 'uOpacity', opacity);
      });
      return dst;
    }
    // 把 src 合成到 F.acc 上（替换 F.acc）
    _composite(F, src, mode, opacity) {
      const next = this._blend2(src, F.acc, mode, opacity);
      this.pool.release(F.acc);
      F.acc = next;
    }

    // ---------- 变换与摄像机 ----------
    // 图层世界矩阵（含父级链）；t 为图层所在合成的时间
    worldOf(comp, layer, t, ctx) {
      if (ctx.world.has(layer.id)) return ctx.world.get(layer.id);
      const tr = layer.tr;
      const pos = Anim.value(comp, layer, tr.position, t);
      const anchor = Anim.value(comp, layer, tr.anchor, t);
      const sc = Anim.value(comp, layer, tr.scale, t);
      const rz = Anim.value(comp, layer, tr.rotation, t);
      const rx = Anim.value(comp, layer, tr.rotationX, t);
      const ry = Anim.value(comp, layer, tr.rotationY, t);
      let m = M.translate(pos[0], pos[1], pos[2] || 0);
      m = M.mul(m, M.rotZ(U.deg2rad(rz)));
      m = M.mul(m, M.rotY(U.deg2rad(ry)));
      m = M.mul(m, M.rotX(U.deg2rad(rx)));
      m = M.mul(m, M.scale(sc[0] / 100, sc[1] / 100, (sc[2] !== undefined ? sc[2] : 100) / 100));
      m = M.mul(m, M.translate(-anchor[0], -anchor[1], -(anchor[2] || 0)));
      const parent = layer.parent ? Model.findLayer(comp, layer.parent) : null;
      if (parent && parent.id !== layer.id && !ctx.visiting.has(layer.id)) {
        ctx.visiting.add(layer.id);
        m = M.mul(this.worldOf(comp, parent, t, ctx), m);
        ctx.visiting.delete(layer.id);
      }
      ctx.world.set(layer.id, m);
      return m;
    }

    // 生效摄像机（最上方的摄像机图层）；没有则使用与 2D 画面一致的默认摄像机
    cameraOf(comp, t, ctx) {
      const W = comp.width, H = comp.height;
      const cam = comp.layers.find((L) => L.type === 'camera' && L.enabled && Model.layerActive(L, t)) || null;
      let eye, poi, zoom, dof = false, focus, aperture = 0;
      if (cam) {
        const w = this.worldOf(comp, cam, t, ctx);
        eye = [w[12], w[13], w[14]];
        poi = Anim.value(comp, cam, cam.cam.poi, t);
        zoom = Math.max(1, Anim.value(comp, cam, cam.cam.zoom, t));
        dof = !!cam.cam.dof;
        focus = Anim.value(comp, cam, cam.cam.focus, t);
        aperture = Anim.value(comp, cam, cam.cam.aperture, t);
      } else {
        zoom = W * 1.389;
        eye = [W / 2, H / 2, -zoom];
        poi = [W / 2, H / 2, 0];
        focus = U.vlen(U.vsub(poi, eye));
      }
      const V = M.lookAt(eye, poi, [0, -1, 0]);
      const fovy = 2 * Math.atan(H / 2 / zoom);
      const Pm = M.persp(fovy, W / H, zoom * 0.02, zoom * 40);
      return { eye, poi, zoom, V, P: Pm, VP: M.mul(Pm, V), dof, focus, aperture };
    }

    // ---------- 2D 绘制 ----------
    // 把绘制项（填充 / 描边）画到 rt；model 为图层世界矩阵；rt 在本函数内绑定
    _drawFlatDraws(draws, model, rt, W, H, clearFirst) {
      const gl = this.gl;
      const vp = this._vp2(W, H);
      rt.bind(clearFirst ? [0, 0, 0, 0] : null);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      const prog = this.progs.flat;
      gl.useProgram(prog.prog);
      gl.uniformMatrix4fv(prog.u.uVP, false, vp);
      gl.uniformMatrix4fv(prog.u.uModel, false, model);
      for (const d of draws) {
        if (!d.contours || !d.contours.length || d.alpha <= 0) continue;
        const tris = d.kind === 'stroke' ? P.strokeTriangles(d.contours, d.width) : P.fillTriangles(d.contours);
        if (!tris.length) continue;
        const n = tris.length / 2;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = tris[i * 2];
          pos[i * 3 + 1] = tris[i * 2 + 1];
        }
        this.geo.set(pos, null);
        const a = d.alpha;
        const c = d.color || [1, 1, 1];
        gl.uniform4f(prog.u.uCol, c[0] * a, c[1] * a, c[2] * a, a);
        this.geo.draw(gl.TRIANGLES);
      }
      gl.disable(gl.BLEND);
      rt.resolve();
    }

    // ---------- 效果（消耗输入 rt，返回新 rt） ----------
    _applyEffects(L, comp, t, rt, ctx) {
      let cur = rt;
      const replace = (next) => {
        if (next !== cur) this.pool.release(cur);
        cur = next;
      };
      for (const fx of L.effects) {
        if (fx.on === false) continue;
        const g = (k) => Anim.value(comp, L, fx.params[k], t);
        if (fx.type === 'blur') {
          replace(this._blur(cur, g('radius')));
        } else if (fx.type === 'glow') {
          const th = g('threshold') / 100, r = g('radius'), inten = g('intensity') / 100, col = g('color');
          const ex = this.pool.get(cur.w, cur.h);
          this._bindTex(0, cur.textures[0]);
          this._pass('glowx', ex, (p) => {
            this._setI(p, 'uSrc', 0);
            this._setU(p, 'uThresh', th);
            this._setU(p, 'uTint', col);
          });
          const bl = this._blur(ex, Math.max(0.5, r));
          const glowRT = this.pool.get(cur.w, cur.h);
          this._bindTex(0, bl.textures[0]);
          this._pass('full', glowRT, (p) => {
            this._setI(p, 'uTex', 0);
            this._setU(p, 'uOpacity', inten);
          });
          if (bl !== ex) this.pool.release(bl);
          this.pool.release(ex);
          const merged = this._blend2(glowRT, cur, 1, 1); // 加色叠加
          this.pool.release(glowRT);
          replace(merged);
        } else if (fx.type === 'shadow') {
          const op = g('opacity') / 100, dist = g('distance'), dir = U.deg2rad(g('direction')), soft = g('softness'), col = g('color');
          const off = [(Math.cos(dir) * dist * this.S) / cur.w, (-Math.sin(dir) * dist * this.S) / cur.h];
          const sh = this.pool.get(cur.w, cur.h);
          this._bindTex(0, cur.textures[0]);
          this._pass('shadow2', sh, (p) => {
            this._setI(p, 'uSrc', 0);
            this._setU(p, 'uOff', off);
            this._setU(p, 'uCol', col);
            this._setU(p, 'uOp', op);
          });
          const shb = this._blur(sh, soft);
          if (shb !== sh) this.pool.release(sh);
          // 图层在阴影之上
          const merged = this._blend2(cur, shb, 0, 1);
          this.pool.release(shb);
          replace(merged);
        } else if (fx.type === 'hsl') {
          const out = this.pool.get(cur.w, cur.h);
          this._bindTex(0, cur.textures[0]);
          this._pass('hsl', out, (p) => {
            this._setI(p, 'uSrc', 0);
            this._setU(p, 'uHue', g('hue'));
            this._setU(p, 'uSat', g('sat'));
            this._setU(p, 'uLight', g('light'));
          });
          replace(out);
        }
      }
      return cur;
    }

    // ---------- 遮罩 ----------
    // 返回覆盖率 RT（alpha 为覆盖值）；无遮罩返回 null；调用方释放
    _maskCoverage(L, comp, t, ctx, W, H) {
      const src = L.autoStroke ? AE.Shapes.autoStrokeMasks(comp, L, t) : L.masks || [];
      const masks = src.filter((m) => m.mode !== 'none');
      if (!masks.length) return null;
      const gl = this.gl;
      const world = this.worldOf(comp, L, t, ctx);
      let cov = this.pool.get(ctx.Wr, ctx.Hr);
      cov.bind(masks[0].mode === 'subtract' ? [0, 0, 0, 1] : [0, 0, 0, 0]);
      cov.resolve();
      masks.forEach((mk, idx) => {
        const list = Anim.value(comp, L, mk.path, t) || [];
        const contours = P.contoursFromBPaths(list, 0.3);
        const op = Anim.value(comp, L, mk.opacity, t) / 100;
        const feather = Anim.value(comp, L, mk.feather, t);
        const m = this.pool.get(ctx.Wr, ctx.Hr);
        this._drawFlatDraws([{ kind: 'fill', contours, alpha: op, color: [1, 1, 1] }], world, m, W, H, true);
        const mb = this._blur(m, feather);
        if (mb !== m) this.pool.release(m);
        const mode = idx === 0 && mk.mode === 'intersect' ? 'add' : mk.mode;
        const next = this.pool.get(ctx.Wr, ctx.Hr);
        this._bindTex(0, cov.textures[0]);
        this._bindTex(1, mb.textures[0]);
        next.bind(null);
        gl.disable(gl.BLEND);
        this._fullDraw(this.progs.maskop, (p) => {
          this._setI(p, 'uAcc', 0);
          this._setI(p, 'uM', 1);
          this._setI(p, 'uMode', mode === 'subtract' ? 1 : mode === 'intersect' ? 2 : 0);
          this._setU(p, 'uInv', mk.inv ? 1 : 0);
        });
        next.resolve();
        this.pool.release(mb);
        this.pool.release(cov);
        cov = next;
      });
      return cov;
    }
    // 用覆盖率乘预乘颜色；消耗 rt 返回新 RT
    _applyCoverage(rt, cov) {
      const out = this.pool.get(rt.w, rt.h);
      this._bindTex(0, rt.textures[0]);
      this._bindTex(1, cov.textures[0]);
      this._pass('mulalpha', out, (p) => {
        this._setI(p, 'uSrc', 0);
        this._setI(p, 'uCov', 1);
      });
      this.pool.release(rt);
      return out;
    }

    // ---------- 2D 图层 ----------
    // 图层内容 RT（未合成到 acc）；返回的 RT 由调用方释放
    _layerContent(comp, L, t, ctx) {
      const W = comp.width, H = comp.height;
      const world = this.worldOf(comp, L, t, ctx);
      const rt = this.pool.get(ctx.Wr, ctx.Hr);
      if (L.type === 'shape' || L.type === 'text') {
        this._drawFlatDraws(Shapes.evaluate(comp, L, t), world, rt, W, H, true);
      } else if (L.type === 'precomp') {
        const child = L.pre && L.pre.comp && Model.findComp(ctx.project, L.pre.comp);
        rt.bind([0, 0, 0, 0]);
        if (child && !ctx.stack.includes(child.id)) {
          const ct = this._childTime(comp, L, t);
          ctx.stack.push(child.id);
          const cr = this.renderCompRT(child, ct, ctx, false);
          ctx.stack.pop();
          this._drawQuad(cr, world, child.width, child.height, rt, W, H);
          this.pool.release(cr);
        }
        rt.resolve();
      }
      return rt;
    }
    // 把一张 RT（尺寸 tw×th 合成像素）以变换矩阵画到 rt 上（预乘混合）
    _drawQuad(src, world, tw, th, rt, W, H) {
      const gl = this.gl;
      this._bindTex(0, src.textures[0]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      const prog = this.progs.quad;
      gl.useProgram(prog.prog);
      gl.uniformMatrix4fv(prog.u.uVP, false, this._vp2(W, H));
      gl.uniformMatrix4fv(prog.u.uModel, false, M.mul(world, M.scale(tw, th, 1)));
      gl.uniform1i(prog.u.uTex, 0);
      gl.uniform1f(prog.u.uOpacity, 1);
      gl.bindVertexArray(this.unitVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      rt.resolve();
    }
    _childTime(comp, L, t) {
      if (L.pre.remap) return Math.max(0, Anim.value(comp, L, L.pre.remap, t));
      return Math.max(0, t - L.startTime + (L.pre.start || 0));
    }

    _drawLayer2D(comp, L, t, ctx, F) {
      // 先遮罩再效果：发光、投影等效果可以越过遮罩边界（与 AE 中的常见用法一致）
      let rt = this._layerContent(comp, L, t, ctx);
      const cov = this._maskCoverage(L, comp, t, ctx, comp.width, comp.height);
      if (cov) {
        rt = this._applyCoverage(rt, cov);
        this.pool.release(cov);
      }
      if (L.effects && L.effects.length) rt = this._applyEffects(L, comp, t, rt, ctx);
      if (L.matte) {
        const mL = Model.findLayer(comp, L.matte);
        if (mL && mL.enabled && Model.layerActive(mL, t)) {
          const mr = this._layerContent(comp, mL, t, ctx);
          const out = this.pool.get(rt.w, rt.h);
          this._bindTex(0, rt.textures[0]);
          this._bindTex(1, mr.textures[0]);
          const inv = L.matteMode === 'alphaInv' || L.matteMode === 'lumaInv' ? 1 : 0;
          const luma = L.matteMode === 'luma' || L.matteMode === 'lumaInv' ? 1 : 0;
          this._pass('matte', out, (p) => {
            this._setI(p, 'uSrc', 0);
            this._setI(p, 'uMatte', 1);
            this._setI(p, 'uMode', luma);
            this._setI(p, 'uInv', inv);
          });
          this.pool.release(mr);
          this.pool.release(rt);
          rt = out;
        }
      }
      const op = U.clamp(Anim.value(comp, L, L.tr.opacity, t) / 100, 0, 1);
      this._composite(F, rt, BLEND_MODES[L.blend] || 0, op);
      this.pool.release(rt);
    }

    // 调整图层：处理其下方的合成结果，范围受自身遮罩与不透明度限制
    _applyAdjust(comp, L, t, ctx, F) {
      let tmp = this._copy(F.acc);
      if (L.effects && L.effects.length) tmp = this._applyEffects(L, comp, t, tmp, ctx);
      const cov = this._maskCoverage(L, comp, t, ctx, comp.width, comp.height);
      if (cov) {
        tmp = this._applyCoverage(tmp, cov);
        this.pool.release(cov);
      }
      const op = U.clamp(Anim.value(comp, L, L.tr.opacity, t) / 100, 0, 1);
      this._composite(F, tmp, 0, op);
      this.pool.release(tmp);
    }

    // ---------- 3D 几何收集 ----------
    // 把一个 3D 图层转换为渲染项（世界矩阵 + 本地顶点数据）
    _collect3D(comp, L, t, ctx, items) {
      const world = this.worldOf(comp, L, t, ctx);
      const mat = L.mat || (L.geo && L.geo.mat) || null;
      const mv = (p) => Anim.value(comp, L, p, t);
      const base = mat ? mv(mat.color) : [1, 1, 1];
      const emit = mat ? mv(mat.emit) : 0;
      const emitC = mat ? mv(mat.emitColor) : [1, 1, 1];
      const op = U.clamp(mv(L.tr.opacity) / 100, 0, 1);
      const common = {
        model: world,
        base,
        metal: U.clamp(mat ? mv(mat.metal) : 0, 0, 1),
        rough: U.clamp(mat ? mv(mat.rough) : 0.5, 0.04, 1),
        emit: emitC.map((c) => c * emit),
        alpha: U.clamp((mat ? mv(mat.alpha) / 100 : 1) * op, 0, 1),
        cast: L.castShadow !== false,
        accept: L.acceptShadow !== false,
        layer: L.id,
      };
      if (L.type === 'shape' || L.type === 'text') {
        const draws = Shapes.evaluate(comp, L, t);
        const depth = L.extrude ? mv(L.extrude.depth) : 0;
        const bevel = L.extrude ? mv(L.extrude.bevel) : 0;
        draws.forEach((d) => {
          if (d.kind !== 'fill' || !d.contours.length) return;
          const mesh = depth > 0.01 ? AE.Mesh.extrude(d.contours, depth, bevel) : AE.Mesh.flat(d.contours);
          if (!mesh) return;
          items.push(Object.assign({}, common, { kind: 'mesh', pos: mesh.pos, nrm: mesh.nrm, alpha: common.alpha * d.alpha, base: d.color || base, cast: depth > 0.01 && common.cast }));
        });
      } else if (L.type === 'geo') {
        const g = AE.Graph ? AE.Graph.geometryOf(ctx.project, comp, L, t) : null;
        if (g && g.kind === 'mesh') items.push(Object.assign({}, common, { kind: 'mesh', pos: g.pos, nrm: g.nrm }));
        else if (g && g.kind === 'contours') {
          const mesh = AE.Mesh.extrude(g.contours, g.depth || 60, 0);
          if (mesh) items.push(Object.assign({}, common, { kind: 'mesh', pos: mesh.pos, nrm: mesh.nrm }));
        }
      } else if (L.type === 'particles') {
        const sp = AE.Particles ? AE.Particles.sprites(ctx.project, comp, L, t, ctx) : null;
        if (sp && sp.count) items.push({ kind: 'sprites', pos: sp.pos, col: sp.col, size: sp.size, count: sp.count, layer: L.id });
      }
    }

    // 生效灯光（最多 4 个）
    _lights(comp, t, ctx) {
      const out = [];
      for (const L of comp.layers) {
        if (L.type !== 'light' || !L.enabled || !Model.layerActive(L, t)) continue;
        const w = this.worldOf(comp, L, t, ctx);
        const col = Anim.value(comp, L, L.light.color, t);
        const inten = Anim.value(comp, L, L.light.intensity, t) / 100;
        const pos = [w[12], w[13], w[14]];
        const parallel = L.light.kind === 'parallel';
        const vec = parallel ? U.vnorm(U.vsub(pos, Anim.value(comp, L, L.light.poi, t))) : pos;
        out.push({ kind: parallel ? 0 : 1, vec, col: col.map((c) => c * inten), cast: !!L.light.shadow, dark: U.clamp(Anim.value(comp, L, L.light.shadowDark, t) / 100, 0, 1) });
        if (out.length >= 4) break;
      }
      return out;
    }

    _shadowMap(i) {
      const gl = this.gl;
      if (!this.shadowMaps[i]) {
        const size = 2048;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, size, size, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
        gl.drawBuffers([gl.NONE]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.shadowMaps[i] = { fbo, tex, size };
      }
      return this.shadowMaps[i];
    }
    _blankTex() {
      if (!this._blank) {
        const gl = this.gl;
        this._blank = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._blank);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1]));
      }
      return this._blank;
    }

    // ---------- 三维通道 ----------
    _render3D(comp, items, t, ctx, F) {
      const gl = this.gl;
      const drawItems = items.filter((it) => it.kind === 'mesh' || it.kind === 'sprites');
      if (!drawItems.length) return;
      const cam = this.cameraOf(comp, t, ctx);
      const lights = this._lights(comp, t, ctx);
      // 场景包围盒（世界空间）
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      drawItems.forEach((it) => {
        if (it.kind !== 'mesh') return;
        const pos = it.pos;
        for (let i = 0; i < pos.length; i += 3) {
          const w = M.transformPoint(it.model, [pos[i], pos[i + 1], pos[i + 2]]);
          for (let k = 0; k < 3; k++) {
            if (w[k] < mn[k]) mn[k] = w[k];
            if (w[k] > mx[k]) mx[k] = w[k];
          }
        }
      });
      if (!isFinite(mn[0])) mn = [0, 0, 0], mx = [1, 1, 1];
      const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      const radius = Math.max(60, U.vlen(U.vsub(mx, mn)) / 2);

      // 阴影贴图
      const lightVP = [];
      const shadowTex = [];
      const shadowProg = this.progs.shadow;
      lights.forEach((lt, i) => {
        if (!lt.cast) {
          lightVP.push(M.ident());
          shadowTex.push(null);
          return;
        }
        let lv, lp;
        if (lt.kind === 0) {
          lv = M.lookAt(U.vadd(center, U.vmul(lt.vec, radius * 2.2)), center, [0, -1, 0]);
          lp = M.ortho(-radius, radius, -radius, radius, 1, radius * 6);
        } else {
          const dist = U.vlen(U.vsub(center, lt.vec)) || 1;
          lv = M.lookAt(lt.vec, center, [0, -1, 0]);
          lp = M.persp(Math.min(2.9, 2 * Math.atan((radius * 1.3) / dist) + 0.3), 1, 1, dist * 4 + radius * 3);
        }
        const lvp = M.mul(lp, lv);
        lightVP.push(lvp);
        const sm = this._shadowMap(i);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sm.fbo);
        gl.viewport(0, 0, sm.size, sm.size);
        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.useProgram(shadowProg.prog);
        gl.uniformMatrix4fv(shadowProg.u.uVP, false, lvp);
        drawItems.forEach((it) => {
          if (it.kind !== 'mesh' || !it.cast || it.alpha < 0.5) return;
          gl.uniformMatrix4fv(shadowProg.u.uModel, false, it.model);
          this.geo.set(it.pos, null);
          this.geo.draw(gl.TRIANGLES);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        shadowTex.push(sm.tex);
      });

      // 三维渲染目标：颜色 + 视深度（景深用）+ 深度缓冲
      const run = this.pool.get(F.acc.w, F.acc.h, { colors: 2, depth: true, samples: GL.samples });
      run.bind([0, 0, 0, 0]);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      const prog = this.progs.lit;
      gl.useProgram(prog.prog);
      const u = prog.u;
      const nl = lights.length;
      const lvec = new Float32Array(12), lcol = new Float32Array(12), ltype = new Int32Array(4), lcast = new Int32Array(4), lrad = new Float32Array(4).fill(1000);
      const lvp = new Float32Array(64);
      lights.forEach((lt, i) => {
        lvec.set(lt.vec, i * 3);
        lcol.set(lt.col, i * 3);
        ltype[i] = lt.kind;
        lcast[i] = shadowTex[i] ? 1 : 0;
        lrad[i] = Math.max(800, radius * 4);
        lvp.set(lightVP[i], i * 16);
      });
      gl.uniform3fv(u.uCam, cam.eye);
      gl.uniformMatrix4fv(u.uView, false, cam.V);
      gl.uniform1i(u.uNL, nl);
      gl.uniform3fv(u.uLVec, lvec);
      gl.uniform3fv(u.uLCol, lcol);
      gl.uniform1iv(u.uLType, ltype);
      gl.uniform1iv(u.uLCast, lcast);
      gl.uniformMatrix4fv(u.uLVP, false, lvp);
      gl.uniform1fv(u.uLRad, lrad);
      gl.uniform1f(u.uSDark, lights.length ? lights[0].dark : 0.5);
      for (let i = 0; i < 4; i++) {
        this._bindTex(4 + i, shadowTex[i] || this._blankTex());
        this._setI(prog, 'uSh' + i, 4 + i);
      }
      const meshes = drawItems.filter((it) => it.kind === 'mesh');
      const opaque = meshes.filter((it) => it.alpha >= 0.999);
      const trans = meshes.filter((it) => it.alpha < 0.999);
      const sprites = drawItems.filter((it) => it.kind === 'sprites');
      const dist = (it) => {
        if (!it.centroid) it.centroid = centroidOf(it.pos, it.model);
        return U.vlen(U.vsub(it.centroid, cam.eye));
      };
      trans.sort((a, b) => dist(b) - dist(a));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const drawMesh = (it) => {
        gl.uniformMatrix4fv(u.uVP, false, cam.VP);
        gl.uniformMatrix4fv(u.uModel, false, it.model);
        gl.uniformMatrix3fv(u.uNrmMat, false, normalMat3(it.model));
        gl.uniform3fv(u.uBase, it.base);
        gl.uniform1f(u.uMetal, it.metal);
        gl.uniform1f(u.uRough, it.rough);
        gl.uniform1f(u.uAlpha, it.alpha);
        gl.uniform3fv(u.uEmit, it.emit);
        gl.uniform1i(u.uLit, 1);
        gl.uniform1i(u.uAccept, it.accept && shadowTex.some((x) => x) ? 1 : 0);
        this.geo.set(it.pos, it.nrm || null);
        this.geo.draw(gl.TRIANGLES);
      };
      gl.useProgram(prog.prog);
      opaque.forEach(drawMesh);
      gl.depthMask(false);
      trans.forEach(drawMesh);
      gl.depthMask(true);
      // 粒子与拖尾：加色精灵（位置已为合成空间坐标）
      if (sprites.length) {
        const sp = this.progs.sprite;
        gl.useProgram(sp.prog);
        gl.uniformMatrix4fv(sp.u.uVP, false, cam.VP);
        gl.uniform1f(sp.u.uPx, (run.h * 0.5) * cam.P[5]);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        sprites.forEach((it) => {
          this._spriteDraw(it.pos, it.col, it.size, it.count);
        });
        gl.depthMask(true);
      }
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      run.resolve();
      // 景深
      let out = run;
      if (cam.dof && cam.aperture > 0) {
        out = this.pool.get(run.w, run.h);
        this._bindTex(0, run.textures[0]);
        this._bindTex(1, run.textures[1]);
        this._pass('dof', out, (p) => {
          this._setI(p, 'uCol', 0);
          this._setI(p, 'uDep', 1);
          this._setU(p, 'uTexel', [1 / run.w, 1 / run.h]);
          this._setU(p, 'uFocus', cam.focus);
          this._setU(p, 'uAperture', cam.aperture * this.S);
          this._setU(p, 'uMaxR', 40 * this.S);
        });
      }
      this._composite(F, out, 0, 1);
      if (out !== run) this.pool.release(out);
      this.pool.release(run);
    }

    _spriteDraw(pos, col, size, count) {
      const gl = this.gl;
      const vao = this.spriteVAO;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBufs[0]);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBufs[1]);
      gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBufs[2]);
      gl.bufferData(gl.ARRAY_BUFFER, size, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    }

    // ---------- 合成 ----------
    // 渲染一个合成一次；ctx.mbTime 存在时，开启运动模糊的图层使用该时间
    renderCompRT(comp, t, ctx, isRoot) {
      const W = comp.width, H = comp.height;
      const savedW = ctx.Wr, savedH = ctx.Hr, savedWorld = ctx.world, savedVis = ctx.visiting;
      ctx.Wr = Math.max(1, Math.round(W * this.S));
      ctx.Hr = Math.max(1, Math.round(H * this.S));
      ctx.world = new Map();
      ctx.visiting = new Set();
      const F = { acc: this.pool.get(ctx.Wr, ctx.Hr) };
      const bg = comp.bg || [0, 0, 0];
      F.acc.bind(isRoot ? [bg[0], bg[1], bg[2], 1] : [0, 0, 0, 0]);
      F.acc.resolve();
      // 被用作轨道遮罩的图层默认隐藏
      const hidden = new Set();
      comp.layers.forEach((L) => {
        if (L.matte) hidden.add(L.matte);
      });
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const items = [];
        run.forEach((r) => this._collect3D(comp, r.L, r.tl, ctx, items));
        this._render3D(comp, items, t, ctx, F);
        run = [];
      };
      const effTime = (L) => (L.mb && ctx.mbTime !== undefined ? ctx.mbTime : t);
      for (let i = comp.layers.length - 1; i >= 0; i--) {
        const L = comp.layers[i];
        if (!L.enabled || hidden.has(L.id)) continue;
        if (!Model.layerActive(L, t)) continue;
        if (L.type === 'camera' || L.type === 'light' || L.type === 'sound') continue;
        const tl = effTime(L);
        if (L.type === 'adjust') {
          flush();
          this._applyAdjust(comp, L, tl, ctx, F);
          continue;
        }
        if (L.is3D || L.type === 'geo' || L.type === 'particles') {
          run.push({ L, tl });
          continue;
        }
        flush();
        if (L.type === 'null') continue;
        this._drawLayer2D(comp, L, tl, ctx, F);
      }
      flush();
      ctx.Wr = savedW;
      ctx.Hr = savedH;
      ctx.world = savedWorld;
      ctx.visiting = savedVis;
      return F.acc;
    }

    // 完整一帧（含运动模糊的快门区间采样）。返回的 RT 由调用方释放。
    renderFrame(project, comp, t, opts) {
      opts = opts || {};
      this.S = opts.S || 1;
      const gl = this.gl;
      const mbOn = comp.motionBlur && comp.layers.some((L) => L.mb && L.enabled);
      const newCtx = () => ({ project, world: new Map(), visiting: new Set(), stack: [comp.id], Wr: 0, Hr: 0, mbTime: undefined });
      if (!mbOn) return this.renderCompRT(comp, t, newCtx(), true);
      const N = Math.max(2, comp.mbSamples || 8);
      const fd = 1 / comp.fps;
      const shutter = ((comp.shutter || 180) / 360) * fd;
      const phase = ((comp.phase || 0) / 360) * fd;
      const Wr = Math.max(1, Math.round(comp.width * this.S)), Hr = Math.max(1, Math.round(comp.height * this.S));
      let acc = this.pool.get(Wr, Hr);
      acc.bind([0, 0, 0, 0]);
      acc.resolve();
      for (let k = 0; k < N; k++) {
        const ctx = newCtx();
        ctx.mbTime = t + phase + ((k + 0.5) / N) * shutter;
        const rt = this.renderCompRT(comp, t, ctx, true);
        const next = this._blend2(rt, acc, 1, 1 / N);
        this.pool.release(rt);
        this.pool.release(acc);
        acc = next;
      }
      void gl;
      return acc;
    }

    // 把 RT 画到画布（画布尺寸与 RT 一致）
    present(rt) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this._bindTex(0, rt.textures[0]);
      this._fullDraw(this.progs.present, (p) => this._setI(p, 'uTex', 0));
    }
  }

  // 三角形形心（世界空间）
  function centroidOf(pos, model) {
    let x = 0, y = 0, z = 0;
    const n = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) {
      x += pos[i];
      y += pos[i + 1];
      z += pos[i + 2];
    }
    return M.transformPoint(model, [x / n, y / n, z / n]);
  }
  // 法线矩阵：model 左上 3x3 的逆转置（列主序 9 元素）
  function normalMat3(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) det = 1;
    const id = 1 / det;
    return new Float32Array([
      b01 * id, (-a22 * a01 + a02 * a21) * id, (a12 * a01 - a02 * a11) * id,
      b11 * id, (a22 * a00 - a02 * a20) * id, (-a12 * a00 + a02 * a10) * id,
      b21 * id, (-a21 * a00 + a01 * a20) * id, (a11 * a00 - a01 * a10) * id,
    ]);
  }

  AE.Renderer = Renderer;
  AE.BLEND_MODES = BLEND_MODES;
})();
