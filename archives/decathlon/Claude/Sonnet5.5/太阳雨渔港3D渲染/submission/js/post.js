'use strict';
/* 渲染管线：主通道(MSAA) → 法线/深度通道 → 轮廓线 → 合成(调色/淡晕/纸纹) */
class Pipeline {
  constructor(renderer, scene, camera, reflectors) {
    this.r = renderer; this.scene = scene; this.camera = camera; this.refl = reflectors;
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.tri = tri;
    const vs = `varying vec2 vUv; void main(){ vUv=position.xy*0.5+0.5; gl_Position=vec4(position.xy,0.,1.); }`;
    this.edgeMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, vertexShader: vs,
      uniforms: { tNorm: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 400 }, uLine: { value: 1.0 } },
      fragmentShader: `uniform sampler2D tNorm; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uLine; varying vec2 vUv;
        float linZ(float d){ float z=d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
        float W(vec2 uv){ float d=texture2D(tDepth,uv).x; if(d>=0.99999) return 1e-4; return 1.0/linZ(d); }
        void main(){
          vec2 px = uLine/uRes;
          float wc = W(vUv);
          float wl = W(vUv+vec2(-px.x,0.)), wr = W(vUv+vec2(px.x,0.)), wu = W(vUv+vec2(0.,px.y)), wd = W(vUv+vec2(0.,-px.y));
          float lap = (wl+wr-2.*wc) + (wu+wd-2.*wc);
          float lx = (wl+wr-2.*wc), ly = (wu+wd-2.*wc);
          float rel = -min(lx, ly) / max(wc, 1e-4);
          // 只在较近一侧画线
          float eD = smoothstep(0.018, 0.05, max(-lx, -ly)/max(wc,1e-4));
          if (wc <= 1.5e-4) eD = 0.0;
          vec3 nc = texture2D(tNorm, vUv).xyz*2.-1.;
          float nd = 0.0;
          vec3 n1 = texture2D(tNorm, vUv+vec2(px.x,0.)).xyz*2.-1.;
          vec3 n2 = texture2D(tNorm, vUv+vec2(0.,px.y)).xyz*2.-1.;
          vec3 n3 = texture2D(tNorm, vUv-vec2(px.x,0.)).xyz*2.-1.;
          vec3 n4 = texture2D(tNorm, vUv-vec2(0.,px.y)).xyz*2.-1.;
          nd = max(max(1.-dot(nc,n1), 1.-dot(nc,n2)), max(1.-dot(nc,n3), 1.-dot(nc,n4)));
          // 深度相近时才算折线
          float dz = max(max(abs(wl-wc),abs(wr-wc)), max(abs(wu-wc),abs(wd-wc)))/max(wc,1e-4);
          float eN = smoothstep(0.30, 0.62, nd) * (1.0 - smoothstep(0.05,0.15,dz));
          if (wc <= 1.5e-4) eN = 0.0;
          float zc = 1.0/max(wc,1e-4);
          float fade = 1.0 - 0.45*smoothstep(35.0, 110.0, zc);
          gl_FragColor = vec4(max(eD, eN*0.8)*fade, 0., 0., 1.);
        }`
    });
    this.compMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, vertexShader: vs,
      uniforms: { tMain: { value: null }, tEdge: { value: null }, tBloom: { value: null }, uBloom: { value: 0.45 }, uRes: { value: new THREE.Vector2() }, uExposure: { value: 1.0 }, uTime: U.uTime, uDark: { value: 0 }, uLineCol: { value: new THREE.Color('#164c58') } },
      fragmentShader: `uniform sampler2D tMain; uniform sampler2D tEdge; uniform sampler2D tBloom; uniform float uBloom; uniform vec2 uRes; uniform float uExposure; uniform float uTime; uniform float uDark; uniform vec3 uLineCol; varying vec2 vUv;
        float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        void main(){
          vec2 px = 1.0/uRes;
          vec3 col = texture2D(tMain, vUv).rgb;
          float e = texture2D(tEdge, vUv).r*0.40;
          e += (texture2D(tEdge, vUv+vec2(px.x,0.)).r + texture2D(tEdge, vUv-vec2(px.x,0.)).r + texture2D(tEdge, vUv+vec2(0.,px.y)).r + texture2D(tEdge, vUv-vec2(0.,px.y)).r)*0.15;
          e = clamp(e*1.15, 0., 1.);
          vec3 ink = col*0.34 + uLineCol*0.52;
          col = mix(col, ink, e*0.82);
          col += texture2D(tBloom, vUv).rgb * vec3(1.0,0.90,0.68) * uBloom * (1.0 - 0.6*e);   // 暖金色的柔光
          col *= uExposure;
          // 轻微肩部压缩，保持高调明亮
          { vec3 hi = max(col-0.72, 0.0); col = min(col, vec3(0.72)) + 0.28*(1.0-exp(-hi/0.28)); }
          float lum = dot(col, vec3(0.299,0.587,0.114));
          col = mix(vec3(lum), col, 1.04);
          col = mix(col, col*vec3(0.94,1.0,1.03), 0.55*(1.0-smoothstep(0.2,0.8,lum)));
          // 低对比：把暗部抬起一点
          col = mix(col, vec3(0.10,0.20,0.24)*0.5+col*0.92, 0.04);
          // 边缘淡晕（偏亮的水彩纸边）
          vec2 q = vUv-0.5; float vg = smoothstep(0.35,0.95,length(q*vec2(1.0,1.15)));
          col = mix(col, col*vec3(0.93,0.985,1.0)+vec3(0.02,0.04,0.04), vg*0.18);
          col = mix(col, col*vec3(0.80,0.90,0.97), uDark*0.28);
          float gr = h21(gl_FragCoord.xy*0.75 + 11.0) - 0.5;
          float pm = h21(floor(gl_FragCoord.xy/5.0)+3.0)-0.5, pm2 = h21(floor(gl_FragCoord.xy/22.0)+9.0)-0.5;
          col += gr*0.010 + pm*0.012 + pm2*0.014;
          col = pow(clamp(col,0.,1.), vec3(1.0/2.2));
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.brightMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, vertexShader: vs,
      uniforms: { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uThresh: { value: 0.9 } },
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uPx; uniform float uThresh; varying vec2 vUv;
        vec3 br(vec2 uv){ vec3 c = texture2D(tSrc, uv).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(uThresh, uThresh+0.5, l); }
        void main(){ vec3 s = br(vUv+uPx*vec2(-1.,-1.)) + br(vUv+uPx*vec2(1.,-1.)) + br(vUv+uPx*vec2(-1.,1.)) + br(vUv+uPx*vec2(1.,1.)); gl_FragColor = vec4(min(s*0.25, vec3(3.0)), 1.0); }`
    });
    this.gaussMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, vertexShader: vs,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 s = texture2D(tSrc, vUv).rgb*0.2270270; s += (texture2D(tSrc, vUv+uDir*1.3846).rgb + texture2D(tSrc, vUv-uDir*1.3846).rgb)*0.3162162; s += (texture2D(tSrc, vUv+uDir*3.2308).rgb + texture2D(tSrc, vUv-uDir*3.2308).rgb)*0.0702703; gl_FragColor = vec4(s, 1.0); }`
    });
    this.blurMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, vertexShader: vs,
      uniforms: { tComp: { value: null }, uRes: { value: new THREE.Vector2() }, uMaxR: { value: 2.2 } },
      fragmentShader: `uniform sampler2D tComp; uniform vec2 uRes; uniform float uMaxR; varying vec2 vUv;
        void main(){
          float dy = abs(vUv.y-0.5)*2.0;                      // 微缩模型式的移轴虚化：只在画面上下缘轻轻柔化
          float k = smoothstep(0.52, 1.0, dy) * (vUv.y < 0.5 ? 1.0 : 0.85);
          float R = uMaxR * k;
          vec3 c = texture2D(tComp, vUv).rgb;
          if (R > 0.05) {
            vec3 s = c; float wsum = 1.0;
            for (int i=0;i<12;i++){ float a = float(i)*2.39996; float r = sqrt((float(i)+0.5)/12.0)*R; vec2 o = vec2(cos(a),sin(a))*r/uRes; s += texture2D(tComp, vUv+o).rgb; wsum += 1.0; }
            c = s/wsum;
          }
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.fsScene = new THREE.Scene();
    this.fsMesh = new THREE.Mesh(tri, this.edgeMat); this.fsMesh.frustumCulled = false;
    this.fsScene.add(this.fsMesh);
    this.size = new THREE.Vector2();
  }
  resize() {
    const r = this.r; r.getDrawingBufferSize(this.size);
    const w = Math.max(2, this.size.x), h = Math.max(2, this.size.y);
    if (this.rtMain) { this.rtMain.dispose(); this.rtNorm.dispose(); this.rtEdge.dispose(); this.rtComp.dispose(); this.rtNorm.depthTexture.dispose(); this.rtB0.dispose(); this.rtB1.dispose(); }
    this.rtMain = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const dt = new THREE.DepthTexture(w, h); dt.minFilter = dt.magFilter = THREE.NearestFilter;
    this.rtNorm = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: true, depthTexture: dt, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtEdge = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtComp = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace });
    const bw = Math.max(2, Math.round(w / 4)), bh = Math.max(2, Math.round(h / 4));
    const bo = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtB0 = new THREE.WebGLRenderTarget(bw, bh, bo); this.rtB1 = new THREE.WebGLRenderTarget(bw, bh, bo); this.bsize = [bw, bh];
    this.blurMat.uniforms.uRes.value.set(w, h); this.blurMat.uniforms.uMaxR.value = 2.4 * Math.max(1, w / 1920);
    for (const rf of this.refl) rf.resize(w, h);
    this.edgeMat.uniforms.uRes.value.set(w, h); this.compMat.uniforms.uRes.value.set(w, h);
    this.edgeMat.uniforms.uLine.value = Math.max(1.0, w / 1920 * 1.15);
  }
  render() {
    const r = this.r, scene = this.scene, cam = this.camera;
    const saved = [];
    // 1. 主通道（含阴影）
    cam.layers.enableAll();
    r.shadowMap.autoUpdate = true;
    r.setRenderTarget(this.rtMain);
    r.setClearColor(0xdff2ef, 1); r.clear();
    r.render(scene, cam);
    // 2. 法线/深度通道
    r.shadowMap.autoUpdate = false;
    const mask = cam.layers.mask; cam.layers.set(LAYER.WORLD);
    for (const m of ALL_MESHES) { saved.push(m.material); m.material = m.userData.nmat || (m.userData.nmat = normalMatFor(m.material)); }
    r.setRenderTarget(this.rtNorm); r.setClearColor(0x8080ff, 1); r.clear();
    const oldBg = scene.background; scene.background = null;
    r.render(scene, cam);
    for (let i = 0; i < ALL_MESHES.length; i++) ALL_MESHES[i].material = saved[i];
    cam.layers.mask = mask;
    // 3. 水面/水洼反射（供下一帧使用）
    for (const rf of this.refl) rf.render(r, scene, cam);
    // 4. 轮廓线
    this.edgeMat.uniforms.tNorm.value = this.rtNorm.texture; this.edgeMat.uniforms.tDepth.value = this.rtNorm.depthTexture;
    this.edgeMat.uniforms.uNear.value = cam.near; this.edgeMat.uniforms.uFar.value = cam.far;
    this.fsMesh.material = this.edgeMat;
    r.setRenderTarget(this.rtEdge); r.render(this.fsScene, this.fsCam);
    // 4b. 柔光：提取高亮 → 1/4 分辨率高斯模糊
    { const [bw, bh] = this.bsize;
      this.brightMat.uniforms.tSrc.value = this.rtMain.texture; this.brightMat.uniforms.uPx.value.set(1 / this.rtMain.width, 1 / this.rtMain.height);
      this.fsMesh.material = this.brightMat; r.setRenderTarget(this.rtB0); r.render(this.fsScene, this.fsCam);
      this.fsMesh.material = this.gaussMat;
      for (let it = 0; it < 2; it++) {
        const k = it === 0 ? 1.0 : 2.2;
        this.gaussMat.uniforms.tSrc.value = this.rtB0.texture; this.gaussMat.uniforms.uDir.value.set(k / bw, 0); r.setRenderTarget(this.rtB1); r.render(this.fsScene, this.fsCam);
        this.gaussMat.uniforms.tSrc.value = this.rtB1.texture; this.gaussMat.uniforms.uDir.value.set(0, k / bh); r.setRenderTarget(this.rtB0); r.render(this.fsScene, this.fsCam);
      }
      this.compMat.uniforms.tBloom.value = this.rtB0.texture; }
    // 5. 合成到屏幕
    this.compMat.uniforms.tMain.value = this.rtMain.texture; this.compMat.uniforms.tEdge.value = this.rtEdge.texture;
    this.compMat.uniforms.uDark.value = Env.dark;
    this.fsMesh.material = this.compMat;
    r.setRenderTarget(this.rtComp); r.render(this.fsScene, this.fsCam);
    this.blurMat.uniforms.tComp.value = this.rtComp.texture; this.fsMesh.material = this.blurMat;
    r.setRenderTarget(null); r.render(this.fsScene, this.fsCam);
    scene.background = oldBg;
  }
}
