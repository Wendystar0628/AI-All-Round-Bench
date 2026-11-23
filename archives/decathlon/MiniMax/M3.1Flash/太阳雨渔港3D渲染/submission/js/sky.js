/* =====================================================================
   sky.js — 天空穹顶 / 太阳 / 光照 / 雾 / 云影
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const TX = TY.tex;

  const sky = {
    sunDir: new THREE.Vector3(0.60, 0.66, 0.45).normalize(),
    dome: null, sun: null, sunLight: null, hemi: null,
    darkness: 0,
    _cTop: new THREE.Color(0x8fc6e0),
    _cHorizon: new THREE.Color(0xeaf5f6),
    _cLow: new THREE.Color(0xd9e9e6),
    _t0: new THREE.Color(0x8fc6e0),
    _t1: new THREE.Color(0xeaf5f6),
    _l0: new THREE.Color(0xd9e9e6),
    _l1: new THREE.Color(0xbfd6d6),
  };

  sky.build = function (scene, renderer) {
    /* ---- 天空穹顶 ---- */
    const geo = new THREE.SphereGeometry(420, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: sky._cTop },
        uHorizon: { value: sky._cHorizon },
        uLow: { value: sky._cLow },
        uSunDir: { value: sky.sunDir },
        uSunColor: { value: new THREE.Color(0xfff6de) },
        uNoise: { value: TX.tex(TX.cloudCanvas(256), 1, 1, false) },
        uTime: { value: 0 },
        uCloudAmt: { value: 0.9 },
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main(){',
        '  vDir = position;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vDir;',
        'uniform vec3 uTop, uHorizon, uLow, uSunDir, uSunColor;',
        'uniform sampler2D uNoise;',
        'uniform float uTime, uCloudAmt;',
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float h = d.y;',
        '  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.58, h));',
        '  col = mix(col, uLow, smoothstep(0.0, -0.22, h));',
        '  float sd = max(dot(d, uSunDir), 0.0);',
        '  col += uSunColor * pow(sd, 900.0) * 3.2;',
        '  col += uSunColor * pow(sd, 16.0) * 0.40;',
        '  col += uSunColor * pow(sd, 3.0) * 0.14;',
        '  vec2 uv = d.xz / max(abs(h) + 0.26, 0.06);',
        '  float c1 = texture2D(uNoise, uv * 0.075 + vec2(uTime * 0.0035, uTime * 0.0016)).r;',
        '  float c2 = texture2D(uNoise, uv * 0.155 - vec2(uTime * 0.0052, uTime * 0.0011)).r;',
        '  float c3 = texture2D(uNoise, uv * 0.31 + vec2(uTime * 0.0081, -uTime * 0.0033)).r;',
        '  float cl = c1 * 0.58 + c2 * 0.30 + c3 * 0.12;',
        '  float band = smoothstep(0.44, 0.80, cl) * smoothstep(-0.03, 0.26, h) * uCloudAmt;',
        '  float band2 = smoothstep(0.58, 0.86, cl) * smoothstep(0.02, 0.30, h) * uCloudAmt;',
        '  col = mix(col, vec3(1.0, 0.998, 0.985), band * 0.82);',
        '  col = mix(col, vec3(1.0, 0.99, 0.95), band2 * 0.35);',
        '  float haze = exp(-abs(h) * 15.0) * 0.6;',
        '  col = mix(col, vec3(0.95, 0.975, 0.975), haze * 0.6);',
        '  col = mix(col, vec3(1.0, 0.96, 0.88), pow(sd, 2.0) * 0.16);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    dome.name = 'skyDome';
    scene.add(dome);
    sky.dome = dome;

    /* ---- 阳光 ---- */
    const sun = new THREE.DirectionalLight(0xfff2d8, 3.05);
    sun.position.copy(sky.sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17;
    sc.near = 12; sc.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.028;
    sun.shadow.radius = 2.2;
    scene.add(sun);
    scene.add(sun.target);
    sun.target.position.set(-1, 0, 0);
    sky.sunLight = sun;

    /* ---- 天空/地面反射补光 ---- */
    const hemi = new THREE.HemisphereLight(0xe4f4fb, 0x6d9492, 0.78);
    scene.add(hemi);
    sky.hemi = hemi;

    const amb = new THREE.AmbientLight(0xe9f4f8, 0.20);
    scene.add(amb);
    sky.amb = amb;

    /* ---- 雾 ---- */
    scene.fog = new THREE.Fog(0xd9e9ee, 32, 96);
    scene.background = new THREE.Color(0xd9e9ee);
    scene_fog = scene.fog;

    /* ---- 环境贴图（玻璃/金属反射） ---- */
    const env = TX.tex(TX.skyEnvCanvas(), 1, 1);
    env.mapping = THREE.EquirectangularReflectionMapping;
    env.colorSpace = THREE.SRGBColorSpace;
    scene.environment = env;
    scene.environmentIntensity = 0.55;

    return sky;
  };

  /* 相机相关的雾范围 */
  sky.updateFog = function (camera) {
    const d = camera.position.length();
    const f = scene_fog;
    if (f) {
      f.near = d + 6;
      f.far = d + 62;
    }
  };
  let scene_fog = null;

  sky.attach = function (scene) { scene_fog = scene.fog; };

  /* 每帧更新 */
  sky.update = function (t, camera) {
    const dm = sky.dome.material;
    dm.uniforms.uTime.value = t;
    // 云影缓慢移动
    TY.shared.uCloudOffset.value.set(t * 0.018, t * 0.011);
    // 太阳方向转到视空间（给高光用）
    const v = TY.shared.uSunDirView.value;
    v.copy(sky.sunDir).transformDirection(camera.matrixWorldInverse);
    // 天色变暗（罕见）
    const k = sky.darkness;
    dm.uniforms.uTop.value.copy(sky._t0).lerp(new THREE.Color(0x7f9fb4), k);
    dm.uniforms.uHorizon.value.copy(sky._t1).lerp(new THREE.Color(0xc3d2d6), k);
    dm.uniforms.uLow.value.copy(sky._l0).lerp(sky._l1, k);
    dm.uniforms.uCloudAmt.value = 0.9 + k * 0.5;
    if (sky.sunLight) sky.sunLight.intensity = 3.05 * (1 - k * 0.62);
    if (sky.hemi) sky.hemi.intensity = 0.78 * (1 - k * 0.30);
    if (sky.amb) sky.amb.intensity = 0.20 * (1 - k * 0.25);
    TY.shared.uCloudAmt.value = 0.34 + k * 0.35;
  };

  TY.sky = sky;
})();
