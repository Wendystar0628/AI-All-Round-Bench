/* ============ main: renderer, lights, sky, loop, export hooks ============ */
(function () {
  const HB = (window.HB = window.HB || {});
  const C = HB.C, P = HB.P, U = HB.U;

  const app = HB.app = {
    simTime: 0, realTime: 0, exporting: false, frames: 0, fps: 60,
    celExempt: [], tickFns: [], timeFns: [],
  };

  // ---------------------------------------------------------------- renderer
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xdfeaee, 1);
  app.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.55, 0.72, 0.76);
  scene.fog = new THREE.FogExp2(0xd9ecf0, 0.0034);
  app.scene = scene;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.4, 900);
  camera.position.set(24, 28, 30);
  app.camera = camera;

  // ---------------------------------------------------------------- lights
  const SUN_DIR = new THREE.Vector3(-0.52, 0.72, 0.47).normalize();
  app.SUN_DIR = SUN_DIR;

  const sun = new THREE.DirectionalLight(0xfff3d8, 0.88);
  sun.position.copy(SUN_DIR).multiplyScalar(90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 190;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  app.sun = sun;

  const hemi = new THREE.HemisphereLight(0xeaf7fa, 0x3f7f88, 0.60);
  scene.add(hemi);
  app.hemi = hemi;

  const fill = new THREE.DirectionalLight(0xd8eef2, 0.18);
  fill.position.set(30, 24, 40);
  scene.add(fill);
  app.fill = fill;

  // warm bounce from the water
  const bounce = new THREE.DirectionalLight(0x9fd8cf, 0.12);
  bounce.position.set(10, -20, -10);
  scene.add(bounce);

  // ---------------------------------------------------------------- sky dome
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uSunDir: { value: SUN_DIR } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      precision highp float;
      uniform float uTime; uniform vec3 uSunDir; varying vec3 vD;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+11.3; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vD);
        float h = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 low  = vec3(0.965,0.985,0.985);
        vec3 mid  = vec3(0.815,0.905,0.925);
        vec3 high = vec3(0.615,0.775,0.845);
        vec3 col = mix(low, mid, smoothstep(0.42,0.62,h));
        col = mix(col, high, smoothstep(0.62,0.95,h));
        // thin drifting clouds
        vec2 cp = vec2(atan(d.z,d.x)*1.6, d.y*3.2);
        float c1 = fbm(cp*1.6 + vec2(uTime*0.012, uTime*0.004));
        float c2 = fbm(cp*3.1 + vec2(-uTime*0.02, uTime*0.007));
        float cl = smoothstep(0.52,0.86,c1)*0.55 + smoothstep(0.60,0.92,c2)*0.28;
        cl *= smoothstep(-0.02, 0.28, d.y);
        col = mix(col, vec3(0.99,0.995,1.0), cl*0.65);
        col = mix(col, vec3(0.93,0.94,0.95), cl*0.25);
        // sun glow
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(1.0,0.90,0.70)*pow(s, 22.0)*0.55;
        col += vec3(1.0,0.94,0.80)*pow(s, 5.0)*0.16;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  app.sky = sky;
  app.celExempt.push(sky);

  // ---------------------------------------------------------------- cloud shadows
  const cloudTex = HB.TEX.cloudShadow;
  cloudTex.repeat.set(4.5, 4.5);
  const cloudPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshBasicMaterial({ map: cloudTex, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, fog: true })
  );
  cloudPlane.rotation.x = -Math.PI / 2;
  cloudPlane.position.y = 30;
  cloudPlane.renderOrder = 20;
  scene.add(cloudPlane);
  app.cloudPlane = cloudPlane;
  app.celExempt.push(cloudPlane);

  // ---------------------------------------------------------------- world
  HB.world.build(scene);
  if (HB.buildBoats) HB.buildBoats(scene);
  if (HB.buildProps) HB.buildProps(scene);
  if (HB.buildBuildings) HB.buildBuildings(scene);
  if (HB.buildLife) HB.buildLife(scene);
  if (HB.buildEffects) HB.buildEffects(scene);

  // ---------------------------------------------------------------- controls
  const controls = HB.controls(camera, renderer.domElement);
  app.controls = controls;
  controls.set(0.22 * Math.PI, 0.60, 62, -1.5, -0.4, 1.5, true);

  // ---------------------------------------------------------------- post
  HB.post.init(renderer, scene, camera);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    HB.post.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- frame
  function renderFrame() {
    HB.post.render(scene, camera);
  }

  function stepWorld(dt, t) {
    U.camPos.value.copy(camera.position);
    if (HB.world.update) HB.world.update(t);
    if (HB.boats && HB.boats.update) HB.boats.update(t, dt);
    if (HB.props && HB.props.update) HB.props.update(t, dt);
    if (HB.buildings && HB.buildings.update) HB.buildings.update(t, dt);
    if (HB.life && HB.life.update) HB.life.update(t, dt);
    if (HB.effects && HB.effects.update) HB.effects.update(t, dt);
  }

  // ---------------------------------------------------------------- video export
  window.videoExport = {
    runs: ['tour'],
    begin: function (runId, opts) {
      opts = opts || {};
      app.fps = opts.fps || 60;
      app.exporting = true;
      controls.enabled = false;
      const info = HB.tour.begin(app.fps);
      app.frames = info.frames;
      return info;
    },
    frame: function (i) {
      const t = i / app.fps;
      app.simTime = t;
      HB.tour.setTime(t);
      camera.updateMatrixWorld(true);
      stepWorld(1 / app.fps, t);
      renderFrame();
    },
    end: function () {
      app.exporting = false;
      controls.enabled = true;
      HB.tour.end();
    },
  };

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    if (!app.exporting) {
      app.realTime += dt;
      app.simTime = app.realTime;
      U.time.value = app.simTime;
      controls.apply();
      camera.updateMatrixWorld(true);
      stepWorld(dt, app.simTime);
      renderFrame();
    }
  }
  requestAnimationFrame(loop);

  app.renderFrame = renderFrame;
})();
