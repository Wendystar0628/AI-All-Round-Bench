'use strict';
/* ==========================================================================
   Render pipeline: shadows (static + dynamic), HDR scene, bloom, composite
   ========================================================================== */
(function () {
  const P = window.P;
  const R = (P.R = {});

  const FS_TRI = new THREE.BufferGeometry();
  FS_TRI.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(FS_TRI, null);
  quad.frustumCulled = false;
  quadScene.add(quad);
  const VS_Q = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  function pass(mat, target) {
    quad.material = mat;
    R.renderer.setRenderTarget(target);
    R.renderer.render(quadScene, orthoCam);
  }

  /* ------------------------------------------------------------ shadows */
  R.initShadows = function (renderer, scene) {
    const S = 4096, SD = 4096;
    const mk = (s) => {
      const dt = new THREE.DepthTexture(s, s);
      dt.type = THREE.FloatType;
      dt.compareFunction = THREE.LessEqualCompare;
      dt.minFilter = dt.magFilter = THREE.LinearFilter;
      const rt = new THREE.WebGLRenderTarget(s, s, { depthTexture: dt, depthBuffer: true });
      return rt;
    };
    R.shS = mk(S);
    R.shD = mk(SD);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    const L = P.sunDir;
    const c = new THREE.Vector3(0, 8, 5);
    cam.position.copy(c).addScaledVector(L, 420);
    cam.up.set(0, 1, 0);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    // fit bounds
    const box = [[-198, -6, -150], [198, 52, 170]];
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(box[i & 1][0], box[(i >> 1) & 1][1], box[(i >> 2) & 1][2]).applyMatrix4(cam.matrixWorldInverse);
      mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y); mnz = Math.min(mnz, v.z); mxz = Math.max(mxz, v.z);
    }
    cam.left = mnx; cam.right = mxx; cam.bottom = mny; cam.top = mxy; cam.near = -mxz - 10; cam.far = -mnz + 10;
    cam.updateProjectionMatrix();
    R.shCam = cam;
    const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    P.U.uShMat.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    P.U.uShS.value = R.shS.depthTexture;
    P.U.uShD.value = R.shD.depthTexture;
    P.U.uShTexel.value.set(1 / S, 1 / S);
    R.depthMat = P.makeDepthMaterial();
    R.shScene = scene;
  };
  R.renderStaticShadow = function () {
    const r = R.renderer, cam = R.shCam, s = R.shScene;
    s.overrideMaterial = R.depthMat;
    cam.layers.set(1);
    r.setRenderTarget(R.shS);
    r.setClearColor(0xffffff, 1);
    r.clear(true, true, true);
    r.render(s, cam);
    s.overrideMaterial = null;
    r.setRenderTarget(null);
    P.U.uShOn.value = 1;
  };
  R.renderDynamicShadow = function () {
    const r = R.renderer, cam = R.shCam, s = R.shScene;
    s.overrideMaterial = R.depthMat;
    cam.layers.set(2);
    r.setRenderTarget(R.shD);
    r.clear(true, true, true);
    r.render(s, cam);
    s.overrideMaterial = null;
    r.setRenderTarget(null);
  };

  /* ------------------------------------------------------------ post */
  const prefilterMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.12 }, uKnee: { value: 0.4 } },
    vertexShader: VS_Q,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; uniform float uKnee;
    vec3 tap(vec2 o){ return texture(tSrc, vUv + o * uTexel).rgb; }
    void main(){
      vec3 c = tap(vec2(-1.0,-1.0)) + tap(vec2(1.0,-1.0)) + tap(vec2(-1.0,1.0)) + tap(vec2(1.0,1.0));
      c = c * 0.25;
      c = min(c, vec3(24.0));
      float br = max(c.r, max(c.g, c.b));
      float rq = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee);
      rq = rq * rq / (4.0 * uKnee + 1e-4);
      float w = max(rq, br - uThr) / max(br, 1e-4);
      gl_FragColor = vec4(c * w, 1.0);
    }`,
    depthTest: false, depthWrite: false,
  });
  const downMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: VS_Q,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
    vec3 t(vec2 o){ return texture(tSrc, vUv + o * uTexel).rgb; }
    void main(){
      vec3 A = t(vec2(-2,-2)), B = t(vec2(0,-2)), C = t(vec2(2,-2));
      vec3 D = t(vec2(-1,-1)), E = t(vec2(1,-1));
      vec3 F = t(vec2(-2,0)), G = t(vec2(0,0)), H = t(vec2(2,0));
      vec3 I = t(vec2(-1,1)), J = t(vec2(1,1));
      vec3 K = t(vec2(-2,2)), L = t(vec2(0,2)), M = t(vec2(2,2));
      vec3 c = (D+E+I+J) * 0.125 + (A+B+G+F) * 0.03125 + (B+C+H+G) * 0.03125 + (F+G+L+K) * 0.03125 + (G+H+M+L) * 0.03125;
      gl_FragColor = vec4(c, 1.0);
    }`,
    depthTest: false, depthWrite: false,
  });
  const upMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1.0 } },
    vertexShader: VS_Q,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; uniform float uMix;
    vec3 t(vec2 o){ return texture(tSrc, vUv + o * uTexel).rgb; }
    void main(){
      vec3 c = t(vec2(-1,-1)) + t(vec2(0,-1))*2.0 + t(vec2(1,-1)) + t(vec2(-1,0))*2.0 + t(vec2(0,0))*4.0 + t(vec2(1,0))*2.0 + t(vec2(-1,1)) + t(vec2(0,1))*2.0 + t(vec2(1,1));
      c /= 16.0;
      gl_FragColor = vec4(texture(tBase, vUv).rgb + c * uMix, 1.0);
    }`,
    depthTest: false, depthWrite: false,
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tGlow: { value: null },
      uRes: { value: new THREE.Vector2() }, uNear: { value: 0.5 }, uFar: { value: 40000 },
      uBloom: { value: 0.3 }, uGlow: { value: 0.12 }, uRim: { value: 0.5 }, uExposure: { value: 1.0 },
      uTime: { value: 0 },
    },
    vertexShader: VS_Q,
    fragmentShader: `varying vec2 vUv;
    uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform sampler2D tGlow;
    uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uBloom; uniform float uGlow; uniform float uRim; uniform float uExposure; uniform float uTime;
    float linZ(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
    vec3 tone(vec3 x){
      // linear mids, soft exponential shoulder: highlights roll to clean white
      x *= uExposure;
      vec3 hi = 0.8 + 0.2 * (1.0 - exp(-(x - 0.8) / 0.2));
      vec3 a = mix(x, hi, step(0.8, x));
      // very bright values desaturate toward white
      float l = max(x.r, max(x.g, x.b));
      a = mix(a, vec3(max(a.r, max(a.g, a.b))), smoothstep(1.1, 2.2, l) * 0.6);
      return a;
    }
    vec3 srgb(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture(tScene, vUv).rgb;
      // rim light: foreground pixels whose upper neighbour is much farther
      float d0 = texture(tDepth, vUv).r;
      float rim = 0.0;
      if (d0 < 0.99999) {
        float z0 = linZ(d0);
        float px = max(1.0, uRes.y / 1080.0) * 1.6;
        float acc = 0.0;
        for (int i = 1; i <= 2; i++) {
          vec2 o = vec2(0.0, float(i) * px) / uRes;
          float dn = texture(tDepth, vUv + o).r;
          float zn = dn > 0.99999 ? 1e6 : linZ(dn);
          float g = smoothstep(0.06, 0.25, (zn - z0) / z0) * smoothstep(1.5, 6.0, zn - z0);
          acc = max(acc, g * (i == 1 ? 1.0 : 0.6));
          vec2 o2 = vec2(float(i) * px * 0.8, float(i) * px * 0.6) / uRes;
          float dn2 = texture(tDepth, vUv + o2).r;
          float zn2 = dn2 > 0.99999 ? 1e6 : linZ(dn2);
          acc = max(acc, smoothstep(0.06, 0.25, (zn2 - z0) / z0) * smoothstep(1.5, 6.0, zn2 - z0) * 0.55);
        }
        rim = acc * (1.0 - smoothstep(250.0, 1200.0, z0));
      }
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += vec3(1.0, 0.97, 0.9) * rim * uRim * (0.35 + 0.65 * clamp(lum * 1.5, 0.0, 1.0));
      vec3 b = texture(tBloom, vUv).rgb;
      vec3 g = texture(tGlow, vUv).rgb;
      c += b * uBloom;
      vec3 t = tone(c);
      // soft overall diffusion glow (screen blend)
      vec3 gt = tone(g);
      t = 1.0 - (1.0 - t) * (1.0 - gt * uGlow);
      // grade: gentle saturation lift, cool lifted shadows
      float L = dot(t, vec3(0.299, 0.587, 0.114));
      t = mix(vec3(L), t, 1.08);
      t = t + vec3(0.01, 0.018, 0.035) * (1.0 - smoothstep(0.0, 0.6, L));
      vec3 o = srgb(t);
      o += (hash(vUv * uRes + fract(uTime) * 7.0) - 0.5) / 255.0;
      gl_FragColor = vec4(o, 1.0);
    }`,
    depthTest: false, depthWrite: false,
  });

  R.init = function (renderer) {
    R.renderer = renderer;
    R.levels = [];
  };
  R.resize = function (w, h) {
    if (R.w === w && R.h === h) return;
    R.w = w; R.h = h;
    if (R.rtScene) { R.rtScene.dispose(); R.rtScene.depthTexture.dispose(); }
    for (const l of R.levels) { l.a.dispose(); l.b.dispose(); }
    const px = w * h;
    const samples = px > 2600 * 1500 ? 2 : 4;
    const dt = new THREE.DepthTexture(w, h);
    dt.type = THREE.FloatType;
    R.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthTexture: dt, depthBuffer: true });
    R.rtScene.texture.minFilter = R.rtScene.texture.magFilter = THREE.LinearFilter;
    R.levels = [];
    let lw = Math.max(1, w >> 1), lh = Math.max(1, h >> 1);
    for (let i = 0; i < 7; i++) {
      const o = { type: THREE.HalfFloatType, depthBuffer: false };
      const a = new THREE.WebGLRenderTarget(lw, lh, o), b = new THREE.WebGLRenderTarget(lw, lh, o);
      a.texture.minFilter = a.texture.magFilter = b.texture.minFilter = b.texture.magFilter = THREE.LinearFilter;
      R.levels.push({ a, b, w: lw, h: lh });
      lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
    }
  };

  R.renderFrame = function (scene, camera) {
    const r = R.renderer;
    // scene
    r.setRenderTarget(R.rtScene);
    r.setClearColor(0x9fd6f5, 1);
    r.clear(true, true, true);
    r.render(scene, camera);
    // bloom chain
    const Lv = R.levels;
    prefilterMat.uniforms.tSrc.value = R.rtScene.texture;
    prefilterMat.uniforms.uTexel.value.set(1 / R.w, 1 / R.h);
    pass(prefilterMat, Lv[0].a);
    for (let i = 1; i < Lv.length; i++) {
      downMat.uniforms.tSrc.value = Lv[i - 1].a.texture;
      downMat.uniforms.uTexel.value.set(1 / Lv[i - 1].w, 1 / Lv[i - 1].h);
      pass(downMat, Lv[i].a);
    }
    // upsample: b[i] = a[i] + up(b[i+1])
    let src = Lv[Lv.length - 1].a;
    for (let i = Lv.length - 2; i >= 0; i--) {
      upMat.uniforms.tSrc.value = src.texture;
      upMat.uniforms.tBase.value = Lv[i].a.texture;
      upMat.uniforms.uTexel.value.set(1 / Lv[i + 1].w, 1 / Lv[i + 1].h);
      upMat.uniforms.uMix.value = 1.0;
      pass(upMat, Lv[i].b);
      src = Lv[i].b;
    }
    // composite
    const cu = compMat.uniforms;
    cu.tScene.value = R.rtScene.texture;
    cu.tDepth.value = R.rtScene.depthTexture;
    cu.tBloom.value = Lv[0].b.texture;
    cu.tGlow.value = Lv[3].b.texture;
    cu.uRes.value.set(R.w, R.h);
    cu.uNear.value = camera.near; cu.uFar.value = camera.far;
    cu.uTime.value = P.U.uTime.value;
    pass(compMat, null);
  };
  R.compMat = compMat;
})();
