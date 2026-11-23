/* =====================================================================
   water.js — 港湾水面（色块化倒影 / 波浪 / 泡沫）+ 平面反射器
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const TX = TY.tex;

  /* ---------------- 波形（JS 侧，供漂浮物使用） ---------------- */
  const WAVES = [
    { dx: 0.92, dz: 0.39, k: 1.05, sp: 1.25, a: 0.030 },
    { dx: -0.42, dz: 0.91, k: 1.62, sp: 1.70, a: 0.019 },
    { dx: 0.71, dz: -0.70, k: 2.55, sp: 2.20, a: 0.010 },
    { dx: 0.15, dz: 0.99, k: 4.30, sp: 3.10, a: 0.005 },
  ];

  function waveH(x, z, t) {
    let h = 0;
    for (const w of WAVES) h += Math.sin((x * w.dx + z * w.dz) * w.k + t * w.sp) * w.a;
    return h;
  }
  function waveGrad(x, z, t) {
    let gx = 0, gz = 0;
    for (const w of WAVES) {
      const c = Math.cos((x * w.dx + z * w.dz) * w.k + t * w.sp) * w.a * w.k;
      gx += c * w.dx; gz += c * w.dz;
    }
    return [gx, gz];
  }

  /* ---------------- 平面反射器 ---------------- */
  const REFLECT_LAYER = 2;

  function PlanarReflector(renderer, scene, plane, res, clipY) {
    this.renderer = renderer;
    this.scene = scene;
    this.plane = plane;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(clipY || 0));
    this.clearColor = new THREE.Color(clipY && clipY > 0.5 ? 0x9fc4cc : 0x8ab8c4);
    this.rt = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true,
    });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.virtualCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this._v = {
      reflectorPos: new THREE.Vector3(), camPos: new THREE.Vector3(), rot: new THREE.Matrix4(),
      normal: new THREE.Vector3(), view: new THREE.Vector3(), target: new THREE.Vector3(),
      look: new THREE.Vector3(),
    };
  }
  PlanarReflector.prototype.setSize = function (res) {
    if (this.rt.width === res) return;
    this.rt.setSize(res, res);
  };
  PlanarReflector.prototype.update = function (camera) {
    const V = this._v;
    const plane = this.plane;
    plane.updateMatrixWorld();
    V.reflectorPos.setFromMatrixPosition(plane.matrixWorld);
    V.camPos.setFromMatrixPosition(camera.matrixWorld);
    V.rot.extractRotation(plane.matrixWorld);
    V.normal.set(0, 0, 1).applyMatrix4(V.rot).normalize();
    V.view.subVectors(V.reflectorPos, V.camPos);
    if (V.view.dot(V.normal) > 0) return;   // 相机在水面下
    V.view.reflect(V.normal).negate().add(V.reflectorPos);
    V.rot.extractRotation(camera.matrixWorld);
    V.look.set(0, 0, -1).applyMatrix4(V.rot).add(V.camPos);
    V.target.subVectors(V.reflectorPos, V.look);
    V.target.reflect(V.normal).negate().add(V.reflectorPos);
    const vc = this.virtualCamera;
    vc.position.copy(V.view);
    vc.up.set(0, 1, 0).applyMatrix4(V.rot).reflect(V.normal).negate();
    vc.lookAt(V.target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.fov = camera.fov;
    vc.aspect = camera.aspect;
    vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    vc.layers.set(REFLECT_LAYER);

    // 投影纹理矩阵
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix);
    this.textureMatrix.multiply(vc.matrixWorldInverse);
    this.textureMatrix.multiply(plane.matrixWorld);

    // 渲染反射
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClip = r.clippingPlanes;
    const prevClear = new THREE.Color();
    r.getClearColor(prevClear);
    const prevAlpha = r.getClearAlpha();
    plane.visible = false;
    const prevBg = this.scene.background;
    // 只渲染水面之上的部分，避免水下岸壁出现在倒影里
    r.clippingPlanes = [this.clipPlane];
    // 倒影里的天空压成偏冷的中间调，水面才有青绿色层次
    r.setClearColor(this.clearColor, 1);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, vc);
    r.setRenderTarget(prevTarget);
    r.clippingPlanes = prevClip;
    r.setClearColor(prevClear, prevAlpha);
    plane.visible = true;
    this.scene.background = prevBg;
  };

  /* ---------------- 水面材质 ---------------- */
  const waterShader = {
    uniforms: {
      tReflect: { value: null },
      tNoise: { value: null },
      tCloud: { value: null },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x3f9a97) },
      uShallow: { value: new THREE.Color(0x93dccd) },
      uFoam: { value: new THREE.Color(0xf2fbfb) },
      uSunDir: { value: new THREE.Vector3(0.6, 0.66, 0.45) },
      uSunColor: { value: new THREE.Color(0xfff3d6) },
      uSkyColor: { value: new THREE.Color(0xd8eef4) },
      uCloudAmt: { value: 0.34 },
      uCloudOffset: { value: new THREE.Vector2() },
      uCloudScale: { value: 0.011 },
      uQuayA: { value: new THREE.Vector4(-10, -10, -3.4, 3.5) },
      uQuayB: { value: new THREE.Vector4(-3.4, 3.5, 3.2, 10) },
      uBreak: { value: new THREE.Vector4(3.2, 6.2, 8.6, 8.6) },
      uTetra: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uWake: { value: [new THREE.Vector3(0, -99, 0), new THREE.Vector3(0, -99, 0), new THREE.Vector3(0, -99, 0), new THREE.Vector3(0, -99, 0), new THREE.Vector3(0, -99, 0), new THREE.Vector3(0, -99, 0)] },
      uRainAmt: { value: 0.5 },
    },
    vertexShader: [
      'uniform float uTime;',
      'uniform mat4 textureMatrix;',
      'varying vec3 vWPos;',
      'varying vec4 vRefUv;',
      'varying vec3 vNrm;',
      'float wh(vec2 p, float t){',
      '  float h = 0.0;',
      '  h += sin(dot(p, vec2(0.92,0.39))*1.05 + t*1.25)*0.030;',
      '  h += sin(dot(p, vec2(-0.42,0.91))*1.55 + t*1.62)*0.019;',
      '  h += sin(dot(p, vec2(0.71,-0.70))*2.55 + t*2.15)*0.010;',
      '  h += sin(dot(p, vec2(0.15,0.99))*4.30 + t*3.05)*0.005;',
      '  return h;',
      '}',
      'void main(){',
      '  vec3 p = position;',
      '  float h = wh(p.xz, uTime);',
      '  p.y += h;',
      '  float e = 0.35;',
      '  float hx = wh(p.xz + vec2(e,0.0), uTime);',
      '  float hz = wh(p.xz + vec2(0.0,e), uTime);',
      '  vNrm = normalize(vec3(-(hx-h)/e, 1.0, -(hz-h)/e));',
      '  vec4 wp = modelMatrix * vec4(p,1.0);',
      '  vWPos = wp.xyz;',
      '  vRefUv = textureMatrix * vec4(p,1.0);',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tReflect, tNoise, tCloud;',
      'uniform float uTime, uCloudAmt, uCloudScale, uRainAmt;',
      'uniform vec3 uDeep, uShallow, uFoam, uSunDir, uSunColor, uSkyColor;',
      'uniform vec2 uCloudOffset;',
      'uniform vec4 uQuayA, uQuayB, uBreak;',
      'uniform vec3 uTetra[6];',
      'uniform vec3 uWake[6];',
      'varying vec3 vWPos;',
      'varying vec4 vRefUv;',
      'varying vec3 vNrm;',
      'float sdRect(vec2 p, vec4 r){',
      '  vec2 c = (r.xy + r.zw) * 0.5;',
      '  vec2 h = (r.zw - r.xy) * 0.5;',
      '  vec2 d = abs(p - c) - h;',
      '  return min(max(d.x,d.y),0.0) + length(max(d,0.0));',
      '}',
      'float sdQuay(vec2 p){ return min(sdRect(p,uQuayA), sdRect(p,uQuayB)); }',
      'vec3 posterize(vec3 c, float n){ return floor(c*n + 0.5)/n; }',
      'void main(){',
      '  vec3 N = normalize(vNrm);',
      '  vec2 duv = vWPos.xz * 0.42;',
      '  float n1 = texture2D(tNoise, duv + vec2(uTime*0.016, uTime*0.011)).r;',
      '  float n2 = texture2D(tNoise, duv*2.6 - vec2(uTime*0.026, uTime*0.014)).r;',
      '  N = normalize(N + vec3((n1-0.5)*0.22, 0.0, (n2-0.5)*0.22));',
      '  vec3 V = normalize(cameraPosition - vWPos);',
      // 倒影（带波纹位移 + 色块化）
      '  vec2 ruv = vRefUv.xy / max(vRefUv.w, 0.0001);',
      '  ruv += vec2(sin(vWPos.x*0.85 + uTime*1.05), cos(vWPos.z*0.72 + uTime*0.88)) * 0.013;',
      '  ruv += vec2(n1-0.5, n2-0.5) * 0.008;',
      '  vec3 refl = texture2D(tReflect, clamp(ruv, vec2(0.002), vec2(0.998))).rgb;',
      '  refl = posterize(refl, 4.0);',
      '  refl = max(refl, uDeep * 0.5);   // 暗部归为深青，不出现死黑',
      // 深度色
      '  float sd = sdQuay(vWPos.xz);',
      '  float sdb = sdRect(vWPos.xz, uBreak);',
      '  float shore = 1.0 - smoothstep(0.0, 5.5, sd);',
      '  float shoreB = 1.0 - smoothstep(0.0, 2.2, max(sdb,0.0));',
      '  shore = max(shore, shoreB*0.8);',
      '  vec3 base = mix(uDeep, uShallow, clamp(shore*0.85 + 0.12, 0.0, 1.0));',
      '  base = mix(base, uSkyColor*1.02, 0.26 + 0.16*shore);',
      // 菲涅尔
      '  float fres = pow(1.0 - max(dot(N,V),0.0), 2.6);',
      '  fres = clamp(mix(0.33, 0.94, fres), 0.0, 1.0);',
      '  vec3 col = mix(base, refl * 1.06 + uSkyColor * 0.10, fres);',
      // 云影
      '  float cf = texture2D(tCloud, (vWPos.xz + uCloudOffset) * uCloudScale).r;',
      '  cf = mix(1.0 - uCloudAmt*0.55, 1.0, smoothstep(0.18, 0.78, cf));',
      '  col *= cf;',
      // 泡沫
      '  float fm = 0.0;',
      // 航迹白浪：船尾经过处的水花
      '  float wk = 0.0;',
      '  for (int i=0;i<6;i++){',
      '    float d = length(vWPos.xz - uWake[i].xz);',
      '    wk += smoothstep(1.45, 0.0, d);',
      '  }',
      '  wk = clamp(wk, 0.0, 1.0);',
      '  float w1 = sin(vWPos.x*1.9 + uTime*1.6) * 0.10 + sin(vWPos.z*2.4 - uTime*1.9)*0.08;',
      '  fm += smoothstep(0.40 + w1, 0.0, sd) * (0.45 + 0.40*w1);',
      '  fm += smoothstep(0.62, 0.0, sd) * wk * 1.15;',
      '  float w2 = sin(vWPos.x*2.6 - uTime*2.1)*0.10;',
      '  fm += smoothstep(0.36 + w2, 0.0, max(sdb,0.0)) * 0.55;',
      '  fm += smoothstep(0.55, 0.0, max(sdb,0.0)) * wk * 1.0;',
      '  for (int i=0;i<6;i++){',
      '    float d = length(vWPos.xz - uTetra[i].xz);',
      '    float w3 = sin(uTime*2.2 + d*3.0)*0.12;',
      '    fm += smoothstep(0.95 + w3, 0.0, d) * (0.85 + wk*0.9);',
      '  }',
      '  float fn = texture2D(tNoise, vWPos.xz*0.55 + vec2(uTime*0.03, -uTime*0.02)).r;',
      '  float fn2 = texture2D(tNoise, vWPos.xz*1.7 - vec2(uTime*0.05, uTime*0.03)).r;',
      '  fm = clamp(fm, 0.0, 1.0);',
      '  fm *= smoothstep(0.22, 0.62, fn*0.6 + fn2*0.4 + 0.18);',
      '  col = mix(col, uFoam, fm * 0.9);',
      // 粼光
      '  vec3 H = normalize(V + uSunDir);',
      '  float sp = pow(max(dot(N,H),0.0), 260.0);',
      '  float glit = step(0.80, texture2D(tNoise, vWPos.xz*3.1 + vec2(uTime*0.06, uTime*0.04)).r);',
      '  col += uSunColor * sp * 2.6;',
      '  col += uSunColor * glit * sp * 4.0;',
      // 雨点
      '  float rain = texture2D(tNoise, vWPos.xz*4.5 + vec2(uTime*0.9, uTime*0.6)).r;',
      '  col += vec3(0.9,0.97,1.0) * step(0.93, rain) * uRainAmt * 0.25;',
      // 边缘半透（浅水见底）
      '  float alpha = mix(0.80, 0.94, shore);',
      // 线性 → sRGB（该材质为自定义着色器，需自行编码）
      '  col = mix(col*12.92, 1.055*pow(max(col, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), col));',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n'),
  };

  const water = {
    surface: null, reflector: null, volume: null,
    waveH: waveH, waveGrad: waveGrad,
    RECT: null,
  };

  water.build = function (scene, renderer, rects) {
    water.RECT = rects;
    const L = TY.LAYOUT;
    const res = 720;
    const geo = new THREE.PlaneGeometry(20.4, 20.4, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(waterShader.uniforms),
      vertexShader: waterShader.vertexShader,
      fragmentShader: waterShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    mat.uniforms.tNoise.value = TX.tex(TX.noiseCanvas(256, 5), 1, 1, false);
    mat.uniforms.tCloud.value = TY.shared.uCloudTex.value;
    mat.uniforms.uCloudOffset.value = TY.shared.uCloudOffset.value;
    mat.uniforms.uCloudScale.value = TY.shared.uCloudScale.value;
    mat.uniforms.uCloudAmt.value = TY.shared.uCloudAmt.value;
    mat.uniforms.uSunDir.value = TY.sky.sunDir;
    mat.uniforms.uQuayA.value.set(L.west.x0, L.west.z0, L.west.x1, L.west.z1);
    mat.uniforms.uQuayB.value.set(L.south.x0, L.south.z0, L.south.x1, L.south.z1);
    mat.uniforms.uBreak.value.set(L.break.x0, L.break.z0, L.break.x1, L.break.z1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    mesh.renderOrder = 4;
    mesh.name = 'waterSurface';
    scene.add(mesh);
    water.surface = mesh;

    water.reflector = new PlanarReflector(renderer, scene, mesh, res);
    mat.uniforms.tReflect.value = water.reflector.rt.texture;
    water.reflector.textureMatrixUniform = mat.uniforms.textureMatrix || (mat.uniforms.textureMatrix = { value: water.reflector.textureMatrix });
    mat.uniforms.textureMatrix.value = water.reflector.textureMatrix;

    /* ---- 水体剖面（半透明青绿） ---- */
    water.buildVolume(scene);

    return water;
  };

  /* 水体侧壁：仅外露的四个面，透明青绿色剖面 */
  water.buildVolume = function (scene) {
    const M = TY.M;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0x7fd6c4) },
        uBottom: { value: new THREE.Color(0x11444f) },
        uSun: { value: new THREE.Color(0xd9fbf0) },
      },
      vertexShader: [
        'varying vec3 vWPos;',
        'varying vec2 vUv2;',
        'void main(){',
        '  vUv2 = uv;',
        '  vec4 wp = modelMatrix * vec4(position,1.0);',
        '  vWPos = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'uniform vec3 uTop, uBottom, uSun;',
        'varying vec3 vWPos;',
        'varying vec2 vUv2;',
        'void main(){',
        '  float d = clamp((vWPos.y + 2.4) / 2.4, 0.0, 1.0);',
        '  vec3 c = mix(uBottom, uTop, pow(d, 0.8));',
        '  float sh = sin(vWPos.x*1.7 + uTime*0.9) * 0.5 + 0.5;',
        '  float sh2 = sin(vWPos.y*3.1 - uTime*1.3) * 0.5 + 0.5;',
        '  c += uSun * 0.045 * sh * sh2;',
        '  float edge = smoothstep(0.0, 0.25, d);',
        '  c = mix(c*12.92, 1.055*pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c));',
        '  gl_FragColor = vec4(c, mix(0.52, 0.24, d) + 0.10*edge);',
        '}'
      ].join('\n'),
    });
    const grp = new THREE.Group();
    grp.name = 'waterVolume';
    // 东侧 (x=10)、北侧 (z=-10)
    const faces = [
      { w: 14.4, h: 2.4, pos: [10.02, -1.2, -2.9], rot: [0, Math.PI / 2, 0] },
      { w: 13.4, h: 2.4, pos: [3.4, -1.2, -10.02], rot: [0, 0, 0] },
    ];
    for (const f of faces) {
      const g = new THREE.PlaneGeometry(f.w, f.h);
      const m = new THREE.Mesh(g, mat);
      m.position.set(f.pos[0], f.pos[1], f.pos[2]);
      m.rotation.set(f.rot[0], f.rot[1], f.rot[2]);
      m.renderOrder = 1;
      grp.add(m);
    }
    scene.add(grp);
    water.volume = grp;
    water.volumeMat = mat;
    return grp;
  };

  water.update = function (t, camera, renderer, scene) {
    const m = water.surface.material;
    m.uniforms.uTime.value = t;
    m.uniforms.uCloudAmt.value = TY.shared.uCloudAmt.value;
    m.uniforms.uCloudOffset.value = TY.shared.uCloudOffset.value;
    water.volumeMat.uniforms.uTime.value = t;
    // 航迹白浪位置（取最近 6 个）
    const wk = m.uniforms.uWake.value;
    const trail = (TY.life && TY.life.wake) ? TY.life.wake : null;
    for (let i = 0; i < wk.length; i++) {
      if (trail && i < trail.length) wk[i].set(trail[i].x, 0, trail[i].z);
      else wk[i].set(0, -99, 0);
    }
    if (water.reflector) {
      const w = renderer.domElement.width, h = renderer.domElement.height;
      const target = Math.max(384, Math.min(768, Math.round(Math.max(w, h) * 0.36)));
      water.reflector.setSize(target);
      water.reflector.update(camera);
    }
  };

  TY.water = water;
  TY.PlanarReflector = PlanarReflector;
  TY.REFLECT_LAYER = REFLECT_LAYER;
  TY.registerReflect = function (obj) {
    obj.traverse((o) => o.layers.enable(REFLECT_LAYER));
  };
})();
