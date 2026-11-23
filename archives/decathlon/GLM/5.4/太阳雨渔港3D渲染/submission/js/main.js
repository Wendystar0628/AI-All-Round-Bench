/* ============================================================
   main.js — 渲染器 / 相机 / 光照 / 主循环
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
  renderer.setSize(global.innerWidth, global.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xd7edf2, 1);
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  S.scene = scene;
  scene.fog = new THREE.Fog(0xd7ecf1, 70, 190);

  const camera = new THREE.PerspectiveCamera(34, global.innerWidth / global.innerHeight, 0.1, 600);
  S.camera = camera;
  camera.position.set(18, 15, 23);
  camera.layers.enable(1);

  /* ---------------- 光照 ---------------- */
  const hemi = new THREE.HemisphereLight(0xdcf2fa, 0xa3c2c6, 0.36);
  scene.add(hemi);
  S.hemiLight = hemi;

  const sun = new THREE.DirectionalLight(0xfff4dc, 0.95);
  sun.position.set(-14, 26, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);
  S.sunLight = sun;

  const fill = new THREE.DirectionalLight(0xcfe9f2, 0.18);
  fill.position.set(18, 10, -14);
  scene.add(fill);
  S.fillLight = fill;

  const bounce = new THREE.DirectionalLight(0xd8ecea, 0.04);
  bounce.position.set(0, -8, 8);
  scene.add(bounce);

  /* ---------------- 天空 ---------------- */
  S.buildSky = function () {
    const geo = new THREE.SphereGeometry(260, 32, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(0x7cc2e4) },
        uMid: { value: new THREE.Color(0xaddcf0) },
        uBot: { value: new THREE.Color(0xd7edf2) },
        uSunDir: { value: new THREE.Vector3(-0.45, 0.62, 0.4).normalize() },
        uSunCol: { value: new THREE.Color(0xfff2cc) },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize( position );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uSunDir; uniform vec3 uSunCol;
        uniform float uTime;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vnoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f*f*(3.0-2.0*f);
          return mix( mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y );
        }
        float fbm2(vec2 p){
          float s = 0.0, a = 0.5;
          for ( int i = 0; i < 4; i ++ ) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
          return s;
        }
        void main(){
          float h = clamp( vDir.y * 1.25 + 0.12, 0.0, 1.0 );
          vec3 col = mix( uBot, uMid, smoothstep( 0.0, 0.30, h ) );
          col = mix( col, uTop, smoothstep( 0.28, 1.0, h ) );
          // 薄云
          vec2 cp = vDir.xz / max( 0.12, vDir.y + 0.25 ) * 0.55;
          float cl = fbm2( cp * 1.6 + vec2( uTime * 0.008, uTime * 0.004 ) );
          float band = smoothstep( 0.03, 0.16, vDir.y ) * ( 1.0 - smoothstep( 0.30, 0.75, vDir.y ) );
          float cm = smoothstep( 0.50, 0.78, cl ) * band;
          col = mix( col, vec3( 0.985, 0.995, 1.0 ), cm * 0.75 );
          float sd = max( dot( normalize(vDir), uSunDir ), 0.0 );
          col += uSunCol * ( pow( sd, 26.0 ) * 0.85 + pow( sd, 5.0 ) * 0.16 );
          gl_FragColor = vec4( col, 1.0 );
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    scene.add(sky);
    S.skyMat = mat;
    return sky;
  };
  S.buildSky();

  /* ---------------- 材质初始化 ---------------- */
  S.initMaterials();

  /* ---------------- 场景构建 ---------------- */
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);
  S.world = world;

  S.buildConcrete(world);
  S.buildDockDetail(world);
  S.buildWater(world);
  S.buildSeabed(world);
  S.buildSeaweed(world);
  S.buildFoam(world);
  S.buildBreakwater(world);
  S.buildLighthouse(world);
  S.buildHill(world);

  if (S.buildProps) S.buildProps(world);
  if (S.buildExtraProps) S.buildExtraProps(world);
  if (S.buildBoats) S.buildBoats(world);
  if (S.buildBuildings) S.buildBuildings(world);
  if (S.buildEffects) S.buildEffects(world);
  if (S.buildLife) S.buildLife(world);

  /* ---------------- 平面反射 ---------------- */
  const reflRT = new THREE.WebGLRenderTarget(1024, 1024, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });
  reflRT.texture.encoding = THREE.sRGBEncoding;
  const reflCam = new THREE.PerspectiveCamera();
  reflCam.layers.set(0);
  const reflM = new THREE.Matrix4();
  const biasM = new THREE.Matrix4().set(
    0.5, 0.0, 0.0, 0.5,
    0.0, 0.5, 0.0, 0.5,
    0.0, 0.0, 0.5, 0.5,
    0.0, 0.0, 0.0, 1.0
  );
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -S.W.waterY);
  const _clip = new THREE.Vector4();

  const _q = new THREE.Vector4();

  function computeReflMatrix(planeY, out) {
    const cam = S.camera;
    reflCam.fov = cam.fov; reflCam.aspect = cam.aspect;
    reflCam.near = cam.near; reflCam.far = cam.far;
    reflCam.updateProjectionMatrix();

    reflCam.position.set(cam.position.x, 2 * planeY - cam.position.y, cam.position.z);
    const look = _v1.set(0, 0, -1).applyMatrix4(cam.matrixWorld);
    look.y = 2 * planeY - look.y;
    const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    reflCam.up.set(0, 1, 0).applyMatrix4(rot);
    reflCam.up.y = -reflCam.up.y;
    reflCam.lookAt(look);
    reflCam.updateMatrixWorld(true);

    _plane.normal.set(0, 1, 0);
    _plane.constant = -planeY;
    _plane.applyMatrix4(reflCam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const cps = _clip.clone();
    const pm = reflCam.projectionMatrix;
    _q.set(
      (Math.sign(cps.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(cps.y) + pm.elements[9]) / pm.elements[5],
      -1.0,
      (1.0 + pm.elements[10]) / pm.elements[14]
    );
    cps.multiplyScalar(2.0 / cps.dot(_q));
    pm.elements[2] = cps.x;
    pm.elements[6] = cps.y;
    pm.elements[10] = cps.z + 1.0 - 0.004;
    pm.elements[14] = cps.w;
    reflCam.projectionMatrixInverse.copy(pm).invert();
    out.copy(biasM).multiply(pm).multiply(reflCam.matrixWorldInverse);
    return reflCam;
  }

  function updateReflection() {
    computeReflMatrix(S.W.waterY, reflM);
    const waterMats = [S.M.water, S.M.puddle];
    for (const m of waterMats) if (m) { m.uniforms.uReflM.value.copy(reflM); }

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    renderer.render(scene, reflCam);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;

    // 水洼使用略高的反射平面
    computeReflMatrix(0.02, reflM);
    if (S.M.puddle) S.M.puddle.uniforms.uReflM.value.copy(reflM);

    if (S.M.water) S.M.water.uniforms.uRefl.value = reflRT.texture;
    if (S.M.puddle) S.M.puddle.uniforms.uRefl.value = reflRT.texture;
  }

  /* ---------------- 控制 ---------------- */
  const controls = new S.Controls(camera, renderer.domElement);
  controls.set(0.74, 1.00, 40, new THREE.Vector3(0.2, -0.6, -0.6));
  S.controls = controls;

  /* ---------------- 后期 ---------------- */
  const post = new S.Post(renderer, scene, camera);
  S.post = post;

  /* ---------------- 尺寸 ---------------- */
  function onResize() {
    const w = global.innerWidth, h = global.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    post.setSize(w, h, Math.min(global.devicePixelRatio || 1, 2));
    reflRT.setSize(Math.max(256, Math.floor(w * 0.5)), Math.max(256, Math.floor(h * 0.5)));
  }
  global.addEventListener('resize', onResize);
  onResize();

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();
  let acc = 0;

  S.updateWorld = function (t) {
    S.time = t;
    if (S.skyMat) S.skyMat.uniforms.uTime.value = t;
    S.sun = S.sunAt(t);
    S.rain = S.rainAt(t);
    S.wind = S.gustAt(t);
    const E = S.__exp || 1;
    S.sunLight.intensity = (0.58 + S.sun * 0.38) * E;
    S.fillLight.intensity = (0.10 + S.sun * 0.08) * E;
    S.hemiLight.intensity = 0.36 * E;
    if (S.updateBase) S.updateBase(t);
    if (S.updateProps) S.updateProps(t);
    if (S.updateBoats) S.updateBoats(t);
    if (S.updateBuildings) S.updateBuildings(t);
    if (S.updateEffects) S.updateEffects(t);
  };

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!S.exportMode) {
      S.updateWorld(S.time + dt);
      controls.update(dt);
      if (S.updateLife) S.updateLife(S.time, dt);
      updateReflection();
      post.render();
    }
    requestAnimationFrame(frame);
  }

  S.renderFrame = function () {
    controls.update(0.016);
    updateReflection();
    post.render();
  };

  // 供导出使用：设置时间并渲染
  S.renderAt = function (t) {
    S.updateWorld(t);
    if (S.exportMode) S.updateTourCamera(t);
    else controls.update(0.016);
    if (S.updateLife) S.updateLife(t, 1 / 60);
    updateReflection();
    post.render();
  };

  requestAnimationFrame(frame);

  // 调试钩子
  S.__ready = true;
  S.__renderer = renderer;
})(window);
