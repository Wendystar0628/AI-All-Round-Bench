/* renderer: shadow + planar reflections (water / wet quay) + colour pass + normal/depth pass + ink outline composite */
(function () {
  'use strict';
  var H = window.H, U = H.U, L = H.L;
  var R = H.Render = {};

  var renderer, scene, camera;
  var rtColor, rtNormal, rtReflW, rtReflQ;
  var normalMat, compMat, compScene, compCam;
  var reflCam = new THREE.PerspectiveCamera();
  var W = 0, Hh = 0, PR = 1;

  R.init = function () {
    renderer = R.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false });
    renderer.setClearColor(0xdff1f1, 1);
    renderer.autoClear = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.id = 'view';
    document.body.appendChild(renderer.domElement);

    scene = R.scene = H.scene = new THREE.Scene();
    camera = R.camera = H.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    camera.layers.enable(1);

    // ---- lights : warm sun + cool sky ambience + faint shadowless fill to keep form readable in shade
    var sun = R.sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.color.setRGB(0.60, 0.43, 0.31);
    sun.intensity = Math.PI;
    sun.position.copy(H.SUN).multiplyScalar(90);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    var sc = sun.shadow.camera;
    sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 190;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 1.6;
    scene.add(sun); scene.add(sun.target);
    var fill = R.fill = new THREE.DirectionalLight(0xffffff, 1);
    fill.color.setRGB(0.10, 0.13, 0.14); fill.intensity = Math.PI;
    fill.position.set(60, 40, -50);
    scene.add(fill);
    var hemi = R.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI);
    hemi.color.setRGB(0.50, 0.675, 0.735);
    hemi.groundColor.setRGB(0.42, 0.585, 0.655);
    scene.add(hemi);
    R.baseSun = sun.color.clone(); R.baseHemi = hemi.color.clone(); R.baseHemiG = hemi.groundColor.clone();

    // ---- outline normal pass material
    normalMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, blending: THREE.NoBlending,
      uniforms: { uTime: U.uTime, uCloud: U.uCloud, uSunK: U.uSunK, uGust: U.uGust, uBreeze: U.uBreeze },
      vertexShader: [
        'attribute vec2 aSway;', 'varying vec3 vN; varying vec3 vWPos;',
        H.GLSL.common, H.GLSL.sway,
        'void main(){',
        '  vec4 wp0 = vec4(position, 1.0); mat3 nm = mat3(modelMatrix);',
        '  #ifdef USE_INSTANCING',
        '    wp0 = instanceMatrix * wp0; nm = nm * mat3(instanceMatrix);',
        '  #endif',
        '  wp0 = modelMatrix * wp0;',
        '  vec3 nW = normalize(nm * normal);',
        '  vec3 so = swayOffset(wp0.xyz, aSway, uv.x, nW);',
        '  vec3 wpos = wp0.xyz + so; vWPos = wpos;',
        '  vN = normalize(mat3(viewMatrix) * nW);',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vN; varying vec3 vWPos;',
        'void main(){',
        '  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;',
        '  float s = 1.0;',
        '  float inside = step(abs(vWPos.x), ' + (L.HALF - 0.03).toFixed(2) + ') * step(abs(vWPos.z), ' + (L.HALF - 0.03).toFixed(2) + ');',
        '  if (inside > 0.5 && vWPos.y < 0.0) s = mix(0.50, 0.20, clamp(-vWPos.y / 5.0, 0.0, 1.0));',
        '  if (cameraPosition.y < 0.0 && vWPos.y > 0.02) s *= 0.22;',
        '  float mz = smoothstep(-19.0, -34.0, vWPos.z) * (1.0 - smoothstep(9.0, 15.0, vWPos.x));',
        '  s *= 1.0 - mz * 0.62;',
        '  gl_FragColor = vec4(n * 0.5 + 0.5, s);',
        '}'
      ].join('\n')
    });

    // ---- composite
    compMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) }, uNRes: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.5 }, uFar: { value: 600 }, uLine: { value: 1.0 }, uInk: { value: new THREE.Color().setRGB(0.035, 0.11, 0.16) },
        uTime: U.uTime
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'varying vec2 vUv;',
        'uniform sampler2D tColor, tNormal, tDepth; uniform vec2 uRes, uNRes; uniform float uNear, uFar, uLine, uTime; uniform vec3 uInk;',
        'float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return (uNear * uFar) / (uFar - d * (uFar - uNear)); }',
        'vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
        'float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        // edge strength at one sample position
        'float edgeAt(vec2 uv, vec2 o){',
        '  vec4 n0 = texture2D(tNormal, uv);',
        '  vec4 nR = texture2D(tNormal, uv + vec2(o.x, 0.0)); vec4 nL = texture2D(tNormal, uv - vec2(o.x, 0.0));',
        '  vec4 nU = texture2D(tNormal, uv + vec2(0.0, o.y)); vec4 nD = texture2D(tNormal, uv - vec2(0.0, o.y));',
        '  float z0 = viewZ(uv);',
        '  float zR = viewZ(uv + vec2(o.x, 0.0)), zL = viewZ(uv - vec2(o.x, 0.0)), zU = viewZ(uv + vec2(0.0, o.y)), zD = viewZ(uv - vec2(0.0, o.y));',
        // depth: second difference (flat on planes), only on the far side of a step so lines stay one unit thin
        '  float lapH = abs(zR + zL - 2.0 * z0), lapV = abs(zU + zD - 2.0 * z0);',
        '  float zmin = min(min(zR, zL), min(zU, zD));',
        '  float far = step(zmin + 1e-4 * z0, z0);',
        '  float dE = smoothstep(0.0035, 0.009, max(lapH, lapV) / z0) * far;',
        // normals: forward differences only
        '  vec3 a = n0.xyz * 2.0 - 1.0;',
        '  float nd = max(1.0 - dot(a, nR.xyz * 2.0 - 1.0), 1.0 - dot(a, nU.xyz * 2.0 - 1.0));',
        '  float sameZ = 1.0 - smoothstep(0.004, 0.02, max(abs(zR - z0), abs(zU - z0)) / z0);',
        '  float nE = smoothstep(0.16, 0.42, nd) * sameZ;',
        '  float crease = mix(1.0, 0.55, smoothstep(40.0, 150.0, z0));',
        '  float st = max(max(n0.a, nR.a), max(max(nL.a, nU.a), nD.a));',
        '  return max(dE, nE * crease) * st;',
        '}',
        'void main(){',
        '  vec3 col = texture2D(tColor, vUv).rgb;',
        '  vec2 o = uLine / uNRes;',
        '  vec2 sp = 0.25 / uRes;',
        '  float e = edgeAt(vUv + vec2(-sp.x, -sp.y), o) + edgeAt(vUv + vec2(sp.x, -sp.y), o) + edgeAt(vUv + vec2(-sp.x, sp.y), o) + edgeAt(vUv + vec2(sp.x, sp.y), o);',
        '  e *= 0.25;',
        '  vec3 ink = mix(uInk, col * 0.42, 0.45);',
        '  col = mix(col, ink, clamp(e, 0.0, 1.0) * 0.86);',
        // gentle high-key wash: lift shadows a touch, soften contrast, keep whites from clipping hard
        '  col = col / (1.0 + max(max(col.r, col.g), col.b) * 0.06);',
        '  col = mix(col, vec3(dot(col, vec3(0.30, 0.59, 0.11))), -0.06);',
        '  vec3 s = toSRGB(col);',
        '  s = s * 0.965 + 0.035;',
        // faint paper grain keeps flat areas from feeling digital
        '  float g = hash21(floor(gl_FragCoord.xy * 0.75)) - 0.5;',
        '  s += g * 0.012;',
        '  gl_FragColor = vec4(s, 1.0);',
        '}'
      ].join('\n')
    });
    compScene = new THREE.Scene();
    compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var tri = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat);
    tri.frustumCulled = false;
    compScene.add(tri);

    R.resize(true);
    window.addEventListener('resize', function () { R.resize(false); });
  };

  function makeTargets() {
    var w = Math.max(2, Math.round(W * PR)), h = Math.max(2, Math.round(Hh * PR));
    var px = w * h;
    [rtColor, rtNormal, rtReflW, rtReflQ].forEach(function (t) { if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); } });
    var samples = px > 5.5e6 ? 2 : 4;
    rtColor = new THREE.WebGLRenderTarget(w, h, { samples: samples, type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    // normal/depth buffer is supersampled so ink lines come out thin and antialiased
    var ns = px > 5.5e6 ? 1.3 : (px > 2.6e6 ? 1.6 : 2.0);
    var nw = Math.round(w * ns), nh = Math.round(h * ns);
    rtNormal = new THREE.WebGLRenderTarget(nw, nh, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rtNormal.depthTexture = new THREE.DepthTexture(nw, nh);
    rtNormal.depthTexture.type = THREE.UnsignedIntType;
    rtNormal.depthTexture.minFilter = rtNormal.depthTexture.magFilter = THREE.NearestFilter;
    var rs = px > 5.5e6 ? 0.5 : 0.75;
    rtReflW = new THREE.WebGLRenderTarget(Math.round(w * rs), Math.round(h * rs), { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rtReflQ = new THREE.WebGLRenderTarget(Math.round(w * rs), Math.round(h * rs), { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    U.uReflW.value = rtReflW.texture; U.uReflQ.value = rtReflQ.texture;
    compMat.uniforms.tColor.value = rtColor.texture;
    compMat.uniforms.tNormal.value = rtNormal.texture;
    compMat.uniforms.tDepth.value = rtNormal.depthTexture;
    compMat.uniforms.uRes.value.set(w, h);
    compMat.uniforms.uNRes.value.set(nw, nh);
    // line width: about 1.15 px at 1080p, scaling with resolution (expressed in normal-buffer texels)
    var lw = Math.max(1.0, h / 1080) * 1.15;
    compMat.uniforms.uLine.value = Math.max(1.0, lw * ns * 0.5);
    U.uRes.value.set(w, h);
  }

  R.resize = function (force) {
    var w = window.innerWidth || 1280, h = window.innerHeight || 720;
    var pr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * pr * pr > 9.5e6) pr = Math.sqrt(9.5e6 / (w * h));
    if (!force && w === W && h === Hh && pr === PR) return false;
    W = w; Hh = h; PR = pr;
    renderer.setPixelRatio(PR);
    renderer.setSize(W, Hh, true);
    camera.aspect = W / Hh; camera.updateProjectionMatrix();
    makeTargets();
    return true;
  };

  // objects hidden while rendering reflections (set by scene modules)
  R.hideInRefl = [];
  R.onlyMain = [];

  var _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _tg = new THREE.Vector3();
  var _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  var dummyTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); dummyTex.needsUpdate = true;
  function renderReflection(planeY, rt, matUniform, texUniform) {
    camera.updateMatrixWorld();
    var e = camera.matrixWorld.elements;
    _up.set(e[4], -e[5], e[6]);
    _fw.set(-e[8], e[9], -e[10]);          // forward mirrored in y: forward = -zAxis = (-e8,-e9,-e10) -> y flipped
    reflCam.fov = camera.fov; reflCam.aspect = camera.aspect; reflCam.near = camera.near; reflCam.far = camera.far;
    reflCam.updateProjectionMatrix();
    reflCam.position.set(camera.position.x, 2 * planeY - camera.position.y, camera.position.z);
    reflCam.up.copy(_up);
    _tg.copy(reflCam.position).add(_fw);
    reflCam.lookAt(_tg);
    reflCam.updateMatrixWorld();
    reflCam.matrixWorldInverse.copy(reflCam.matrixWorld).invert();
    matUniform.value.copy(_bias).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
    reflCam.layers.set(0);
    U.uClipY.value = planeY + 0.004;
    texUniform.value = dummyTex;            // never sample the target we are rendering into
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, reflCam);
    texUniform.value = rt.texture;
    U.uClipY.value = -1e5;
  }

  R.frame = function () {
    var i;
    renderer.shadowMap.needsUpdate = true;
    if (H.onBeforeRender) H.onBeforeRender(camera);

    // reflections (static underwater things etc. hidden)
    for (i = 0; i < R.hideInRefl.length; i++) R.hideInRefl[i].visible = false;
    renderReflection(L.WATER_Y, rtReflW, U.uReflWMat, U.uReflW);
    renderReflection(L.QUAY_Y, rtReflQ, U.uReflQMat, U.uReflQ);
    for (i = 0; i < R.hideInRefl.length; i++) R.hideInRefl[i].visible = true;

    // colour
    camera.layers.set(0); camera.layers.enable(1);
    renderer.setRenderTarget(rtColor);
    renderer.setClearColor(0xdff1f1, 1);
    renderer.clear();
    renderer.render(scene, camera);

    // normals + depth for ink lines
    camera.layers.set(0);
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(rtNormal);
    renderer.setClearColor(0x8080ff, 0);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.enable(1);

    // composite
    compMat.uniforms.uNear.value = camera.near; compMat.uniforms.uFar.value = camera.far;
    renderer.setRenderTarget(null);
    renderer.render(compScene, compCam);
  };
})();
