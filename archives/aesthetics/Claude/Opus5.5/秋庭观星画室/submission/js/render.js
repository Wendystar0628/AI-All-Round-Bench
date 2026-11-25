/* render pipeline: shadow, normal/depth, reflection, color, bloom, composite, fxaa */
(function () {
  'use strict';
  const W = window.W, U = W.U;
  const LAYER = (W.LAYER = { OPAQUE: 0, FX: 1, SKY: 2, WATER: 3 });

  const R = (W.render = {});

  R.init = function (canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    R.renderer = renderer;
    W.renderer = renderer;

    R.scene = new THREE.Scene();
    R.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.08, 420);
    R.camera.layers.enableAll();

    // shadow
    R.shadowSize = 4096;
    R.shadowRT = new THREE.WebGLRenderTarget(R.shadowSize, R.shadowSize, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    R.shadowCam = new THREE.OrthographicCamera(-27, 27, 27, -27, 0.5, 120);
    R.shadowCam.layers.set(LAYER.OPAQUE);
    U.uShadowMap.value = R.shadowRT.texture;
    U.uShadowTexel.value = 1 / R.shadowSize;

    R.mirrorCam = new THREE.PerspectiveCamera();
    R.mirrorCam.layers.set(LAYER.OPAQUE); R.mirrorCam.layers.enable(LAYER.SKY);
    R.normCam = R.camera.clone(); // uses same matrices; layers only opaque

    // fullscreen
    R.fsScene = new THREE.Scene();
    R.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    R.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    R.fsQuad.frustumCulled = false;
    R.fsScene.add(R.fsQuad);

    R.makeMats();
    R.size = { w: 0, h: 0 };
    R.texMat = new THREE.Matrix4();
    W.waterUniforms.uReflMat.value = R.texMat;
  };

  const FSV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  R.makeMats = function () {
    R.matBright = new THREE.ShaderMaterial({
      uniforms: { tCol: { value: null }, uTh: { value: 1.3 } },
      vertexShader: FSV,
      fragmentShader: `uniform sampler2D tCol; uniform float uTh; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tCol, vUv).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); c = clamp(c, 0.0, 16.0); float l = max(c.r, max(c.g, c.b));
        float k = smoothstep(uTh, uTh + 0.6, l); gl_FragColor = vec4(c * k, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    R.matDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FSV,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec2 o = uTexel; vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
        s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(s / 8.0, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    R.matUp = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } },
      vertexShader: FSV,
      fragmentShader: `uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
        void main(){ vec2 o = uTexel * 0.5; vec3 s = vec3(0.0);
        s += texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
        s += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
        s += (texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) * 2.0;
        s /= 12.0;
        gl_FragColor = vec4(s + texture2D(tPrev, vUv).rgb * uMix, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    R.matComp = new THREE.ShaderMaterial({
      uniforms: {
        tCol: { value: null }, tNor: { value: null }, tDep: { value: null }, tBloom: { value: null },
        uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 400 }, uLineW: { value: 1 },
        uTime: { value: 0 }, uBloom: { value: 0.55 }, uExpo: { value: 1.0 },
      },
      vertexShader: FSV,
      fragmentShader: `
        uniform sampler2D tCol; uniform sampler2D tNor; uniform sampler2D tDep; uniform sampler2D tBloom;
        uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uLineW; uniform float uTime; uniform float uBloom; uniform float uExpo;
        varying vec2 vUv;
        float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
        float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y); }
        vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec2 px = uLineW / uRes;
          vec3 col = texture2D(tCol, vUv).rgb;
          if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
          col = clamp(col, 0.0, 32.0);
          vec4 nc = texture2D(tNor, vUv);
          float dc = lin(texture2D(tDep, vUv).r);
          vec2 offs[4]; offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
          float de = 0.0; float ne = 0.0; float wmax = nc.a;
          vec3 n0 = nc.xyz * 2.0 - 1.0;
          float lap = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 uv2 = vUv + offs[i];
            float dn = lin(texture2D(tDep, uv2).r);
            vec4 nn = texture2D(tNor, uv2);
            lap += dn;
            de = max(de, (dn - dc) / dc);
            if (i == 0 || i == 2) {
              vec3 n1 = nn.xyz * 2.0 - 1.0;
              float d = (nn.a > 0.01 && nc.a > 0.01) ? 1.0 - dot(n0, n1) : 0.0;
              ne = max(ne, d);
            }
            wmax = max(wmax, nn.a * step(dn, dc));
          }
          float facing = abs(n0.z);
          float th = 0.035 + 0.25 * pow(1.0 - facing, 3.0);
          float lineD = smoothstep(th, th * 1.8, de);
          float lineN = smoothstep(0.32, 0.55, ne);
          float line = max(lineD, lineN * 0.85);
          float wgt = nc.a > 0.01 ? nc.a : wmax;
          line *= wgt;
          line *= 1.0 - smoothstep(60.0, 160.0, dc) * 0.6;
          vec3 lc = col * vec3(0.34, 0.28, 0.36) + vec3(0.012, 0.008, 0.016);
          col = mix(col, lc, clamp(line, 0.0, 1.0) * 0.92);

          vec3 bl = texture2D(tBloom, vUv).rgb;
          col += bl * uBloom;
          col *= uExpo;
          // soft shoulder
          vec3 over = max(col - 0.82, 0.0);
          col = min(col, 0.82) + over / (1.0 + over * 2.2);
          // grade: gentle warmth & saturation
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, 1.08);
          col *= vec3(1.015, 1.0, 0.975);
          // vignette
          vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
          col *= 1.0 - 0.22 * smoothstep(0.35, 1.05, length(q));
          vec3 s = toSRGB(col);
          // paper grain
          vec2 fc = gl_FragCoord.xy / max(1.0, uLineW);
          float gr = vn(fc * 0.55) * 0.6 + vn(fc * 0.13) * 0.4;
          s += (gr - 0.5) * 0.028;
          gl_FragColor = vec4(s, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    R.matFXAA = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uRes: { value: new THREE.Vector2() } },
      vertexShader: FSV,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uRes; varying vec2 vUv;
        void main(){
          vec2 r = 1.0 / uRes;
          vec3 rgbNW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * r).rgb;
          vec3 rgbNE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * r).rgb;
          vec3 rgbSW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * r).rgb;
          vec3 rgbSE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * r).rgb;
          vec3 rgbM = texture2D(tSrc, vUv).rgb;
          vec3 luma = vec3(0.299, 0.587, 0.114);
          float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma), lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma), lM = dot(rgbM, luma);
          float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
          float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
          vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
          float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
          float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
          dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * r;
          vec3 rgbA = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
          vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tSrc, vUv + dir * -0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
          float lB = dot(rgbB, luma);
          gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  };

  R.setSize = function (w, h) {
    if (w === R.size.w && h === R.size.h) return;
    R.size.w = w; R.size.h = h;
    const r = R.renderer;
    r.setSize(w, h, false);
    const px = w * h;
    const samples = px <= 2.4e6 ? 4 : 2;
    const dispose = (t) => t && t.dispose();
    dispose(R.colRT); dispose(R.norRT); dispose(R.reflRT); dispose(R.compRT);
    (R.bloomRTs || []).forEach(dispose);
    R.colRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    R.norRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthTexture: dt, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    R.reflRT = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { type: THREE.HalfFloatType, depthBuffer: true });
    R.compRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
    R.bloomRTs = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < 5; i++) {
      R.bloomRTs.push(new THREE.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), { type: THREE.HalfFloatType, depthBuffer: false }));
      bw >>= 1; bh >>= 1;
    }
    R.bloomUp = R.bloomRTs.map((t) => new THREE.WebGLRenderTarget(t.width, t.height, { type: THREE.HalfFloatType, depthBuffer: false }));
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
    W.waterUniforms.uRes.value.set(w, h);
    W.waterUniforms.tDepth.value = R.norRT.depthTexture;
    W.waterUniforms.tRefl.value = R.reflRT.texture;
  };

  R.fs = function (mat, target) {
    R.fsQuad.material = mat;
    R.renderer.setRenderTarget(target || null);
    R.renderer.render(R.fsScene, R.fsCam);
  };

  // sun shadow camera follows the base
  R.updateShadowCam = function () {
    const c = R.shadowCam;
    const d = U.uSunDir.value;
    const center = new THREE.Vector3(0, 2, 0);
    c.position.copy(center).addScaledVector(d, 60);
    c.up.set(0, 1, 0);
    c.lookAt(center);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    const m = U.uShadowMat.value;
    m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  };

  const _rp = new THREE.Vector3(), _cp = new THREE.Vector3(), _rot = new THREE.Matrix4(), _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _view = new THREE.Vector3();
  const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), _n = new THREE.Vector3(0, 1, 0);
  R.renderMirror = function (cam, waterY) {
    const mc = R.mirrorCam;
    _rp.set(0, waterY, 12);
    _cp.setFromMatrixPosition(cam.matrixWorld);
    _rot.extractRotation(cam.matrixWorld);
    _view.subVectors(_rp, _cp);
    if (_view.dot(_n) > 0) return false;
    _view.reflect(_n).negate(); _view.add(_rp);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _tgt.subVectors(_rp, _look); _tgt.reflect(_n).negate(); _tgt.add(_rp);
    mc.position.copy(_view);
    mc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    mc.lookAt(_tgt);
    mc.far = cam.far; mc.near = cam.near; mc.fov = cam.fov; mc.aspect = cam.aspect;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(cam.projectionMatrix);
    R.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    R.texMat.multiply(mc.projectionMatrix);
    R.texMat.multiply(mc.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _rp);
    _plane.applyMatrix4(mc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const p = mc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + p[8]) / p[0];
    _q.y = (Math.sign(_clip.y) + p[9]) / p[5];
    _q.z = -1.0;
    _q.w = (1.0 + p[10]) / p[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    p[2] = _clip.x; p[6] = _clip.y; p[10] = _clip.z + 1.0 - 0.003; p[14] = _clip.w;
    mc.projectionMatrixInverse.copy(mc.projectionMatrix).invert();
    const r = R.renderer;
    r.setRenderTarget(R.reflRT);
    r.setClearColor(0x9fb8d8, 1);
    r.clear();
    U.uPass.value = 0;
    r.render(R.scene, mc);
    return true;
  };

  R.frame = function () {
    const r = R.renderer, cam = R.camera;
    cam.updateMatrixWorld();
    if (W.sky) W.sky.position.copy(cam.position);
    // 1. shadow
    if (!R.dummyTex) { R.dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); R.dummyTex.needsUpdate = true; }
    U.uShadowMap.value = R.dummyTex;
    U.uPass.value = 2;
    r.setRenderTarget(R.shadowRT);
    r.setClearColor(0xffffff, 1);
    r.clear();
    R.scene.overrideMaterial = null;
    r.render(R.scene, R.shadowCam);
    U.uShadowMap.value = R.shadowRT.texture;
    // 2. normal + depth
    U.uPass.value = 1;
    R.normCam.copy(cam, false);
    R.normCam.layers.set(LAYER.OPAQUE);
    R.normCam.matrixWorld.copy(cam.matrixWorld);
    R.normCam.matrixWorldInverse.copy(cam.matrixWorldInverse);
    R.normCam.projectionMatrix.copy(cam.projectionMatrix);
    R.normCam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    r.setRenderTarget(R.norRT);
    r.setClearColor(0x8080ff, 0);
    r.clear();
    r.render(R.scene, R.normCam);
    // 3. reflection
    U.uPass.value = 0;
    if (!R.frustum) { R.frustum = new THREE.Frustum(); R.pm = new THREE.Matrix4(); R.pondSphere = new THREE.Sphere(new THREE.Vector3(W.L.POND.x, 0, W.L.POND.z), W.L.POND.r + 0.6); }
    R.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    R.frustum.setFromProjectionMatrix(R.pm);
    W.pondVisible = R.frustum.intersectsSphere(R.pondSphere);
    W.waterUniforms.uHasRefl.value = W.pondVisible ? (R.renderMirror(cam, W.WATER_Y) ? 1 : 0) : 0;
    // 4. color
    r.setRenderTarget(R.colRT);
    r.setClearColor(0xb8cbe0, 1);
    r.clear();
    U.uPass.value = 0;
    r.render(R.scene, cam);
    // 5. bloom
    R.matBright.uniforms.tCol.value = R.colRT.texture;
    R.fs(R.matBright, R.bloomRTs[0]);
    for (let i = 1; i < R.bloomRTs.length; i++) {
      R.matDown.uniforms.tSrc.value = R.bloomRTs[i - 1].texture;
      R.matDown.uniforms.uTexel.value.set(1 / R.bloomRTs[i - 1].width, 1 / R.bloomRTs[i - 1].height);
      R.fs(R.matDown, R.bloomRTs[i]);
    }
    let prev = R.bloomRTs[R.bloomRTs.length - 1];
    for (let i = R.bloomRTs.length - 2; i >= 0; i--) {
      R.matUp.uniforms.tSrc.value = prev.texture;
      R.matUp.uniforms.tPrev.value = R.bloomRTs[i].texture;
      R.matUp.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      R.matUp.uniforms.uMix.value = 1.0;
      R.fs(R.matUp, R.bloomUp[i]);
      prev = R.bloomUp[i];
    }
    // 6. composite
    const cu = R.matComp.uniforms;
    cu.tCol.value = R.colRT.texture; cu.tNor.value = R.norRT.texture; cu.tDep.value = R.norRT.depthTexture; cu.tBloom.value = prev.texture;
    cu.uRes.value.set(R.size.w, R.size.h); cu.uNear.value = cam.near; cu.uFar.value = cam.far;
    cu.uLineW.value = Math.max(1, R.size.h / 1080);
    cu.uTime.value = U.uTime.value;
    R.fs(R.matComp, R.compRT);
    // 7. fxaa → screen
    R.matFXAA.uniforms.tSrc.value = R.compRT.texture;
    R.matFXAA.uniforms.uRes.value.set(R.size.w, R.size.h);
    R.fs(R.matFXAA, null);
  };
})();
