/* render2d.js — 二维图层渲染：形状/文字填充描边(模板缓冲+MSAA)、蒙版、效果、混合合成 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, Model = AE.Model, A2 = G.A2;

  const SH = {};
  SH.fillVS = `#version 300 es
in vec2 aPos; uniform mat3 uM; out vec2 vL; void main(){ vL = aPos; vec3 p = uM * vec3(aPos, 1.0); gl_Position = vec4(p.xy, 0.0, 1.0); }`;
  SH.fillFS = `#version 300 es
precision highp float; in vec2 vL; out vec4 o;
uniform vec4 uColor; uniform int uGrad; uniform vec2 uG0, uG1; uniform vec4 uSC[4]; uniform float uSP[4]; uniform int uSN;
void main(){
  vec4 c = uColor;
  if (uGrad > 0) {
    float t;
    if (uGrad == 1) { vec2 d = uG1 - uG0; t = clamp(dot(vL - uG0, d) / max(dot(d, d), 1e-6), 0.0, 1.0); }
    else { t = clamp(length(vL - uG0) / max(length(uG1 - uG0), 1e-6), 0.0, 1.0); }
    vec4 g = uSC[0];
    for (int i = 1; i < 4; i++) { if (i < uSN) { float a = uSP[i-1], b = uSP[i]; if (t >= a) g = mix(uSC[i-1], uSC[i], clamp((t - a) / max(b - a, 1e-5), 0.0, 1.0)); } }
    c = vec4(g.rgb, g.a * uColor.a);
  }
  o = vec4(c.rgb * c.a, c.a);
}`;
  SH.texVS = `#version 300 es
in vec2 aPos; uniform mat3 uM; uniform vec4 uRect; out vec2 vUV; void main(){ vUV = (aPos - uRect.xy) / uRect.zw; vec3 p = uM * vec3(aPos, 1.0); gl_Position = vec4(p.xy, 0.0, 1.0); }`;
  SH.texFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform float uOp;
void main(){ vec4 c = texture(uTex, vec2(vUV.x, 1.0 - vUV.y)); o = c * uOp; }`;
  SH.copyFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform float uMul; void main(){ o = texture(uTex, vUV) * uMul; }`;
  SH.blurFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir; uniform float uSigma;
void main(){ float s = max(uSigma, 0.05); int r = int(min(ceil(s * 3.0), 48.0)); vec4 sum = vec4(0.0); float ws = 0.0;
  for (int i = -48; i <= 48; i++) { if (i < -r || i > r) continue; float w = exp(-0.5 * float(i * i) / (s * s)); sum += texture(uTex, vUV + uDir * float(i)) * w; ws += w; }
  o = sum / ws; }`;
  SH.compFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uDst, uSrc, uMatte; uniform float uOp; uniform int uBlend, uMatteMode;
vec3 hardlight(vec3 cb, vec3 cs){ return mix(2.0*cb*cs, 1.0 - 2.0*(1.0-cb)*(1.0-cs), step(0.5, cs)); }
void main(){
  vec4 d = texture(uDst, vUV); vec4 s = texture(uSrc, vUV) * uOp;
  if (uMatteMode > 0) { vec4 m = texture(uMatte, vUV); float a = m.a; float lum = dot(m.rgb, vec3(0.299, 0.587, 0.114)); float v = (uMatteMode == 1 || uMatteMode == 3) ? a : lum; if (uMatteMode >= 3) v = 1.0 - v; s *= clamp(v, 0.0, 1.0); }
  if (uBlend == 5) { o = mix(d, s / max(uOp, 1e-6), clamp(uOp, 0.0, 1.0)); return; }
  float as = s.a, ad = d.a;
  if (uBlend == 0 || as < 1e-6) { o = s + d * (1.0 - as); return; }
  vec3 cs = s.rgb / as; vec3 cd = ad > 1e-6 ? d.rgb / ad : vec3(0.0); vec3 B;
  if (uBlend == 1) B = cd + cs; else if (uBlend == 2) B = cd + cs - cd * cs; else if (uBlend == 3) B = cd * cs; else B = hardlight(cs, cd);
  vec3 rgb = s.rgb * (1.0 - ad) + d.rgb * (1.0 - as) + as * ad * B;
  o = vec4(rgb, as + ad - as * ad);
}`;
  SH.adjFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uDst, uFx, uMask; uniform float uAmt; uniform int uUseMask;
void main(){ vec4 d = texture(uDst, vUV), f = texture(uFx, vUV); float m = uAmt; if (uUseMask > 0) m *= texture(uMask, vUV).a; o = mix(d, f, clamp(m, 0.0, 1.0)); }`;
  SH.maskFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uAcc, uCov; uniform int uMode, uInv; uniform float uOp;
void main(){ float m = texture(uAcc, vUV).a; float c = texture(uCov, vUV).a; if (uInv > 0) c = 1.0 - c; c *= uOp;
  float r = m; if (uMode == 0) r = m + c - m * c; else if (uMode == 1) r = m * (1.0 - c); else if (uMode == 2) r = m * c; else if (uMode == 4) r = abs(m - c); o = vec4(r); }`;
  SH.applyMaskFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex, uMask; void main(){ o = texture(uTex, vUV) * texture(uMask, vUV).a; }`;
  SH.glowFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex, uBlur; uniform float uInt; uniform vec3 uTint;
void main(){ vec4 s = texture(uTex, vUV); vec4 g = texture(uBlur, vUV); vec3 add = g.rgb * uTint * uInt; float aa = clamp(max(g.a * uInt * 0.9, max(add.r, max(add.g, add.b))), 0.0, 1.0); o = vec4(s.rgb + add, s.a + aa * (1.0 - s.a)); }`;
  SH.thrFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform float uThr;
void main(){ vec4 s = texture(uTex, vUV); float a = max(s.a, 1e-4); vec3 c = s.rgb / a; float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uThr, uThr + 0.25, l) * s.a; o = vec4(c * k, k); }`;
  SH.shadowFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex, uBlur; uniform vec2 uOff; uniform vec4 uCol; uniform float uOp;
void main(){ vec4 s = texture(uTex, vUV); float sa = texture(uBlur, vUV - uOff).a * uOp * uCol.a; vec4 sh = vec4(uCol.rgb * sa, sa); o = s + sh * (1.0 - s.a); }`;
  SH.hslFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform float uH, uS, uL;
vec3 rgb2hsl(vec3 c){ float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); float l = (mx + mn) * 0.5; float d = mx - mn; float h = 0.0, s = 0.0;
  if (d > 1e-5) { s = d / (1.0 - abs(2.0 * l - 1.0) + 1e-5); if (mx == c.r) h = mod((c.g - c.b) / d, 6.0); else if (mx == c.g) h = (c.b - c.r) / d + 2.0; else h = (c.r - c.g) / d + 4.0; h /= 6.0; } return vec3(h, s, l); }
vec3 hsl2rgb(vec3 c){ vec3 k = mod(vec3(0.0, 8.0, 4.0) + c.x * 12.0, 12.0); float a = c.y * min(c.z, 1.0 - c.z); return c.z - a * max(vec3(-1.0), min(min(k - 3.0, 9.0 - k), vec3(1.0))); }
void main(){ vec4 s = texture(uTex, vUV); float a = max(s.a, 1e-5); vec3 c = clamp(s.rgb / a, 0.0, 1.0); vec3 h = rgb2hsl(c); h.x = fract(h.x + uH / 360.0); h.y = clamp(h.y * (1.0 + uS), 0.0, 1.0);
  vec3 r = hsl2rgb(h); if (uL > 0.0) r = mix(r, vec3(1.0), uL); else r = r * (1.0 + uL); o = vec4(r * s.a, s.a); }`;
  SH.presentFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec4 uRect; uniform vec2 uRes; uniform float uChecker;
void main(){ vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); vec2 uv = (px - uRect.xy) / uRect.zw; vec3 bg = vec3(0.075, 0.08, 0.09);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(bg, 1.0); return; }
  vec4 c = texture(uTex, vec2(uv.x, 1.0 - uv.y)); vec3 base = vec3(0.0);
  if (uChecker > 0.5) { vec2 g = floor(px / 10.0); float k = mod(g.x + g.y, 2.0); base = mix(vec3(0.16), vec3(0.24), k); }
  o = vec4(c.rgb + base * (1.0 - c.a), 1.0); }`;

  class Renderer {
    constructor(glctx) { this.g = glctx; this.gl = glctx.gl; this.ev = null; this.buf = this.gl.createBuffer(); this.vaoGeo = this.gl.createVertexArray(); this.stencilCleared = false; this.scale = 1; }
    P(name, vs, fs) { return this.g.prog(name, vs, fs); }
    fillProg() { return this.P('fill', SH.fillVS, SH.fillFS); }
    fsProg(name, fs) { return this.P(name, AE.FS_VS, fs); }

    // ===== 像素 → NDC 3x3 =====
    ndcMat(m, W, H) { // m: 2D 仿射 [a,b,c,d,e,f]（像素，y 向下）→ 列主序 mat3
      const sx = 2 / W, sy = -2 / H;
      return [m[0] * sx, m[1] * sy, 0, m[2] * sx, m[3] * sy, 0, m[4] * sx - 1, m[5] * sy + 1, 1];
    }
    upload(arr) { const gl = this.gl; gl.bindVertexArray(this.vaoGeo); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, arr instanceof Float32Array ? arr : new Float32Array(arr), gl.STREAM_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }

    // ===== 绘制记录 =====
    drawRecords(draws, Mt, W, H) {
      const gl = this.gl; const pr = this.fillProg().use();
      gl.enable(gl.STENCIL_TEST); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      let sc = Math.sqrt(Math.abs(Mt[0] * Mt[3] - Mt[1] * Mt[2])) || 1;
      for (const d of draws) {
        const M = A2.mul(Mt, d.mat); const msc = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
        const tol = 0.3 / msc;
        const batches = []; // 按 opa 分批
        for (const sh of d.shapes) { const last = batches[batches.length - 1]; if (last && last.opa === sh.opa) last.shapes.push(sh); else batches.push({ opa: sh.opa, shapes: [sh] }); }
        for (const b of batches) {
          const tris = []; let bb = [Infinity, Infinity, -Infinity, -Infinity];
          const addBB = (pts) => { for (let i = 0; i < pts.length; i += 2) { if (pts[i] < bb[0]) bb[0] = pts[i]; if (pts[i] > bb[2]) bb[2] = pts[i]; if (pts[i + 1] < bb[1]) bb[1] = pts[i + 1]; if (pts[i + 1] > bb[3]) bb[3] = pts[i + 1]; } };
          if (d.kind === 'fill') {
            for (const sh of b.shapes) for (const p of sh.polys) { const n = p.pts.length / 2; if (!p.closed && n < 3) continue; if (n < 3) continue; const x0 = p.pts[0], y0 = p.pts[1]; for (let i = 1; i < n - 1; i++) tris.push(x0, y0, p.pts[2 * i], p.pts[2 * i + 1], p.pts[2 * i + 2], p.pts[2 * i + 3]); addBB(p.pts); }
          } else {
            if (d.width <= 0) continue;
            for (const sh of b.shapes) for (const p of sh.polys) {
              const parts = d.dash > 0.01 ? G.dashPoly(p.pts, p.closed, [d.dash, d.dash], d.dashOff) : [p];
              for (const q of parts) G.strokeTris(q.pts, q.closed, d.width, d.cap, d.join, 4, tris);
              addBB(p.pts);
            }
            const pad = d.width * 1.6; bb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
          }
          if (!tris.length) continue;
          const pad = 3 / msc; bb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
          pr.m3('uM', this.ndcMat(M, W, H));
          gl.clearStencil(0); gl.stencilMask(0xFF); gl.clear(gl.STENCIL_BUFFER_BIT);
          // 模板写入
          gl.colorMask(false, false, false, false); gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
          if (d.kind === 'fill' && d.rule === 'evenodd') { gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT); }
          else if (d.kind === 'fill') { gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); }
          else { gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR_WRAP); }
          this.upload(tris); gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2);
          // 覆盖
          gl.colorMask(true, true, true, true); gl.stencilFunc(gl.NOTEQUAL, 0, 0xFF); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
          const col = d.color; const alpha = (col[3] === undefined ? 1 : col[3]) * d.opacity * b.opa;
          pr.v4('uColor', [col[0], col[1], col[2], alpha]);
          const gr = d.gradient;
          if (gr && gr.stops && gr.stops.length >= 2) {
            pr.i('uGrad', gr.type === 'radial' ? 2 : 1).v2('uG0', gr.p0).v2('uG1', gr.p1); const st = gr.stops.slice(0, 4); pr.i('uSN', st.length);
            const cols = [], poss = []; for (let i = 0; i < 4; i++) { const s = st[Math.min(i, st.length - 1)]; cols.push(...s[1].slice(0, 3), s[1][3] === undefined ? 1 : s[1][3]); poss.push(s[0]); }
            pr.v4v('uSC', cols).fv('uSP', poss);
          } else pr.i('uGrad', 0);
          this.upload([bb[0], bb[1], bb[2], bb[1], bb[2], bb[3], bb[0], bb[1], bb[2], bb[3], bb[0], bb[3]]);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
      }
      gl.disable(gl.STENCIL_TEST); gl.colorMask(true, true, true, true);
    }
    // 纹理四边形（局部矩形 rect=[x0,y0,x1,y1]）
    drawTexQuad(tex, rect, Mt, W, H, opacity = 1) {
      const gl = this.gl; const pr = this.P('texq', SH.texVS, SH.texFS).use();
      pr.m3('uM', this.ndcMat(Mt, W, H)).v4('uRect', [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]]).f('uOp', opacity).i('uTex', 0);
      this.g.tex(0, tex, gl.LINEAR); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
      this.upload([rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[1], rect[2], rect[3], rect[0], rect[3]]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // 将一组绘制命令渲染到 MSAA 并解析为新 RT
    withMS(W, H, fn) {
      const g = this.g, gl = this.gl; const ms = g.ms(W, H); gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fbo); gl.viewport(0, 0, W, H);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.stencilMask(0xFF); gl.clearColor(0, 0, 0, 0); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      fn(); const rt = g.rt(W, H); g.resolve(ms, rt); g.releaseMS(ms); return rt;
    }

    // ===== 全屏通道 =====
    pass(prog, out, setup) { const gl = this.gl; this.g.bind(out); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST); prog.use(); setup && setup(prog); this.g.fullscreen(); }
    copy(src, out, mul = 1) { const p = this.fsProg('copy', SH.copyFS); this.pass(p, out, pr => { pr.i('uTex', 0).f('uMul', mul); this.g.tex(0, src.tex || src, this.gl.LINEAR); }); }
    // 高斯模糊：返回（可能缩小的）RT。sigma 单位：src 像素
    blur(src, sigma, keep) {
      const g = this.g; if (sigma < 0.3) { const o = g.rt(src.w, src.h); this.copy(src, o); return o; }
      let cur = src, ownCur = false; let s = sigma;
      while (s > 7 && cur.w > 16 && cur.h > 16) { const nxt = g.rt(Math.ceil(cur.w / 2), Math.ceil(cur.h / 2)); this.copy(cur, nxt); if (ownCur) g.release(cur); cur = nxt; ownCur = true; s /= 2; }
      const p = this.fsProg('blur', SH.blurFS);
      const t = g.rt(cur.w, cur.h); this.pass(p, t, pr => { pr.i('uTex', 0).v2('uDir', [1 / cur.w, 0]).f('uSigma', s); g.tex(0, cur.tex, this.gl.LINEAR); });
      const o = g.rt(cur.w, cur.h); this.pass(p, o, pr => { pr.i('uTex', 0).v2('uDir', [0, 1 / cur.h]).f('uSigma', s); g.tex(0, t.tex, this.gl.LINEAR); });
      g.release(t); if (ownCur) g.release(cur); return o;
    }

    // ===== 效果 =====
    applyEffects(comp, L, t, rt, scale) {
      const g = this.g, ev = this.ev;
      for (const fx of L.effects) {
        if (!fx.on) continue; const q = k => ev.value(comp, L, `fx.${fx.id}.${k}`, t);
        let out = null;
        if (fx.type === 'blur') {
          const r = q('radius') * scale; if (r < 0.2) continue; const b = this.blur(rt, r * 0.5); out = g.rt(rt.w, rt.h); this.copy(b, out); g.release(b);
        } else if (fx.type === 'glow') {
          const thr = q('threshold') / 100, rad = q('radius') * scale, inten = q('intensity'), tint = q('tint'); if (inten <= 0 || rad < 0.2) continue;
          const th = g.rt(rt.w, rt.h); this.pass(this.fsProg('thr', SH.thrFS), th, pr => { pr.i('uTex', 0).f('uThr', thr); g.tex(0, rt.tex, this.gl.LINEAR); });
          const b = this.blur(th, rad * 0.5); g.release(th);
          out = g.rt(rt.w, rt.h); this.pass(this.fsProg('glow', SH.glowFS), out, pr => { pr.i('uTex', 0).i('uBlur', 1).f('uInt', inten).v3('uTint', tint); g.tex(0, rt.tex, this.gl.LINEAR); g.tex(1, b.tex, this.gl.LINEAR); });
          g.release(b);
        } else if (fx.type === 'shadow') {
          const col = q('color'), op = q('opacity') / 100, dir = q('direction') * U.DEG, dist = q('distance') * scale, soft = q('softness') * scale;
          const b = this.blur(rt, soft * 0.5); out = g.rt(rt.w, rt.h);
          // 方向：0° 向上? 采用 AE 习惯：135° 为右下
          const off = [Math.sin(dir) * dist / rt.w, Math.cos(dir) * dist / rt.h];
          this.pass(this.fsProg('shadow', SH.shadowFS), out, pr => { pr.i('uTex', 0).i('uBlur', 1).v2('uOff', [off[0], off[1]]).v4('uCol', [col[0], col[1], col[2], col[3] === undefined ? 1 : col[3]]).f('uOp', op); g.tex(0, rt.tex, this.gl.LINEAR); g.tex(1, b.tex, this.gl.LINEAR); });
          g.release(b);
        } else if (fx.type === 'hsl') {
          const h = q('hue'), s = q('sat') / 100, l = q('light') / 100; if (!h && !s && !l) continue;
          out = g.rt(rt.w, rt.h); this.pass(this.fsProg('hsl', SH.hslFS), out, pr => { pr.i('uTex', 0).f('uH', h).f('uS', s).f('uL', l); g.tex(0, rt.tex, this.gl.LINEAR); });
        }
        if (out) { g.release(rt); rt = out; }
      }
      return rt;
    }

    // ===== 蒙版：返回覆盖率纹理（alpha 通道）或 null =====
    maskTexture(comp, L, t, Mt, W, H, scale) {
      const g = this.g, ev = this.ev; const masks = L.masks.filter(m => m.mode !== 'none'); if (!masks.length) return null;
      let acc = g.rt(W, H); const firstSub = masks[0].mode === 'subtract' || masks[0].mode === 'intersect';
      g.bind(acc); g.clear(0, 0, 0, firstSub ? 1 : 0);
      for (const m of masks) {
        const path = ev.value(comp, L, `mk.${m.id}.path`, t); const feather = ev.value(comp, L, `mk.${m.id}.feather`, t) * scale, op = ev.value(comp, L, `mk.${m.id}.opacity`, t) / 100, expand = ev.value(comp, L, `mk.${m.id}.expand`, t);
        const polys = G.flattenShape(path, 0.3 / (Math.sqrt(Math.abs(Mt[0] * Mt[3] - Mt[1] * Mt[2])) || 1));
        const fills = [{ kind: 'fill', shapes: [{ polys: polys.filter(p => p.pts.length >= 6).map(p => ({ pts: p.pts, closed: true })), opa: 1 }], mat: A2.id(), color: [1, 1, 1, 1], opacity: 1, rule: 'nonzero' }];
        if (expand > 0) fills.push({ kind: 'stroke', shapes: fills[0].shapes, mat: A2.id(), color: [1, 1, 1, 1], opacity: 1, width: expand * 2, cap: 'round', join: 'round', dash: 0, dashOff: 0 });
        let cov = this.withMS(W, H, () => this.drawRecords(fills, Mt, W, H));
        if (feather > 0.2) { const b = this.blur(cov, feather * 0.5); g.release(cov); cov = b; }
        const nxt = g.rt(W, H); const mode = { add: 0, subtract: 1, intersect: 2, difference: 4 }[m.mode] || 0;
        this.pass(this.fsProg('maskc', SH.maskFS), nxt, pr => { pr.i('uAcc', 0).i('uCov', 1).i('uMode', mode).i('uInv', m.inv ? 1 : 0).f('uOp', op); g.tex(0, acc.tex, this.gl.LINEAR); g.tex(1, cov.tex, this.gl.LINEAR); });
        g.release(acc); g.release(cov); acc = nxt;
      }
      return acc;
    }

    // ===== 合成 =====
    // dst, src → out（out 不可与 dst 相同）
    composite(dst, src, out, o) {
      const g = this.g; const blend = { normal: 0, add: 1, screen: 2, multiply: 3, overlay: 4, adjust: 5 }[o.blend || 'normal'];
      this.pass(this.fsProg('comp', SH.compFS), out, pr => {
        pr.i('uDst', 0).i('uSrc', 1).i('uMatte', 2).f('uOp', o.opacity === undefined ? 1 : o.opacity).i('uBlend', blend).i('uMatteMode', o.matteMode || 0);
        g.tex(0, dst.tex, this.gl.NEAREST); g.tex(1, src.tex, this.gl.LINEAR); g.tex(2, o.matte ? o.matte.tex : g.dummy2D, this.gl.LINEAR);
      });
    }
    // 显示到画布（带视图矩形）
    present(rt, rect, checker) {
      const gl = this.gl, g = this.g; g.bind(null); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
      const pr = this.fsProg('present', SH.presentFS).use(); pr.i('uTex', 0).v4('uRect', rect).v2('uRes', [g.canvas.width, g.canvas.height]).f('uChecker', checker ? 1 : 0); g.tex(0, rt.tex, gl.LINEAR); g.fullscreen();
    }
  }
  AE.Renderer = Renderer; AE.SH = SH;
})();
