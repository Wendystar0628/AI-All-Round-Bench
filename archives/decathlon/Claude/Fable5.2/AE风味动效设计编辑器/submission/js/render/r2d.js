// 二维渲染：矢量填充/描边（模板缓冲 + 多重采样）、蒙版与羽化、效果、混合模式、遮罩
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const H = '#version 300 es\nprecision highp float; in vec2 vUV; out vec4 o;\n';

  const VS_VEC = `#version 300 es
  in vec2 aPos; uniform vec3 uM0; uniform vec3 uM1; uniform vec2 uRes;
  void main(){ vec3 p = vec3(aPos,1.); vec2 q = vec2(dot(uM0,p), dot(uM1,p)); gl_Position = vec4(q/uRes*2.-1., 0., 1.); }`;
  const FS_FLAT = `#version 300 es
  precision highp float; uniform vec4 uColor; out vec4 o; void main(){ o = uColor; }`;
  const VS_TEXQ = `#version 300 es
  in vec2 aPos; in vec2 aUV; uniform vec3 uM0; uniform vec3 uM1; uniform vec2 uRes; out vec2 vUV;
  void main(){ vec3 p = vec3(aPos,1.); vec2 q = vec2(dot(uM0,p), dot(uM1,p)); vUV = aUV; gl_Position = vec4(q/uRes*2.-1., 0., 1.); }`;
  const FS_TEXQ = H + `uniform sampler2D uT0; uniform float uOpacity; void main(){ o = texture(uT0, vUV) * uOpacity; }`;
  const FS_COPYOP = H + `uniform sampler2D uT0; uniform float uOpacity; void main(){ o = texture(uT0, vUV) * uOpacity; }`;
  const FS_BLUR = H + `uniform sampler2D uT0; uniform vec2 uDir; uniform float uSigma;
  void main(){ vec4 acc = vec4(0.); float tot = 0.; float s2 = 2.*uSigma*uSigma;
    for (int i = -20; i <= 20; i++) { float x = float(i); float w = exp(-x*x/s2); acc += texture(uT0, vUV + uDir*x) * w; tot += w; }
    o = acc / tot; }`;
  const FS_MASKAPPLY = H + `uniform sampler2D uT0; uniform sampler2D uT1; void main(){ o = texture(uT0, vUV) * texture(uT1, vUV).a; }`;
  const FS_MASKSRC = H + `uniform sampler2D uT0; uniform float uInv; uniform float uOpacity; void main(){ float a = texture(uT0, vUV).a; a = mix(a, 1.-a, uInv) * uOpacity; o = vec4(a); }`;
  const FS_BLEND = H + `uniform sampler2D uT0; uniform sampler2D uT1; uniform float uOpacity; uniform int uMode;
  void main(){ vec4 d = texture(uT0, vUV); vec4 s = texture(uT1, vUV) * uOpacity;
    if (uMode == 1 || s.a < 1e-4) { // 相加（也用于无 Alpha 的发光像素）
      float ao = s.a + d.a - s.a*d.a; o = vec4(uMode == 0 ? s.rgb + d.rgb*(1.-s.a) : d.rgb + s.rgb, ao); return; }
    vec3 Cd = d.a > 1e-5 ? min(d.rgb/d.a, vec3(4.)) : vec3(0.); vec3 Cs = min(s.rgb/s.a, vec3(4.)); vec3 B = Cs;
    if (uMode == 2) B = Cd + Cs - Cd*Cs;
    else if (uMode == 3) B = Cd*Cs;
    else if (uMode == 4) { vec3 cd = clamp(Cd,0.,1.), cs = clamp(Cs,0.,1.); B = mix(2.*cd*cs, 1.-2.*(1.-cd)*(1.-cs), step(0.5, cd)); }
    o = vec4(s.rgb*(1.-d.a) + d.rgb*(1.-s.a) + s.a*d.a*B, s.a + d.a - s.a*d.a); }`;
  const FS_MATTE = H + `uniform sampler2D uT0; uniform sampler2D uT1; uniform int uMode;
  void main(){ vec4 s = texture(uT0, vUV); vec4 m = texture(uT1, vUV); float v = (uMode == 0 || uMode == 1) ? m.a : dot(m.rgb, vec3(0.2126,0.7152,0.0722));
    v = clamp(v, 0., 1.); if (uMode == 1 || uMode == 3) v = 1. - v; o = s * v; }`;
  const FS_ADJ = H + `uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2; uniform float uOpacity; uniform float uUseMask;
  void main(){ float m = uOpacity * mix(1., texture(uT2, vUV).a, uUseMask); o = mix(texture(uT0, vUV), texture(uT1, vUV), m); }`;
  const FS_BRIGHT = H + `uniform sampler2D uT0; uniform float uTh;
  void main(){ vec4 c = texture(uT0, vUV); float l = max(c.r, max(c.g, c.b)); float w = smoothstep(uTh - 0.12, uTh + 0.12, l); o = vec4(c.rgb * w, 1.); }`;
  const FS_GLOWMIX = H + `uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2; uniform sampler2D uT3; uniform float uInt; uniform vec3 uTint;
  void main(){ vec4 s = texture(uT0, vUV); vec3 g = (texture(uT1, vUV).rgb*0.45 + texture(uT2, vUV).rgb*0.35 + texture(uT3, vUV).rgb*0.3) * uInt * uTint;
    float ga = clamp(max(g.r, max(g.g, g.b)), 0., 1.); o = vec4(s.rgb + g, s.a + ga - s.a*ga); }`;
  const FS_SHADOWMK = H + `uniform sampler2D uT0; uniform vec2 uOff; uniform vec4 uColor;
  void main(){ float a = texture(uT0, vUV - uOff).a * uColor.a; o = vec4(uColor.rgb * a, a); }`;
  const FS_UNDER = H + `uniform sampler2D uT0; uniform sampler2D uT1; void main(){ vec4 s = texture(uT0, vUV); vec4 u = texture(uT1, vUV); o = s + u * (1. - s.a); }`;
  const HSLF = `
  vec3 rgb2hsl(vec3 c){ float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); float l = (mx+mn)*0.5; float d = mx-mn; float h = 0., s = 0.;
    if (d > 1e-5) { s = l > 0.5 ? d/(2.-mx-mn) : d/(mx+mn); if (mx == c.r) h = (c.g-c.b)/d + (c.g < c.b ? 6. : 0.); else if (mx == c.g) h = (c.b-c.r)/d + 2.; else h = (c.r-c.g)/d + 4.; h /= 6.; }
    return vec3(h, s, l); }
  float h2r(float p, float q, float t){ t = fract(t); if (t < 1./6.) return p + (q-p)*6.*t; if (t < 0.5) return q; if (t < 2./3.) return p + (q-p)*(2./3.-t)*6.; return p; }
  vec3 hsl2rgb(vec3 h){ if (h.y < 1e-5) return vec3(h.z); float q = h.z < 0.5 ? h.z*(1.+h.y) : h.z + h.y - h.z*h.y; float p = 2.*h.z - q; return vec3(h2r(p,q,h.x+1./3.), h2r(p,q,h.x), h2r(p,q,h.x-1./3.)); }`;
  const FS_HSL = H + HSLF + `uniform sampler2D uT0; uniform vec3 uHSL;
  void main(){ vec4 s = texture(uT0, vUV); if (s.a < 1e-5) { o = s; return; } vec3 c = clamp(s.rgb/s.a, 0., 1.); vec3 over = max(s.rgb/s.a - 1., 0.);
    vec3 h = rgb2hsl(c); h.x = fract(h.x + uHSL.x); h.y = clamp(h.y * (1. + uHSL.y), 0., 1.); c = hsl2rgb(h);
    c = uHSL.z >= 0. ? mix(c, vec3(1.), uHSL.z) : c * (1. + uHSL.z); o = vec4((c + over*(1.+min(uHSL.z,0.)))*s.a, s.a); }`;
  const FS_TINT = H + `uniform sampler2D uT0; uniform vec3 uColor; uniform float uAmt; void main(){ vec4 s = texture(uT0, vUV); o = vec4(mix(s.rgb, uColor * s.a, uAmt), s.a); }`;
  const FS_LEVELS = H + `uniform sampler2D uT0; uniform float uB; uniform float uC;
  void main(){ vec4 s = texture(uT0, vUV); if (s.a < 1e-5) { o = s; return; } vec3 c = s.rgb/s.a; c = (c - 0.5) * (1. + uC) + 0.5 + uB; o = vec4(max(c, 0.)*s.a, s.a); }`;

  class R2D {
    constructor(glx) {
      this.x = glx; const gl = (this.gl = glx.gl);
      this.vbo = gl.createBuffer(); this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.qbo = gl.createBuffer(); this.qvao = gl.createVertexArray(); gl.bindVertexArray(this.qvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8); gl.bindVertexArray(null);
      this.pVec = glx.prog('vec', VS_VEC, FS_FLAT); this.pTexQ = glx.prog('texq', VS_TEXQ, FS_TEXQ, ['aPos', 'aUV']);
      this.scratch = new Float32Array(1 << 16);
    }
    buf(n) { if (this.scratch.length < n) this.scratch = new Float32Array(Math.max(n, this.scratch.length * 2)); return this.scratch; }
    // 开始向多重采样缓冲绘制
    begin(W, Hh) {
      const gl = this.gl, ms = this.x.msTarget(W, Hh, 'vec'); this.ms = ms;
      gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fbo); gl.viewport(0, 0, W, Hh); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true); gl.stencilMask(0xff); gl.clearColor(0, 0, 0, 0); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    // 结束并解析到纹理
    end(fmt) {
      const gl = this.gl, ms = this.ms; const t = this.x.target(ms.w, ms.h, 'rgba8');
      gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fbo);
      gl.blitFramebuffer(0, 0, ms.w, ms.h, 0, 0, ms.w, ms.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      return t;
    }
    setM(p, m) { const gl = this.gl; gl.uniform3f(p.u.uM0, m[0], m[2], m[4]); gl.uniform3f(p.u.uM1, m[1], m[3], m[5]); gl.uniform2f(p.u.uRes, this.ms.w, this.ms.h); }
    // 绘制一组矢量项（items 顺序：先发射者在上）
    drawItems(items, m) {
      const gl = this.gl, p = this.pVec; this.x.use(p); this.setM(p, m); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.enable(gl.STENCIL_TEST);
      const pxScale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      for (let ii = items.length - 1; ii >= 0; ii--) {
        const it = items[ii]; const a = (it.color[3] === undefined ? 1 : it.color[3]) * it.opacity; if (a <= 0.0005 || !it.contours.length) continue;
        let n = 0, bb = [Infinity, Infinity, -Infinity, -Infinity], pad = 0;
        if (it.kind === 'fill') {
          let cnt = 0; for (const c of it.contours) if (c.pts.length >= 6) cnt += (c.pts.length / 2 - 2) * 6;
          if (!cnt) continue; const b = this.buf(cnt);
          for (const c of it.contours) { const q = c.pts, k = q.length >> 1; if (k < 3) continue; const x0 = q[0], y0 = q[1]; for (let i = 1; i < k - 1; i++) { b[n++] = x0; b[n++] = y0; b[n++] = q[i * 2]; b[n++] = q[i * 2 + 1]; b[n++] = q[i * 2 + 2]; b[n++] = q[i * 2 + 3]; } bbAdd(bb, q); }
          gl.bufferData(gl.ARRAY_BUFFER, b.subarray(0, n), gl.STREAM_DRAW);
          gl.colorMask(false, false, false, false); gl.stencilFunc(gl.ALWAYS, 0, 0xff);
          if (it.rule === 'evenodd') gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
          else { gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); }
          gl.drawArrays(gl.TRIANGLES, 0, n / 2);
        } else {
          const tr = strokeTris(it.contours, it.width, it.cap, it.join, pxScale); n = tr.length; if (!n) continue;
          for (const c of it.contours) bbAdd(bb, c.pts); pad = it.width * (it.join === 'miter' ? 2.2 : 0.75) + 1;
          gl.bufferData(gl.ARRAY_BUFFER, tr, gl.STREAM_DRAW);
          gl.colorMask(false, false, false, false); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
          gl.drawArrays(gl.TRIANGLES, 0, n / 2);
        }
        // 覆盖
        const x0 = bb[0] - pad - 1, y0 = bb[1] - pad - 1, x1 = bb[2] + pad + 1, y1 = bb[3] + pad + 1;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1]), gl.STREAM_DRAW);
        gl.colorMask(true, true, true, true); gl.stencilFunc(gl.NOTEQUAL, 0, 0xff); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
        gl.uniform4f(p.u.uColor, it.color[0] * a, it.color[1] * a, it.color[2] * a, a);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disable(gl.STENCIL_TEST); gl.bindVertexArray(null);
    }
    // 绘制带纹理的四边形（预合成图层）：rect 为图层空间矩形
    drawTexQuad(tex, rect, m, opacity) {
      const gl = this.gl, p = this.pTexQ; this.x.use(p); this.setM(p, m); gl.disable(gl.STENCIL_TEST);
      const [x0, y0, x1, y1] = rect;
      gl.bindVertexArray(this.qvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, 0, 0, x1, y0, 1, 0, x1, y1, 1, 1, x0, y0, 0, 0, x1, y1, 1, 1, x0, y1, 0, 1]), gl.STREAM_DRAW);
      this.x.tex(0, tex.tex || tex); gl.uniform1i(p.u.uT0, 0); gl.uniform1f(p.u.uOpacity, opacity === undefined ? 1 : opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
    }
    // ---- 高斯模糊（大半径先降采样）----
    blur(src, sigma, keepSrc) {
      const x = this.x, gl = this.gl; gl.disable(gl.BLEND);
      if (sigma < 0.25) { if (keepSrc) { const c = x.target(src.w, src.h, src.fmt === 'rgba8' ? 'rgba16f' : src.fmt); x.blit(src, c); return c; } return src; }
      let cur = src, ds = 1; const owned = [];
      while (sigma / ds > 6 && ds < 32 && cur.w > 8 && cur.h > 8) { const t = x.target(Math.ceil(cur.w / 2), Math.ceil(cur.h / 2), 'rgba16f'); x.blit(cur, t); if (cur !== src) x.release(cur); cur = t; ds *= 2; }
      const s = sigma / ds; const p = x.full('blur', FS_BLUR);
      const a = x.target(cur.w, cur.h, 'rgba16f'); x.pass(p, a, [cur], (g, u) => { g.uniform2f(u.uDir, 1 / cur.w, 0); g.uniform1f(u.uSigma, s); });
      const b = x.target(cur.w, cur.h, 'rgba16f'); x.pass(p, b, [a], (g, u) => { g.uniform2f(u.uDir, 0, 1 / cur.h); g.uniform1f(u.uSigma, s); });
      x.release(a); if (cur !== src) x.release(cur); void owned;
      let out = b;
      while (out.w < src.w || out.h < src.h) { const nw = out.w * 2 >= src.w ? src.w : out.w * 2, nh = out.h * 2 >= src.h ? src.h : out.h * 2; const t = x.target(nw, nh, 'rgba16f'); x.blit(out, t); x.release(out); out = t; }
      if (!keepSrc) x.release(src);
      return out;
    }
    // ---- 效果链 ----
    applyEffects(tex, fx, t, rs) {
      const x = this.x, gl = this.gl, V = (p) => MF.Eval.val(p, t); gl.disable(gl.BLEND);
      for (const f of fx) {
        if (f.on === false) continue; const p = f.p;
        if (f.type === 'blur') tex = this.blur(tex, V(p.radius) * rs * 0.5);
        else if (f.type === 'glow') {
          const th = V(p.threshold) / 100, rad = Math.max(0.5, V(p.radius) * rs), inten = V(p.intensity), tint = V(p.color);
          if (inten <= 0) continue;
          const br = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('bright', FS_BRIGHT), br, [tex], (g, u) => g.uniform1f(u.uTh, th));
          const b1 = this.blur(br, rad * 0.3, true), b2 = this.blur(br, rad * 0.8, true), b3 = this.blur(br, rad * 2.2, true); x.release(br);
          const out = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('glowmix', FS_GLOWMIX), out, [tex, b1, b2, b3], (g, u) => { g.uniform1f(u.uInt, inten); g.uniform3f(u.uTint, tint[0], tint[1], tint[2]); });
          x.release(b1); x.release(b2); x.release(b3); x.release(tex); tex = out;
        } else if (f.type === 'shadow') {
          const c = V(p.color), op = V(p.opacity) / 100, ang = V(p.angle) * MF.DEG, dist = V(p.distance) * rs, soft = V(p.softness) * rs;
          const sh = x.target(tex.w, tex.h, 'rgba16f');
          // AE 的方向：0° 朝上，顺时针
          x.pass(x.full('shadowmk', FS_SHADOWMK), sh, [tex], (g, u) => { g.uniform2f(u.uOff, (Math.sin(ang) * dist) / tex.w, (-Math.cos(ang) * dist) / tex.h); g.uniform4f(u.uColor, c[0], c[1], c[2], op); });
          const bl = this.blur(sh, soft * 0.5);
          const out = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('under', FS_UNDER), out, [tex, bl]); x.release(bl); x.release(tex); tex = out;
        } else if (f.type === 'hsl') {
          const out = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('hsl', FS_HSL), out, [tex], (g, u) => g.uniform3f(u.uHSL, V(p.hue) / 360, V(p.sat) / 100, V(p.light) / 100)); x.release(tex); tex = out;
        } else if (f.type === 'tint') {
          const c = V(p.color); const out = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('tint', FS_TINT), out, [tex], (g, u) => { g.uniform3f(u.uColor, c[0], c[1], c[2]); g.uniform1f(u.uAmt, V(p.amount) / 100); }); x.release(tex); tex = out;
        } else if (f.type === 'levels') {
          const out = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('levels', FS_LEVELS), out, [tex], (g, u) => { g.uniform1f(u.uB, V(p.brightness) / 100); g.uniform1f(u.uC, V(p.contrast) / 100); }); x.release(tex); tex = out;
        }
      }
      return tex;
    }
    // ---- 蒙版：返回蒙版覆盖纹理（Alpha），m 为图层空间 → 像素 ----
    maskTexture(L, t, m, W, Hh, rs) {
      const x = this.x, gl = this.gl, V = (p) => MF.Eval.val(p, t);
      const masks = L.masks.filter((k) => k.mode !== 'none'); if (!masks.length) return null;
      const acc = x.target(W, Hh, 'rgba8'); const first = masks[0].mode;
      x.clear(acc, first === 'add' ? 0 : 1, first === 'add' ? 0 : 1, first === 'add' ? 0 : 1, first === 'add' ? 0 : 1);
      const pm = x.full('masksrc', FS_MASKSRC);
      for (const mk of masks) {
        const cs = MF.Scene.maskContours(L, mk, t);
        this.begin(W, Hh); if (cs.length) this.drawItems([{ kind: 'fill', contours: cs, color: [1, 1, 1, 1], opacity: 1, rule: 'nonzero' }], m);
        let cov = this.end(); const feather = V(mk.p.feather) * rs * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / rs;
        if (feather > 0.3) cov = this.blur(cov, feather * 0.5);
        gl.enable(gl.BLEND);
        if (mk.mode === 'subtract') gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR); else if (mk.mode === 'intersect') gl.blendFunc(gl.ZERO, gl.SRC_COLOR); else gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
        x.pass(pm, acc, [cov], (g, u) => { g.uniform1f(u.uInv, mk.inverted ? 1 : 0); g.uniform1f(u.uOpacity, V(mk.p.opacity) / 100); });
        gl.disable(gl.BLEND); x.release(cov);
      }
      return acc;
    }
    applyMask(tex, mask) { const x = this.x; this.gl.disable(this.gl.BLEND); const out = x.target(tex.w, tex.h, tex.fmt === 'rgba8' ? 'rgba8' : 'rgba16f'); x.pass(x.full('maskapply', FS_MASKAPPLY), out, [tex, mask]); x.release(tex); return out; }
    // ---- 合成 ----
    composite(acc, src, opacity, mode) {
      const x = this.x, gl = this.gl; const mi = { normal: 0, add: 1, screen: 2, multiply: 3, overlay: 4 }[mode] || 0;
      if (mi === 0) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); x.pass(x.full('copyop', FS_COPYOP), acc, [src], (g, u) => g.uniform1f(u.uOpacity, opacity)); gl.disable(gl.BLEND); return acc; }
      gl.disable(gl.BLEND); const out = x.target(acc.w, acc.h, 'rgba16f');
      x.pass(x.full('blend', FS_BLEND), out, [acc, src], (g, u) => { g.uniform1f(u.uOpacity, opacity); g.uniform1i(u.uMode, mi); }); x.release(acc); return out;
    }
    matte(tex, matteTex, mode) { const x = this.x; this.gl.disable(this.gl.BLEND); const out = x.target(tex.w, tex.h, 'rgba16f'); x.pass(x.full('matte', FS_MATTE), out, [tex, matteTex], (g, u) => g.uniform1i(u.uMode, { alpha: 0, alphaInv: 1, luma: 2, lumaInv: 3 }[mode] || 0)); x.release(tex); return out; }
    adjust(acc, fxTex, mask, opacity) { const x = this.x; this.gl.disable(this.gl.BLEND); const out = x.target(acc.w, acc.h, 'rgba16f'); x.pass(x.full('adj', FS_ADJ), out, [acc, fxTex, mask || fxTex], (g, u) => { g.uniform1f(u.uOpacity, opacity); g.uniform1f(u.uUseMask, mask ? 1 : 0); }); x.release(acc); return out; }
    // 累加（运动模糊取样平均）
    accumulate(acc, src, w) { const x = this.x, gl = this.gl; gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); x.pass(x.full('copyop', FS_COPYOP), acc, [src], (g, u) => g.uniform1f(u.uOpacity, w)); gl.disable(gl.BLEND); }
  }
  function bbAdd(bb, q) { for (let i = 0; i < q.length; i += 2) { if (q[i] < bb[0]) bb[0] = q[i]; if (q[i] > bb[2]) bb[2] = q[i]; if (q[i + 1] < bb[1]) bb[1] = q[i + 1]; if (q[i + 1] > bb[3]) bb[3] = q[i + 1]; } }
  // 描边三角形：每段一个四边形 + 连接/端点
  function strokeTris(contours, width, cap, join, pxScale) {
    const r = width / 2; if (r <= 0) return new Float32Array(0); const o = [];
    const nseg = Math.max(8, Math.min(64, Math.ceil(Math.sqrt(r * pxScale) * 3.5)));
    const circle = (x, y) => { for (let i = 0; i < nseg; i++) { const a0 = (i / nseg) * Math.PI * 2, a1 = ((i + 1) / nseg) * Math.PI * 2; o.push(x, y, x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r); } };
    for (const c of contours) {
      const p = c.pts, n = p.length >> 1; if (n < 1) continue; const closed = c.closed !== false && n > 2;
      if (n === 1) { if (cap !== 'butt') circle(p[0], p[1]); continue; }
      const segN = closed ? n : n - 1; let pdx = 0, pdy = 0, has = false, fdx = 0, fdy = 0;
      for (let k = 0; k < segN; k++) {
        const j = (k + 1) % n; let x0 = p[k * 2], y0 = p[k * 2 + 1], x1 = p[j * 2], y1 = p[j * 2 + 1]; let dx = x1 - x0, dy = y1 - y0; const l = Math.hypot(dx, dy); if (l < 1e-9) continue; dx /= l; dy /= l;
        if (!closed && cap === 'square') { if (k === 0) { x0 -= dx * r; y0 -= dy * r; } if (k === segN - 1) { x1 += dx * r; y1 += dy * r; } }
        const nx = -dy * r, ny = dx * r;
        o.push(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 + nx, y0 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny);
        if (has) joinAt(p[k * 2], p[k * 2 + 1], pdx, pdy, dx, dy); else { fdx = dx; fdy = dy; }
        pdx = dx; pdy = dy; has = true;
      }
      if (closed && has) joinAt(p[0], p[1], pdx, pdy, fdx, fdy);
      if (!closed && cap === 'round') { circle(p[0], p[1]); circle(p[(n - 1) * 2], p[(n - 1) * 2 + 1]); }
    }
    function joinAt(x, y, ax, ay, bx, by) {
      const cross = ax * by - ay * bx, dot = ax * bx + ay * by; const ang = Math.abs(Math.atan2(cross, dot));
      if (ang * r * pxScale < 0.15) return;
      if (join === 'round') { circle(x, y); return; }
      const s = cross > 0 ? -1 : 1; const n0x = -ay * r * s, n0y = ax * r * s, n1x = -by * r * s, n1y = bx * r * s;
      o.push(x, y, x + n0x, y + n0y, x + n1x, y + n1y);
      if (join === 'miter') { let mx = n0x + n1x, my = n0y + n1y; const ml = Math.hypot(mx, my); if (ml > 1e-6) { const k = (r / (ml / 2)) ; if (k <= 4) { mx = (mx / ml) * r * k; my = (my / ml) * r * k; o.push(x + n0x, y + n0y, x + mx, y + my, x + n1x, y + n1y); } } }
    }
    return new Float32Array(o);
  }
  MF.R2D = R2D; MF.strokeTris = strokeTris;
})();
