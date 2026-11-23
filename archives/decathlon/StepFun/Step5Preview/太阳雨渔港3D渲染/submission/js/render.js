/* ============ post processing: planar reflection, cel outline, bloom, grade ============ */
(function () {
  const HB = (window.HB = window.HB || {});
  const U = HB.U;

  const P = {};
  P.init = function (renderer, scene, camera) {
    P.renderer = renderer; P.scene = scene; P.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    P.w = size.x; P.h = size.y;

    // ---- render targets
    const opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, encoding: THREE.LinearEncoding, depthBuffer: true };
    P.rtColor = new THREE.WebGLRenderTarget(P.w, P.h, opt);
    P.rtNormal = new THREE.WebGLRenderTarget(P.w, P.h, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat,
      type: THREE.HalfFloatType, encoding: THREE.LinearEncoding, depthBuffer: true
    });
    P.reflRT = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      encoding: THREE.LinearEncoding, depthBuffer: true
    });
    P.rtBright = new THREE.WebGLRenderTarget(P.w >> 2, P.h >> 2, opt);
    P.rtBlurA = new THREE.WebGLRenderTarget(P.w >> 2, P.h >> 2, opt);
    P.rtBlurB = new THREE.WebGLRenderTarget(P.w >> 2, P.h >> 2, opt);
    U.refl.value = P.reflRT.texture;

    // ---- fullscreen quad
    P.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    P.fsGeo = new THREE.PlaneGeometry(2, 2);
    P.fsScene = new THREE.Scene();
    P.fsMesh = new THREE.Mesh(P.fsGeo, null);
    P.fsMesh.frustumCulled = false;
    P.fsScene.add(P.fsMesh);

    const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`;

    // ---- normal/depth override material
    P.normalMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vN; varying float vD;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vD = -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `
        varying vec3 vN; varying float vD;
        void main(){ gl_FragColor = vec4(normalize(vN)*0.5+0.5, clamp(vD/200.0, 0.0, 1.0)); }`,
    });

    // ---- edge detection
    P.edgeMat = new THREE.ShaderMaterial({
      uniforms: { tN: { value: P.rtNormal.texture }, uTexel: { value: new THREE.Vector2(1 / P.w, 1 / P.h) }, uPix: { value: 1 }, uColor: { value: new THREE.Color(0x1d3a42) } },
      vertexShader: VS,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tN; uniform vec2 uTexel; uniform float uPix; uniform vec3 uColor;
        varying vec2 vUv;
        float dep(vec2 uv){ return texture2D(tN, uv).a; }
        vec3 nrm(vec2 uv){ return texture2D(tN, uv).xyz; }
        float ring(vec2 uv, float d0, vec3 n0, float r, float w){
          float e = 0.0;
          for (int i=0;i<8;i++){
            float a = float(i)*0.7853981634;
            vec2 o = vec2(cos(a), sin(a))*uTexel*r;
            float d1 = dep(uv+o);
            vec3 n1 = nrm(uv+o);
            float dd = abs(d1-d0)*200.0;
            float de = smoothstep(0.30, 1.30, dd);
            float ne = 1.0 - smoothstep(0.72, 0.93, dot(n0,n1));
            e = max(e, max(de, ne*0.92));
          }
          return e*w;
        }
        void main(){
          float d0 = dep(vUv);
          if (d0 > 0.995) { gl_FragColor = vec4(0.0); return; }
          vec3 n0 = nrm(vUv);
          float e = ring(vUv, d0, n0, 1.15*uPix, 1.0);
          e = max(e, ring(vUv, d0, n0, 2.4*uPix, 0.45));
          gl_FragColor = vec4(e);
        }`,
    });

    // ---- bright pass
    P.brightMat = new THREE.ShaderMaterial({
      uniforms: { tC: { value: P.rtColor.texture }, uThresh: { value: 0.85 }, uTexel: { value: new THREE.Vector2(1 / (P.w >> 2), 1 / (P.h >> 2)) } },
      vertexShader: VS,
      fragmentShader: `
        precision highp float; uniform sampler2D tC; uniform float uThresh; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tC, vUv).rgb;
          float l = max(max(c.r,c.g),c.b);
          float k = smoothstep(uThresh, uThresh+0.35, l);
          gl_FragColor = vec4(c*k, 1.0);
        }`,
    });

    // ---- blur
    P.blurMat = new THREE.ShaderMaterial({
      uniforms: { tC: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2(1 / (P.w >> 2), 1 / (P.h >> 2)) } },
      vertexShader: VS,
      fragmentShader: `
        precision highp float; uniform sampler2D tC; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec3 s = texture2D(tC, vUv).rgb * 0.2270270270;
          s += (texture2D(tC, vUv + uDir*uTexel*1.3846153846).rgb + texture2D(tC, vUv - uDir*uTexel*1.3846153846).rgb) * 0.3162162162;
          s += (texture2D(tC, vUv + uDir*uTexel*3.2307692308).rgb + texture2D(tC, vUv - uDir*uTexel*3.2307692308).rgb) * 0.0702702703;
          gl_FragColor = vec4(s, 1.0);
        }`,
    });

    // ---- composite
    P.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tC: { value: P.rtColor.texture }, tE: { value: P.rtNormal.texture }, tB: { value: P.rtBlurB.texture },
        uLine: { value: new THREE.Color(0x18333b) }, uBloom: { value: 0.42 }, uExposure: { value: 0.88 },
        uSat: { value: 1.05 }, uVig: { value: 0.10 }, uDebug: { value: 0 }, uNormal: { value: P.rtNormal.texture },      },
      vertexShader: VS,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tC, tE, tB, uNormal; uniform vec3 uLine; uniform float uBloom, uExposure, uSat, uVig, uDebug;
        varying vec2 vUv;
        void main(){
          vec3 col = texture2D(tC, vUv).rgb;
          float e = texture2D(tE, vUv).r;
          if (uDebug > 0.5) {
            if (uDebug < 1.5) { gl_FragColor = vec4(vec3(e), 1.0); return; }
            if (uDebug < 2.5) { gl_FragColor = vec4(texture2D(uNormal, vUv).rgb, 1.0); return; }
            gl_FragColor = vec4(vec3(texture2D(uNormal, vUv).a), 1.0); return;
          }
          col = mix(col, uLine, clamp(e,0.0,1.0)*0.88);
          col += texture2D(tB, vUv).rgb * uBloom;
          col *= uExposure;
          col = (col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14);
          col = mix(col, smoothstep(0.0,1.0,col), 0.22);
          col = floor(col*46.0 + 0.5)/46.0;
          float l = dot(col, vec3(0.299,0.587,0.114));
          col = mix(vec3(l), col, uSat);
          float r = length(vUv-0.5);
          col *= 1.0 - uVig*r*r;
          col = pow(max(col, 0.0), vec3(1.0/2.2));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    P._edgeTarget = new THREE.WebGLRenderTarget(P.w, P.h, opt);
    P.edgeMat.uniforms.tN.value = P.rtNormal.texture;
  };

  P.setSize = function (w, h) {
    P.w = w; P.h = h;
    P.rtColor.setSize(w, h);
    P.rtNormal.setSize(w, h);
    P._edgeTarget.setSize(w, h);
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    P.rtBright.setSize(bw, bh); P.rtBlurA.setSize(bw, bh); P.rtBlurB.setSize(bw, bh);
    P.edgeMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    P.brightMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    P.blurMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    P.edgeMat.uniforms.uPix.value = Math.max(1, Math.min(3, h / 900));
  };

  P.fs = function (mat, target) {
    P.fsMesh.material = mat;
    P.renderer.setRenderTarget(target || null);
    P.renderer.clear();
    P.renderer.render(P.fsScene, P.fsCam);
  };

  P.render = function (scene, camera) {
    const r = P.renderer;
    const W = HB.world;

    // ---- planar reflection
    if (W && W.surfaces) {
      W.updateTextureMatrix(camera, r);
      if (W.mirrorCam) {
        const hides = W.hiddenInReflection || [];
        for (let i = 0; i < hides.length; i++) hides[i].visible = false;
        for (let i = 0; i < W.surfaces.length; i++) W.surfaces[i].visible = false;
        const prevClip = r.clippingPlanes;
        r.clippingPlanes = [W.clipPlane];
        r.setRenderTarget(P.reflRT);
        r.clear();
        r.render(scene, W.mirrorCam);
        r.setRenderTarget(null);
        r.clippingPlanes = prevClip;
        for (let i = 0; i < hides.length; i++) hides[i].visible = true;
        for (let i = 0; i < W.surfaces.length; i++) W.surfaces[i].visible = true;
      }
    }

    // ---- colour pass
    r.setRenderTarget(P.rtColor);
    r.clear();
    r.render(scene, camera);

    // ---- normal / depth pass
    const exempt = HB.app ? HB.app.celExempt : [];
    for (let i = 0; i < exempt.length; i++) exempt[i].visible = false;
    scene.overrideMaterial = P.normalMat;
    r.setRenderTarget(P.rtNormal);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null;
    for (let i = 0; i < exempt.length; i++) exempt[i].visible = true;

    // ---- outline
    P.edgeMat.uniforms.tN.value = P.rtNormal.texture;
    P.fs(P.edgeMat, P._edgeTarget);

    // ---- bloom
    P.brightMat.uniforms.tC.value = P.rtColor.texture;
    P.fs(P.brightMat, P.rtBright);
    P.blurMat.uniforms.tC.value = P.rtBright.texture;
    P.blurMat.uniforms.uDir.value.set(1, 0);
    P.fs(P.blurMat, P.rtBlurA);
    P.blurMat.uniforms.tC.value = P.rtBlurA.texture;
    P.blurMat.uniforms.uDir.value.set(0, 1);
    P.fs(P.blurMat, P.rtBlurB);
    P.blurMat.uniforms.tC.value = P.rtBlurB.texture;
    P.blurMat.uniforms.uDir.value.set(0.7, 0.7);
    P.fs(P.blurMat, P.rtBlurA);

    // ---- composite
    P.compMat.uniforms.tC.value = P.rtColor.texture;
    P.compMat.uniforms.tE.value = P._edgeTarget.texture;
    P.compMat.uniforms.tB.value = P.rtBlurA.texture;
    P.fs(P.compMat, null);
  };

  HB.post = P;
})();

