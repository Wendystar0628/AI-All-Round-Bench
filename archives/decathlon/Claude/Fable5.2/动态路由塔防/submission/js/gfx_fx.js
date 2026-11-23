/* 网络安全攻防战 — 特效与战场信息层：粒子、光束、冲击环、血条、状态图标、路线、格子高亮、飘字 */
(function (root) {
  'use strict';
  const TD = root.TD, THREE = root.THREE, GX = TD.GX, G = GX.G;
  const V3 = THREE.Vector3, PI = Math.PI;
  const col = (h) => new THREE.Color(h);

  // ---------- 状态图标图集 ----------
  const ICONS = ['encrypt', 'shield', 'reveal', 'slow', 'root', 'mark', 'stun', 'hidden', 'nosh', 'skill', 'block', 'iso'];
  function iconAtlas() {
    const n = ICONS.length, s = 64;
    return GX.canvasTex(s * n, s, (g) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      ICONS.forEach((k, i) => {
        g.save(); g.translate(i * s + s / 2, s / 2);
        const bg = { encrypt: '#ff3050', shield: '#35c8ff', reveal: '#ffe14a', slow: '#7fb4ff', root: '#ffb53a', mark: '#ff8a3a', stun: '#fff07a', hidden: '#b56aff', nosh: '#c060ff', skill: '#55ff9a', block: '#ffffff', iso: '#ff7a3a' }[k];
        g.fillStyle = 'rgba(6,10,18,0.88)'; g.beginPath(); g.arc(0, 0, 29, 0, 7); g.fill();
        g.strokeStyle = bg; g.lineWidth = 4; g.stroke(); g.fillStyle = bg; g.lineWidth = 5;
        if (k === 'encrypt') { g.fillRect(-13, -4, 26, 20); g.beginPath(); g.arc(0, -5, 9, PI, 0); g.stroke(); g.fillStyle = '#12060a'; g.fillRect(-2.5, 2, 5, 9); }
        else if (k === 'shield') { g.beginPath(); g.moveTo(0, -18); g.lineTo(15, -11); g.lineTo(13, 6); g.lineTo(0, 18); g.lineTo(-13, 6); g.lineTo(-15, -11); g.closePath(); g.fill(); }
        else if (k === 'reveal') { g.beginPath(); g.moveTo(-19, 0); g.quadraticCurveTo(0, -17, 19, 0); g.quadraticCurveTo(0, 17, -19, 0); g.stroke(); g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); }
        else if (k === 'slow') { for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(-13 + j * 9, -10); g.lineTo(-4 + j * 9, 0); g.lineTo(-13 + j * 9, 10); g.stroke(); } }
        else if (k === 'root') { g.strokeRect(-14, -14, 28, 28); g.beginPath(); g.moveTo(-5, -14); g.lineTo(-5, 14); g.moveTo(5, -14); g.lineTo(5, 14); g.stroke(); }
        else if (k === 'mark') { g.beginPath(); g.arc(0, 0, 12, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-19, 0); g.lineTo(-6, 0); g.moveTo(6, 0); g.lineTo(19, 0); g.moveTo(0, -19); g.lineTo(0, -6); g.moveTo(0, 6); g.lineTo(0, 19); g.stroke(); }
        else if (k === 'stun') { g.beginPath(); for (let j = 0; j < 10; j++) { const a = j / 10 * PI * 2 - PI / 2, r = j % 2 ? 7 : 18; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
        else if (k === 'hidden') { g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 2); }
        else if (k === 'nosh') { g.beginPath(); g.moveTo(0, -18); g.lineTo(15, -11); g.lineTo(13, 6); g.lineTo(0, 18); g.lineTo(-13, 6); g.lineTo(-15, -11); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(-16, 16); g.lineTo(16, -16); g.stroke(); }
        else if (k === 'skill') { g.beginPath(); g.moveTo(4, -19); g.lineTo(-10, 3); g.lineTo(0, 3); g.lineTo(-4, 19); g.lineTo(10, -3); g.lineTo(0, -3); g.closePath(); g.fill(); }
        else if (k === 'block') { g.fillRect(-15, -5, 30, 10); }
        else if (k === 'iso') { g.beginPath(); g.moveTo(-13, -13); g.lineTo(13, 13); g.moveTo(13, -13); g.lineTo(-13, 13); g.stroke(); }
        g.restore();
      });
    });
  }

  // ---------- 广告牌层（血条与图标）----------
  class Billboards {
    constructor(max, atlas) {
      this.max = max; this.n = 0;
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      for (const a of [this.aPos, this.aSize, this.aCol, this.aPar]) a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, toneMapped: false, uniforms: { uMap: { value: atlas }, uN: { value: ICONS.length } },
        vertexShader: `attribute vec3 iPos; attribute vec4 iSize; attribute vec4 iCol; attribute vec4 iPar; varying vec2 vUv; varying vec4 vCol; varying vec4 vPar;
          void main(){ vUv = uv; vCol = iCol; vPar = iPar; vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * iSize.xy + iSize.zw; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMap; uniform float uN; varying vec2 vUv; varying vec4 vCol; varying vec4 vPar;
          void main(){
            if (vPar.x > 0.5) { vec4 t = texture2D(uMap, vec2((vPar.y + vUv.x) / uN, vUv.y)); gl_FragColor = vec4(t.rgb, t.a * vCol.a); return; }
            float bx = min(vUv.x, 1.0 - vUv.x) * vPar.w, by = min(vUv.y, 1.0 - vUv.y); // 边框
            float brd = step(bx, 0.03 * vPar.w / 1.0 * 0.0 + 0.045) + step(by, 0.16);
            vec3 c = vec3(0.03, 0.05, 0.08); float a = 0.88;
            float inner = step(0.16, by) * step(0.045, bx);
            float hpTop = vPar.z > 0.001 ? 0.62 : 1.0;
            if (inner > 0.5) {
              if (vUv.y < hpTop) { c = vUv.x <= vPar.y ? vCol.rgb : vec3(0.16, 0.05, 0.06); float seg = step(0.92, fract(vUv.x * vPar.w * 2.5)); c *= 1.0 - seg * 0.35; }
              else { c = vUv.x <= vPar.z ? vec3(0.45, 0.9, 1.0) : vec3(0.05, 0.12, 0.16); }
            }
            gl_FragColor = vec4(c, a * vCol.a); }`
      });
      this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 30; this.geo = g;
    }
    begin() { this.n = 0; }
    bar(x, y, z, w, h, frac, shield, r, gg, b, a) {
      if (this.n >= this.max) return; const i = this.n++;
      this.aPos.setXYZ(i, x, y, z); this.aSize.setXYZW(i, w, h, 0, 0); this.aCol.setXYZW(i, r, gg, b, a == null ? 1 : a); this.aPar.setXYZW(i, 0, frac, shield, w / h * 0.12);
    }
    icon(x, y, z, s, idx, ox, a) {
      if (this.n >= this.max) return; const i = this.n++;
      this.aPos.setXYZ(i, x, y, z); this.aSize.setXYZW(i, s, s, ox || 0, 0); this.aCol.setXYZW(i, 1, 1, 1, a == null ? 1 : a); this.aPar.setXYZW(i, 1, idx, 0, 0);
    }
    end() { this.geo.instanceCount = this.n; this.aPos.needsUpdate = this.aSize.needsUpdate = this.aCol.needsUpdate = this.aPar.needsUpdate = true; }
  }

  // ---------- 格子高亮层 ----------
  class CellLayer {
    constructor(max, uT) {
      this.max = max; this.n = 0;
      const g = new THREE.InstancedBufferGeometry(); const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-PI / 2);
      g.setAttribute('position', p.attributes.position); g.setAttribute('uv', p.attributes.uv); g.setIndex(p.index);
      this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      this.aPos.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, toneMapped: false, uniforms: { uT },
        vertexShader: `attribute vec4 iPos; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol; varying float vK;
          void main(){ vUv = uv; vCol = iCol; vK = iPos.w; vec3 p = position * 0.96 + iPos.xyz; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `uniform float uT; varying vec2 vUv; varying vec4 vCol; varying float vK;
          void main(){ vec2 q = abs(vUv - 0.5); float b = max(q.x, q.y); float brd = smoothstep(0.43, 0.47, b); float a;
            vec3 c = vCol.rgb;
            if (vK < 0.5) a = 0.16 + brd * 0.7;                                                   // 普通高亮
            else if (vK < 1.5) { float s = step(0.5, fract((vUv.x + vUv.y) * 3.0 - uT * 0.8)); a = 0.12 + s * 0.3 + brd * 0.5; }   // 条纹（降级）
            else if (vK < 2.5) { float bl = 0.5 + 0.5 * sin(uT * 11.0); float x = min(abs(vUv.x - vUv.y), abs(vUv.x + vUv.y - 1.0)); a = (0.25 + 0.4 * bl) + brd * 0.6 + smoothstep(0.09, 0.05, x) * 0.6; }  // 预警 / 拒绝
            else if (vK < 3.5) { a = brd * 0.9 + 0.05; }                                           // 仅边框
            else { float cor = step(0.3, q.x) * step(0.3, q.y); a = cor * brd * 1.0 + 0.1 + 0.08 * sin(uT * 6.0); }  // 选中（四角）
            gl_FragColor = vec4(c * 1.3, a * vCol.a); }`
      });
      this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.geo = g;
    }
    begin() { this.n = 0; }
    add(x, y, z, kind, c, a) { if (this.n >= this.max) return; const i = this.n++; this.aPos.setXYZW(i, x, y, z, kind); this.aCol.setXYZW(i, c.r, c.g, c.b, a == null ? 1 : a); }
    end() { this.geo.instanceCount = this.n; this.aPos.needsUpdate = this.aCol.needsUpdate = true; }
  }

  class FX {
    constructor(stage, map) {
      this.stage = stage; this.map = map; this.root = new THREE.Group(); stage.scene.add(this.root);
      this.uT = { value: 0 }; this.t = 0;
      this.rng = TD.makeRng(555);
      // 粒子
      const N = this.PN = 3600; this.pi = 0;
      this.pp = new Float32Array(N * 3); this.pc = new Float32Array(N * 4); this.ps = new Float32Array(N);
      this.pv = new Float32Array(N * 3); this.pl = new Float32Array(N); this.pm = new Float32Array(N); this.pg = new Float32Array(N); this.pd = new Float32Array(N); this.pz = new Float32Array(N); this.pcol = new Float32Array(N * 3);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(this.pp, 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aCol', new THREE.BufferAttribute(this.pc, 4).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aSize', new THREE.BufferAttribute(this.ps, 1).setUsage(THREE.DynamicDrawUsage));
      this.pMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uScale: { value: 600 } },
        vertexShader: `attribute vec4 aCol; attribute float aSize; varying vec4 vC; uniform float uScale; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0); }`
      });
      this.points = new THREE.Points(pg, this.pMat); this.points.frustumCulled = false; this.points.renderOrder = 12; this.root.add(this.points);
      // 池
      this.beams = []; this.rings = []; this.glows = []; this.texts = []; this.live = [];
      this.bars = new Billboards(420, iconAtlas()); this.root.add(this.bars.mesh);
      this.cells = new CellLayer(700, this.uT); this.root.add(this.cells.mesh);
      this.routes = {}; this.preview = {}; this.ghosts = []; this.routeTags = [];
      this.circles = []; this.marks = []; this.packets = null; this._initPackets();
      this._v = new V3(); this._q = new THREE.Quaternion(); this._up = new V3(0, 1, 0);
    }
    dispose() { this.stage.scene.remove(this.root); }
    wx(x) { return this.map.wx(x); } wz(y) { return this.map.wz(y); }

    // ---------- 粒子 ----------
    spawn(x, y, z, vx, vy, vz, life, size, c, grav, drag) {
      const i = this.pi; this.pi = (this.pi + 1) % this.PN;
      this.pp[i * 3] = x; this.pp[i * 3 + 1] = y; this.pp[i * 3 + 2] = z; this.pv[i * 3] = vx; this.pv[i * 3 + 1] = vy; this.pv[i * 3 + 2] = vz;
      this.pl[i] = life; this.pm[i] = life; this.pz[i] = size; this.pg[i] = grav || 0; this.pd[i] = drag == null ? 1.5 : drag;
      this.pcol[i * 3] = c.r; this.pcol[i * 3 + 1] = c.g; this.pcol[i * 3 + 2] = c.b;
    }
    burst(x, y, z, o) {
      const r = this.rng, c = o.color, n = o.n || 12, sp = o.speed || 2;
      for (let k = 0; k < n; k++) {
        const a = r() * PI * 2, e = (r() - 0.5) * PI * (o.flat ? 0.15 : 1), s = sp * (0.4 + r() * 0.8), ce = Math.cos(e);
        this.spawn(x + (r() - 0.5) * (o.spread || 0), y + (r() - 0.5) * (o.spread || 0) * 0.5, z + (r() - 0.5) * (o.spread || 0), Math.cos(a) * ce * s, Math.sin(e) * s + (o.up || 0), Math.sin(a) * ce * s, (o.life || 0.5) * (0.6 + r() * 0.7), (o.size || 0.12) * (0.6 + r() * 0.8), c, o.grav, o.drag);
      }
    }
    _updParticles(dt) {
      const N = this.PN, pp = this.pp, pv = this.pv, pl = this.pl;
      for (let i = 0; i < N; i++) {
        if (pl[i] <= 0) { if (this.ps[i] !== 0) { this.ps[i] = 0; this.pc[i * 4 + 3] = 0; } continue; }
        pl[i] -= dt; const k = Math.max(0, pl[i] / this.pm[i]), dr = Math.max(0, 1 - this.pd[i] * dt);
        pv[i * 3] *= dr; pv[i * 3 + 1] = pv[i * 3 + 1] * dr - this.pg[i] * dt; pv[i * 3 + 2] *= dr;
        pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
        this.pc[i * 4] = this.pcol[i * 3]; this.pc[i * 4 + 1] = this.pcol[i * 3 + 1]; this.pc[i * 4 + 2] = this.pcol[i * 3 + 2]; this.pc[i * 4 + 3] = k * 1.6;
        this.ps[i] = this.pz[i] * (0.4 + 0.6 * k);
      }
      const g = this.points.geometry; g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
      this.pMat.uniforms.uScale.value = this.stage.h * (this.stage.pr || 1) / (2 * Math.tan(this.stage.camera.fov * PI / 360));
    }

    // ---------- 光束 / 环 / 辉光 / 飘字 ----------
    _pool(arr, make) { for (const o of arr) if (!o.on) return o; const o = make(); arr.push(o); this.root.add(o.mesh); return o; }
    beam(x1, y1, z1, x2, y2, z2, o) {
      const b = this._pool(this.beams, () => ({ mesh: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), GX.basicAdd(0xffffff, 1)) }));
      b.on = true; b.t = 0; b.life = o.life || 0.2; b.w = o.width || 0.05; b.mesh.visible = true; b.mesh.material.color.copy(o.color); b.a = o.alpha || 1; b.grow = o.grow || 0;
      this._v.set(x2 - x1, y2 - y1, z2 - z1); const len = this._v.length(); b.len = len;
      b.mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); b.mesh.quaternion.setFromUnitVectors(this._up, this._v.normalize()); b.mesh.scale.set(b.w, len, b.w); b.mesh.renderOrder = 11;
      return b;
    }
    ring(x, y, z, o) {
      const r = this._pool(this.rings, () => ({ mesh: new THREE.Mesh(G.ring(0.86, 1, 56), GX.basicAdd(0xffffff, 1)) }));
      r.on = true; r.t = 0; r.life = o.life || 0.5; r.r0 = o.r0 || 0.1; r.r1 = o.r1 || 1.5; r.a = o.alpha || 0.9; r.mesh.visible = true; r.mesh.material.color.copy(o.color); r.mesh.position.set(x, y, z); r.mesh.renderOrder = 10; r.ease = o.ease !== false;
      return r;
    }
    glow(x, y, z, o) {
      const g = this._pool(this.glows, () => ({ mesh: new THREE.Sprite(new THREE.SpriteMaterial({ map: GX.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })) }));
      g.on = true; g.t = 0; g.life = o.life || 0.25; g.s = o.size || 1; g.a = o.alpha || 1; g.mesh.visible = true; g.mesh.material.color.copy(o.color); g.mesh.position.set(x, y, z); g.mesh.renderOrder = 13;
      return g;
    }
    text(x, y, z, str, o) {
      o = o || {};
      let t = null; for (const q of this.texts) if (!q.on) { t = q; break; }
      if (!t) { const c = document.createElement('canvas'); c.width = 320; c.height = 80; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; t = { c, tex, mesh: new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })) }; t.mesh.renderOrder = 40; this.texts.push(t); this.root.add(t.mesh); }
      const g = t.c.getContext('2d'); g.clearRect(0, 0, 320, 80); g.font = '800 ' + (o.px || 46) + 'px ' + GX.MONO + ',' + GX.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = 'rgba(4,8,14,0.92)'; g.strokeText(str, 160, 42); g.fillStyle = o.color || '#fff'; g.fillText(str, 160, 42); t.tex.needsUpdate = true;
      t.on = true; t.t = 0; t.life = o.life || 0.9; t.x = x; t.y = y; t.z = z; t.rise = o.rise == null ? 0.7 : o.rise; t.s = o.size || 0.9; t.mesh.visible = true;
      return t;
    }
    // 持续型对象：每帧回调，返回 false 结束
    add(fn) { this.live.push(fn); }

    // ---------- 路线 ----------
    _ribbonMat(c, style) {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
        uniforms: { uT: this.uT, uCol: { value: col(c) }, uStyle: { value: style }, uExit: { value: 0 }, uAlpha: { value: 1 }, uFlash: { value: -10 }, uLen: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uT, uStyle, uExit, uAlpha, uFlash, uLen; uniform vec3 uCol; varying vec2 vUv;
          void main(){ float x = vUv.x, y = vUv.y - 0.5; float edge = smoothstep(0.5, 0.34, abs(y)); float a; vec3 c = uCol;
            if (uStyle < 0.5) { float p = fract((x - abs(y) * 0.55) * 1.25 - uT * 1.25); float ch = smoothstep(0.0, 0.07, p) * smoothstep(0.46, 0.38, p);
              if (uExit > 0.5) ch *= smoothstep(0.03, 0.07, abs(p - 0.23));
              a = (0.3 + ch * 0.7) * edge; c *= 0.75 + ch * 0.9;
              float f = smoothstep(1.6, 0.0, abs(x - uFlash)); c += vec3(1.0) * f * 1.6; a = max(a, f * edge);
            } else if (uStyle < 1.5) { float d = step(0.42, fract(x * 1.8 - uT * 2.2)); float bl = 0.7 + 0.3 * sin(uT * 9.0); a = (0.12 + d * 0.88) * bl * smoothstep(0.5, 0.42, abs(y)); c = mix(vec3(1.0), uCol, smoothstep(0.1, 0.34, abs(y))) * 1.5; }
            else { float d = step(0.5, fract(x * 2.2)); a = d * edge * 0.55; c = mix(uCol, vec3(1.0, 0.25, 0.25), 0.6); }
            gl_FragColor = vec4(c, a * uAlpha); }`
      });
    }
    _ribbonGeo(cells, off, width, y0) {
      const g = this.map.grid, pts = [];
      for (const ci of cells) { const c = g.cells[ci]; pts.push([this.wx(c.x), (c.type === 'node' ? 0.1 : 0.0) + y0, this.wz(c.y)]); }
      const n = pts.length, pos = [], uv = [], idx = []; let dist = 0;
      const dirs = []; for (let i = 0; i < n - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][2] - pts[i][2], l = Math.hypot(dx, dz) || 1; dirs.push([dx / l, dz / l]); }
      // 逐段展开（拐角处用斜接）
      for (let i = 0; i < n; i++) {
        const d0 = dirs[Math.max(0, i - 1)], d1 = dirs[Math.min(n - 2, i)] || d0;
        let nx = -(d0[1] + d1[1]), nz = (d0[0] + d1[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const cosH = Math.max(0.5, nx * -d0[1] + nz * d0[0]); const k = 1 / cosH;
        const cx = pts[i][0] + nx * off * k, cz = pts[i][2] + nz * off * k;
        if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
        pos.push(cx - nx * width * k / 2, pts[i][1], cz - nz * width * k / 2, cx + nx * width * k / 2, pts[i][1], cz + nz * width * k / 2);
        uv.push(dist, 0, dist, 1);
        if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.userData.len = dist; return geo;
    }
    _off(id, ids) { const k = ids.indexOf(id), n = ids.length; return n === 1 ? 0 : (k - (n - 1) / 2) * 0.24; }
    setRoutes(routes, flashIds) {
      const ids = Object.keys(routes).sort();
      for (const id of ids) {
        let r = this.routes[id];
        if (!r) { r = this.routes[id] = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), this._ribbonMat(TD.ENTRY_COLORS[id], 0)), flash: -1 }; r.mesh.renderOrder = 5; r.mesh.frustumCulled = false; this.root.add(r.mesh); }
        r.mesh.geometry.dispose(); r.mesh.geometry = this._ribbonGeo(routes[id].cells, this._off(id, ids), 0.19, 0.034);
        r.mesh.material.uniforms.uExit.value = routes[id].exit === 'Y' ? 1 : 0; r.len = r.mesh.geometry.userData.len; r.cells = routes[id].cells; r.exit = routes[id].exit;
        if (flashIds && flashIds.includes(id)) r.flash = 0;
      }
    }
    // 预览路线：routes 可含 null（被封死）
    setPreview(routes, changed) {
      for (const id in this.preview) this.preview[id].mesh.visible = false;
      for (const t of this.routeTags) { this.root.remove(t); t.material.map.dispose(); t.material.dispose(); } this.routeTags.length = 0;
      if (!routes) return;
      const ids = Object.keys(routes).sort();
      for (const id of ids) {
        if (!routes[id] || !changed.includes(id)) continue;
        let r = this.preview[id];
        if (!r) { r = this.preview[id] = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), this._ribbonMat(TD.ENTRY_COLORS[id], 1)) }; r.mesh.renderOrder = 7; r.mesh.frustumCulled = false; this.root.add(r.mesh); }
        r.mesh.geometry.dispose(); r.mesh.geometry = this._ribbonGeo(routes[id].cells, this._off(id, ids), 0.3, 0.075); r.mesh.visible = true;
        // 在与当前路线分叉处挂一个标签
        const cur = this.routes[id] ? this.routes[id].cells : []; let k = 0; while (k < cur.length && k < routes[id].cells.length && cur[k] === routes[id].cells[k]) k++;
        const ci = routes[id].cells[Math.min(routes[id].cells.length - 1, k + 2)], c = this.map.grid.cells[ci];
        const tag = GX.textSprite('预览 ' + id + ' → ' + routes[id].exit, { size: 34, color: '#fff', bg: 'rgba(8,16,28,0.9)', border: TD.ENTRY_COLORS[id], scale: 0.0098, depthTest: false });
        tag.position.set(this.wx(c.x), 1.25 + ids.indexOf(id) * 0.42, this.wz(c.y)); tag.renderOrder = 45; this.root.add(tag); this.routeTags.push(tag);
      }
    }
    // 改道瞬间：旧路线残影 + 新路线流光 + 标签
    routeChanged(old, routes, changed) {
      const ids = Object.keys(routes).sort();
      for (const id of changed) {
        if (old[id] && old[id].cells.length > 1) {
          const m = this._ribbonMat(TD.ENTRY_COLORS[id], 2); const mesh = new THREE.Mesh(this._ribbonGeo(old[id].cells, this._off(id, ids), 0.2, 0.05), m); mesh.renderOrder = 6; this.root.add(mesh);
          let t = 0; this.add((dt) => { t += dt; m.uniforms.uAlpha.value = Math.max(0, 1 - t / 1.8); if (t >= 1.8) { this.root.remove(mesh); mesh.geometry.dispose(); m.dispose(); return false; } return true; });
        }
        const r = routes[id], cur = old[id] ? old[id].cells : []; let k = 0; while (k < cur.length && k < r.cells.length && cur[k] === r.cells[k]) k++;
        const c = this.map.grid.cells[r.cells[Math.min(r.cells.length - 1, k + 1)]];
        const tag = GX.textSprite(id + ' 改道 → ' + r.exit, { size: 36, color: '#fff', bg: 'rgba(8,16,28,0.92)', border: TD.ENTRY_COLORS[id], tag: '⇄', tagBg: TD.ENTRY_COLORS[id], scale: 0.0105, depthTest: false });
        tag.position.set(this.wx(c.x), 1.3 + ids.indexOf(id) * 0.45, this.wz(c.y)); tag.renderOrder = 46; this.root.add(tag);
        let t = 0; const s0 = tag.scale.clone(); this.add((dt) => { t += dt; const kk = TD.clamp(this.stage.cam.dist / 34, 0.32, 1.2); tag.scale.set(s0.x * kk, s0.y * kk, 1); tag.position.y += dt * 0.12; tag.material.opacity = t < 2.0 ? 1 : Math.max(0, 1 - (t - 2.0) / 0.6); if (t >= 2.6) { this.root.remove(tag); tag.material.map.dispose(); tag.material.dispose(); return false; } return true; });
      }
    }

    // ---------- 业务流量（正常数据包沿路线流动，纯视觉）----------
    _initPackets() {
      const N = this.pkN = 90; const m = GX.M.pkt.clone(); m.emissiveIntensity = 0.5;
      this.packets = new THREE.InstancedMesh(GX.pktGeo(), m, N); this.packets.frustumCulled = false; this.packets.castShadow = true; this.root.add(this.packets);
      this._pm = new THREE.Matrix4(); this._pq = new THREE.Quaternion(); this._pe = new THREE.Euler(); this._ps = new V3(); this._pp = new V3();
    }
    _updPackets() {
      const ids = Object.keys(this.routes).sort(); let n = 0; const g = this.map.grid;
      for (const id of ids) {
        const r = this.routes[id]; if (!r.cells || r.cells.length < 2) continue;
        const L = r.cells.length - 1, per = Math.floor(this.pkN / ids.length), off = this._off(id, ids);
        for (let k = 0; k < per; k++) {
          const sp = 1.3, gap = 3.1; let u = (this.t * sp + k * gap + ids.indexOf(id) * 1.3) % (per * gap);
          if (u >= L) { continue; }
          const i = Math.floor(u), f = u - i, a = g.cells[r.cells[i]], b = g.cells[r.cells[i + 1]];
          const dx = b.x - a.x, dz = b.y - a.y; const x = this.wx(a.x + dx * f) - dz * (off + 0.0), z = this.wz(a.y + dz * f) + dx * (off + 0.0);
          const fade = Math.min(1, u * 2, (L - u) * 2);
          this._pe.set(0, Math.atan2(dx, dz), 0); this._pq.setFromEuler(this._pe); this._ps.setScalar(0.62 * fade); this._pp.set(x, 0.13 + (a.type === 'node' || b.type === 'node' ? 0.06 : 0) + Math.sin(this.t * 3 + k) * 0.012, z);
          this.packets.setMatrixAt(n++, this._pm.compose(this._pp, this._pq, this._ps));
        }
      }
      this.packets.count = n; this.packets.instanceMatrix.needsUpdate = true;
    }

    // ---------- 范围圈 ----------
    beginOverlay() { this.cells.begin(); this._ci = 0; }
    circle(x, z, r, c, y, a) {
      let o = this.circles[this._ci];
      if (!o) { const m1 = GX.basicAdd(0xffffff, 0.85), m2 = GX.basicAdd(0xffffff, 0.06); o = { ring: new THREE.Mesh(G.ring(0.985, 1, 80), m1), disc: new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-PI / 2), m2) }; o.ring.renderOrder = 8; o.disc.renderOrder = 8; this.root.add(o.ring, o.disc); this.circles.push(o); }
      this._ci++; o.ring.visible = o.disc.visible = true; o.ring.material.color.copy(c); o.disc.material.color.copy(c); o.ring.material.opacity = (a == null ? 1 : a) * 0.85; o.disc.material.opacity = (a == null ? 1 : a) * 0.06;
      o.ring.position.set(x, y == null ? 0.06 : y, z); o.disc.position.copy(o.ring.position); o.ring.scale.set(r, 1, r); o.disc.scale.set(r, 1, r);
    }
    endOverlay() { this.cells.end(); for (let i = this._ci; i < this.circles.length; i++) { this.circles[i].ring.visible = this.circles[i].disc.visible = false; } }

    // ---------- 每帧 ----------
    update(dt) {
      this.t += dt; this.uT.value = this.t;
      this._updParticles(dt);
      for (const b of this.beams) { if (!b.on) continue; b.t += dt; const k = 1 - b.t / b.life; if (k <= 0) { b.on = false; b.mesh.visible = false; continue; } const w = b.w * (b.grow ? 1 + b.grow * (1 - k) : k * 0.6 + 0.4); b.mesh.scale.set(w, b.len, w); b.mesh.material.opacity = k * b.a; }
      for (const r of this.rings) { if (!r.on) continue; r.t += dt; const u = r.t / r.life; if (u >= 1) { r.on = false; r.mesh.visible = false; continue; } const e = r.ease ? TD.easeOut(u) : u, s = r.r0 + (r.r1 - r.r0) * e; r.mesh.scale.set(s, 1, s); r.mesh.material.opacity = r.a * (1 - u); }
      for (const g of this.glows) { if (!g.on) continue; g.t += dt; const u = g.t / g.life; if (u >= 1) { g.on = false; g.mesh.visible = false; continue; } const s = g.s * (0.6 + u * 0.7); g.mesh.scale.set(s, s, 1); g.mesh.material.opacity = g.a * (1 - u); }
      const cd = this.stage.cam.dist / 34;
      for (const t of this.texts) { if (!t.on) continue; t.t += dt; const u = t.t / t.life; if (u >= 1) { t.on = false; t.mesh.visible = false; continue; } t.mesh.position.set(t.x, t.y + TD.easeOut(u) * t.rise, t.z); const s = t.s * (u < 0.12 ? 0.6 + u / 0.12 * 0.5 : 1.1 - 0.1 * Math.min(1, (u - 0.12) * 5)) * TD.clamp(cd, 0.5, 1.2); t.mesh.scale.set(s * 4, s, 1); t.mesh.material.opacity = u > 0.7 ? (1 - u) / 0.3 : 1; }
      for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i](dt) === false) this.live.splice(i, 1);
      const kk = TD.clamp(this.stage.cam.dist / 34, 0.32, 1.2); for (const t of this.routeTags) { const b = t.userData.s0 || (t.userData.s0 = t.scale.clone()); t.scale.set(b.x * kk, b.y * kk, 1); }
      for (const id in this.routes) { const r = this.routes[id]; if (r.flash >= 0) { r.flash += dt * 16; r.mesh.material.uniforms.uFlash.value = r.flash; if (r.flash > r.len + 3) { r.flash = -1; r.mesh.material.uniforms.uFlash.value = -10; } } }
      this._updPackets();
    }
  }
  GX.FX = FX; GX.ICONS = ICONS;
})(window);
