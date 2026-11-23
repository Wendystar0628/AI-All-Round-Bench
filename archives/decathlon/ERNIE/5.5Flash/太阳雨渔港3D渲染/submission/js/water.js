// ---------- water surface, cross-section, underwater, puddles ----------
const WATER_Y = -0.55;
const WATER = {};

function initWater(scene) {
  const group = new THREE.Group();
  scene.add(group);
  WATER.group = group;

  const reflRT = new THREE.WebGLRenderTarget(512, 512, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, depthBuffer: true
  });
  reflRT.texture.encoding = THREE.sRGBEncoding;
  WATER.reflRT = reflRT;
  WATER.reflCam = new THREE.PerspectiveCamera();
  WATER.texMat = new THREE.Matrix4();
  WATER.planeY = WATER_Y;

  const pudRT = new THREE.WebGLRenderTarget(256, 256, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, depthBuffer: true
  });
  pudRT.texture.encoding = THREE.sRGBEncoding;
  WATER.pudRT = pudRT;
  WATER.pudCam = new THREE.PerspectiveCamera();
  WATER.pudTexMat = new THREE.Matrix4();
  WATER.pudPlaneY = 0.021;

  const surfaceMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0.7 },
      uWind: { value: 0 },
      uCloud: { value: 1 },
      tReflect: { value: reflRT.texture },
      uTexMat: { value: WATER.texMat },
      uSun: { value: SKY.sunDir.clone() },
      uSunColor: { value: new THREE.Color(0xfff0c8) },
      uDeep: { value: new THREE.Color(0x2e8b92) },
      uShallow: { value: new THREE.Color(0x8ad8cd) },
      uSky: { value: new THREE.Color(0xdceff2) },
      fogColor: { value: new THREE.Color(0xdceff1) },
      fogDensity: { value: 0.0042 }
    },
    vertexShader: `
      uniform mat4 uTexMat;
      varying vec3 vWorld;
      varying vec4 vRefl;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vRefl = uTexMat * wp;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uRain, uWind, uCloud;
      uniform sampler2D tReflect;
      uniform vec3 uSun, uSunColor, uDeep, uShallow, uSky;
      varying vec3 vWorld;
      varying vec4 vRefl;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
                   mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
      }
      float waveH(vec2 p){
        float t = uTime;
        return 0.045*sin(p.x*0.62 + t*0.82)
             + 0.032*sin(p.y*0.78 - t*1.03)
             + 0.018*sin((p.x+p.y)*1.55 + t*1.55)
             + 0.011*sin((p.x-p.y)*2.7 - t*2.1);
      }
      void main(){
        float t = uTime;
        vec2 p = vWorld.xz;
        float e = 0.30;
        float h0 = waveH(p);
        float hx = waveH(p + vec2(e, 0.0));
        float hz = waveH(p + vec2(0.0, e));
        float amp = 1.15 + uWind * 0.8;
        vec3 N = normalize(vec3(-(hx-h0)/e * amp, 1.0, -(hz-h0)/e * amp));

        // rain rings
        vec2 rp = p * 1.25;
        vec2 cell = floor(rp);
        vec2 f = fract(rp) - 0.5;
        float hs = hash(cell);
        vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
        float ph = fract(t * 0.60 + hs);
        float dd = length(f - off * 0.55);
        float ring = sin(dd * 46.0 - ph * 26.0) * exp(-dd * 7.5) * (1.0 - ph) * smoothstep(0.02, 0.15, ph);
        ring *= uRain;
        N.xz += (f - off * 0.5) * ring * 0.55;
        N = normalize(N);

        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.18 + 0.82 * pow(1.0 - max(dot(N, V), 0.0), 3.0);

        vec2 ruv = vRefl.xy / max(vRefl.w, 0.0001);
        ruv += N.xz * (0.028 + 0.02 * uWind);
        vec3 refl = texture2D(tReflect, ruv).rgb;
        refl = floor(refl * 4.0 + 0.5) / 4.0;
        refl = mix(refl, uSky, 0.10);
        refl = mix(refl, uShallow * 0.85, 0.10);
        refl *= vec3(0.90, 0.99, 0.98);

        float n = noise(p * 0.16 + vec2(t * 0.008, -t * 0.005));
        vec3 base = mix(uDeep, uShallow, clamp(0.30 + 0.30 * n + 0.10 * sin(p.x * 0.22 + p.y * 0.17), 0.0, 1.0));
        vec3 col = mix(base, refl, clamp(0.50 + 0.45 * fres, 0.0, 0.95));
        col = mix(col, uShallow * 1.05, 0.10);

        // sun glitter, posterised
        vec3 R = reflect(-uSun, N);
        float spec = pow(max(dot(R, V), 0.0), 160.0);
        float sp = smoothstep(0.18, 0.42, spec);
        col += uSunColor * sp * (0.55 + 0.35 * uCloud);
        float glit = pow(max(dot(R, V), 0.0), 22.0);
        col += uSunColor * (floor(glit * 4.0) / 4.0) * 0.07;

        col += vec3(0.85, 1.0, 0.97) * max(ring, 0.0) * 0.16;

        // shoreline foam
        float foam = 0.0;
        foam += exp(-pow((p.x + 12.0) / 0.55, 2.0)) * step(p.y, 8.3);
        foam += exp(-pow((p.y - 8.0) / 0.55, 2.0)) * step(p.x, 8.3);
        foam += exp(-pow((p.x - 8.0) / 0.50, 2.0)) * step(-18.5, p.y) * step(p.y, 8.3);
        foam += exp(-pow((p.x - 12.0) / 0.50, 2.0)) * step(-18.5, p.y) * step(p.y, 8.3);
        foam += exp(-pow((p.x - 8.0) / 0.50, 2.0)) * step(8.0, p.y);
        foam *= 0.55 + 0.45 * sin(t * 1.15 + p.y * 2.7 + p.x * 1.9);
        col = mix(col, vec3(0.96, 0.995, 0.98), clamp(foam * 0.55, 0.0, 0.6));

        // slight distance haze
        float dist = length(cameraPosition - vWorld);
        col = mix(col, uSky, smoothstep(60.0, 120.0, dist) * 0.35);

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`
  });

  const surfGeo = new THREE.PlaneGeometry(37, 48, 1, 1);
  const surface = new THREE.Mesh(surfGeo, surfaceMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(5.5, WATER_Y, 0);
  surface.receiveShadow = false;
  surface.renderOrder = 2;
  group.add(surface);
  WATER.surface = surface;
  WATER.mat = surfaceMat;

  // ---- underwater volume side walls ----
  const wallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(0x8fe0d4) },
      uBottom: { value: new THREE.Color(0x1f6d78) },
      fogColor: { value: new THREE.Color(0xdceff1) },
      fogDensity: { value: 0.0042 }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uTop, uBottom;
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        float y = vUv.y;
        vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, y));
        float caus = sin(vW.x * 2.1 + vW.z * 1.7 + uTime * 0.9) * sin(vW.z * 2.4 - uTime * 0.7);
        col += vec3(0.35, 0.55, 0.5) * smoothstep(0.55, 0.95, caus) * 0.10;
        float a = mix(0.58, 0.26, y);
        a += 0.10 * smoothstep(0.9, 1.0, y);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`
  });
  WATER.wallMat = wallMat;

  function sideWall(w, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 5.65), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.renderOrder = 30;
    group.add(m);
    return m;
  }
  // east (x=24, z -16.4..24)
  sideWall(40.4, 24, WATER_Y - 2.8, 3.8, -Math.PI / 2);
  // south (z=24, x 8..24)
  sideWall(16, 16, WATER_Y - 2.8, 24, Math.PI);
  // north (z=-24, x -12..8)
  sideWall(20, -2, WATER_Y - 2.8, -24, 0);

  // bright waterline on top of the section
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xdffbf4, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
  function waterline(w, x, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.10), lineMat);
    m.position.set(x, WATER_Y + 0.005, z);
    m.rotation.y = ry;
    m.renderOrder = 31;
    group.add(m);
  }
  waterline(40.4, 24.01, 3.8, -Math.PI / 2);
  waterline(16, 16, 24.01, Math.PI);
  waterline(20, -2, -24.01, 0);

  // ---- underwater world ----
  const under = new THREE.Group();
  scene.add(under);
  WATER.under = under;

  const bed = new THREE.Mesh(new THREE.PlaneGeometry(37.4, 48.4), MAT.sand);
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(5.5, -5.75, 0);
  bed.receiveShadow = true;
  under.add(bed);

  // soft underwater fill so the cross-section reads clearly
  const uw1 = new THREE.PointLight(0xa9efe2, 0.95, 38, 1.5);
  uw1.position.set(2, -2.4, 2);
  under.add(uw1);
  const uw2 = new THREE.PointLight(0x9fe6dd, 0.80, 34, 1.5);
  uw2.position.set(19, -2.4, 8);
  under.add(uw2);

  // caustics on bed
  const causMat = new THREE.MeshBasicMaterial({
    map: TEX.caustic, transparent: true, opacity: 0.30, color: 0xfff6d8,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const caus = new THREE.Mesh(new THREE.PlaneGeometry(37, 48), causMat);
  caus.rotation.x = -Math.PI / 2;
  caus.position.set(5.5, -5.72, 0);
  caus.renderOrder = 1;
  under.add(caus);
  WATER.causticMat = causMat;

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rr = mulberry32(301);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(rockGeo, i % 3 === 0 ? MAT.darkGreen : MAT.concreteDark);
    const s = 0.25 + rr() * 0.85;
    m.scale.set(s * (0.8 + rr() * 0.7), s * (0.5 + rr() * 0.4), s * (0.8 + rr() * 0.7));
    m.position.set(-11 + rr() * 34, -5.65 + s * 0.18, -23 + rr() * 46);
    m.rotation.set(rr() * TAU, rr() * TAU, rr() * TAU);
    m.castShadow = false; m.receiveShadow = true;
    under.add(m);
  }

  // old tyres
  const tyreGeo = new THREE.TorusGeometry(0.55, 0.19, 8, 16);
  [[-8.5, -5.35, 3.2, 0.3], [-7.6, -5.45, 1.2, 1.2], [13.5, -5.4, 9.5, 0.7]].forEach(t => {
    const m = new THREE.Mesh(tyreGeo, MAT.black);
    m.position.set(t[0], t[1], t[2]);
    m.rotation.set(Math.PI / 2 + t[3] * 0.3, t[3], 0.2);
    under.add(m);
  });

  // anchor chain
  const linkGeo = new THREE.TorusGeometry(0.11, 0.032, 5, 9);
  const chainPts = [];
  for (let i = 0; i < 22; i++) {
    const u = i / 21;
    chainPts.push(new THREE.Vector3(-2 + u * 5.2, -5.45 + Math.sin(u * 3.0) * 0.10, -5 + u * 6.4));
  }
  chainPts.forEach((p, i) => {
    const m = new THREE.Mesh(linkGeo, MAT.rust);
    m.position.copy(p);
    m.rotation.set(i % 2 ? Math.PI / 2 : 0, i * 0.7, i % 2 ? 0.4 : 0);
    under.add(m);
  });
  // anchor
  const anchor = new THREE.Group();
  const shank = cyl(0.05, 0.05, 1.1, 6, MAT.rust, 0, 0, 0);
  anchor.add(shank);
  const stock = cyl(0.04, 0.04, 0.9, 6, MAT.rust, 0, 0.42, 0);
  stock.rotation.z = Math.PI / 2;
  anchor.add(stock);
  const armL = cyl(0.035, 0.05, 0.6, 5, MAT.rust, -0.22, -0.5, 0);
  armL.rotation.z = 0.8;
  anchor.add(armL);
  const armR = cyl(0.035, 0.05, 0.6, 5, MAT.rust, 0.22, -0.5, 0);
  armR.rotation.z = -0.8;
  anchor.add(armR);
  anchor.position.set(3.2, -5.2, 1.4);
  anchor.rotation.set(0.4, 0.7, 1.2);
  under.add(anchor);

  // seaweed
  const weedMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: true,
    uniforms: { uTime: { value: 0 }, fogColor: { value: new THREE.Color(0xdceff1) }, fogDensity: { value: 0.0042 } },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      varying vec2 vUv;
      varying float vFogDepth;
      void main(){
        vUv = uv;
        vec3 p = position;
        float k = (p.y + 0.05);
        p.x += sin(uTime * 1.05 + aSeed * 6.28 + p.y * 2.2) * 0.20 * k;
        p.z += cos(uTime * 0.83 + aSeed * 4.1 + p.y * 1.7) * 0.11 * k;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 fogColor; uniform float fogDensity;
      varying float vFogDepth;
      void main(){
        vec3 col = mix(vec3(0.16,0.36,0.28), vec3(0.42,0.62,0.36), vUv.y);
        float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
        float a = edge * 0.92;
        float f = 1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
        col = mix(col, fogColor, clamp(f,0.0,1.0));
        gl_FragColor = vec4(col, a);
      }`
  });
  WATER.weedMat = weedMat;
  const weedGeoBase = new THREE.PlaneGeometry(0.20, 1.9, 1, 7);
  weedGeoBase.translate(0, 0.95, 0);
  const wr = mulberry32(307);
  for (let i = 0; i < 18; i++) {
    const g = weedGeoBase.clone();
    const seeds = new Float32Array(g.attributes.position.count);
    const sd = wr();
    for (let k = 0; k < seeds.length; k++) seeds[k] = sd;
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.Mesh(g, weedMat);
    const side = wr();
    if (side < 0.45) m.position.set(-11.5 + wr() * 1.6, -5.7, -20 + wr() * 26);
    else if (side < 0.8) m.position.set(6.5 + wr() * 1.2, -5.7, -16 + wr() * 22);
    else m.position.set(18.5 + wr() * 4.5, -5.7, 1 + wr() * 11);
    m.rotation.y = wr() * TAU;
    const s = 0.6 + wr() * 0.8;
    m.scale.set(s, s * (0.7 + wr() * 0.8), s);
    under.add(m);
  }

  // seaweed on the quay walls near the waterline
  const wr2 = mulberry32(317);
  for (let i = 0; i < 10; i++) {
    const g = weedGeoBase.clone();
    const seeds = new Float32Array(g.attributes.position.count);
    const sd = wr2();
    for (let k = 0; k < seeds.length; k++) seeds[k] = sd;
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.Mesh(g, weedMat);
    if (i < 5) {
      m.position.set(-10 + i * 3.6, -2.45, 7.93);
      m.rotation.y = 0;
    } else {
      m.position.set(-11.93, -2.45, 4.5 - (i - 5) * 4.4);
      m.rotation.y = Math.PI / 2;
    }
    const s = 0.45 + wr2() * 0.55;
    m.scale.set(s, s * (0.6 + wr2() * 0.6), s);
    under.add(m);
  }

  // fish school
  const fishGeo = new THREE.OctahedronGeometry(0.16, 0);
  fishGeo.scale(1.9, 0.62, 0.55);
  const fishMat = toon(0xdfe9e2, { emissive: 0x24524e, emissiveIntensity: 0.55, spec: 0.3, shine: 50, rim: 0.2 });
  const FISH_N = 26;
  const fish = new THREE.InstancedMesh(fishGeo, fishMat, FISH_N);
  fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fish.frustumCulled = false;
  under.add(fish);
  WATER.fish = fish;
  WATER.fishData = [];
  const fr = mulberry32(311);
  for (let i = 0; i < FISH_N; i++) {
    WATER.fishData.push({
      a: fr() * TAU, r: 1.2 + fr() * 2.6, y: -4.6 + fr() * 1.5,
      s: 0.55 + fr() * 0.7, sp: 0.25 + fr() * 0.3, ph: fr() * TAU
    });
  }

  // puddles
  const pudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: {
      uTime: { value: 0 },
      tReflect: { value: pudRT.texture },
      uTexMat: { value: WATER.pudTexMat },
      uSky: { value: new THREE.Color(0xe4f2f3) },
      uRain: { value: 0.6 },
      fogColor: { value: new THREE.Color(0xdceff1) },
      fogDensity: { value: 0.0042 }
    },
    vertexShader: `
      uniform mat4 uTexMat;
      varying vec2 vUv; varying vec3 vW; varying vec4 vRefl;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        vRefl = uTexMat * wp;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uRain;
      uniform sampler2D tReflect;
      uniform vec3 uSky;
      varying vec2 vUv; varying vec3 vW; varying vec4 vRefl;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec2 c = vUv - 0.5;
        float ang = atan(c.y, c.x);
        float wob = 0.02 * sin(ang * 5.0 + 1.3) + 0.014 * sin(ang * 8.0 - 2.1);
        float rad = length(c) + wob;
        float a = smoothstep(0.49, 0.40, rad) * 0.86;
        if (a < 0.01) discard;
        vec2 rp = vW.xz * 4.0;
        vec2 cell = floor(rp);
        vec2 f = fract(rp) - 0.5;
        float hs = hash(cell);
        vec2 off = vec2(hash(cell + 2.1), hash(cell + 5.3)) - 0.5;
        float ph = fract(uTime * 0.5 + hs);
        float dd = length(f - off * 0.5);
        float ring = sin(dd * 40.0 - ph * 22.0) * exp(-dd * 8.0) * (1.0 - ph) * uRain;
        vec2 ruv = vRefl.xy / max(vRefl.w, 0.0001);
        ruv += (f - off * 0.4) * ring * 0.02;
        vec3 refl = texture2D(tReflect, ruv).rgb;
        refl = floor(refl * 5.0 + 0.5) / 5.0;
        refl = mix(refl, uSky, 0.10);
        vec3 col = refl * 0.92 + vec3(0.03, 0.05, 0.05);
        col += vec3(0.8, 0.9, 0.85) * max(ring, 0.0) * 0.10;
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`
  });
  WATER.pudMat = pudMat;

  const pudGeo = new THREE.CircleGeometry(1, 30);
  const pr = mulberry32(313);
  const pudPos = [
    [-2.2, 9.6, 1.9, 1.2], [-15.8, 12.4, 1.5, 1.0], [-4.0, 15.6, 1.7, 1.1],
    [3.6, 11.2, 1.2, 0.8], [-10.5, 6.4, 1.1, 0.7], [5.8, 18.8, 1.4, 0.9]
  ];
  WATER.puddles = [];
  pudPos.forEach(p => {
    const m = new THREE.Mesh(pudGeo, pudMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = pr() * TAU;
    m.scale.set(p[2] * (0.8 + pr() * 0.4), p[3] * (0.8 + pr() * 0.4), 1);
    m.position.set(p[0], WATER.pudPlaneY, p[1]);
    m.renderOrder = 4;
    scene.add(m);
    WATER.puddles.push(m);
  });

  return WATER;
}

const _rcDir = new THREE.Vector3();
const _rcTarget = new THREE.Vector3();
function renderPlanarReflection(renderer, scene, camera, R, hideList) {
  const rc = R.cam;
  const p = camera.position;
  rc.position.set(p.x, 2 * R.planeY - p.y, p.z);
  _rcDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _rcDir.y = -_rcDir.y;
  rc.up.set(0, -1, 0);
  _rcTarget.copy(rc.position).add(_rcDir);
  rc.lookAt(_rcTarget);
  rc.projectionMatrix.copy(camera.projectionMatrix);
  rc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  rc.updateMatrixWorld(true);
  rc.matrixWorldInverse.copy(rc.matrixWorld).invert();
  R.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  R.texMat.multiply(rc.projectionMatrix);
  R.texMat.multiply(rc.matrixWorldInverse);

  const states = [];
  hideList.forEach(o => { if (o && o.visible) { o.visible = false; states.push(o); } });
  const oldClip = renderer.clippingPlanes;
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -R.planeY + 0.002)];
  const oldTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(R.rt);
  renderer.setClearColor(0xdceff1, 1);
  renderer.clear();
  renderer.render(scene, rc);
  renderer.setRenderTarget(oldTarget);
  renderer.clippingPlanes = oldClip;
  states.forEach(o => { o.visible = true; });
}

function updateWater(t, rain, wind) {
  WATER.mat.uniforms.uTime.value = t;
  WATER.mat.uniforms.uRain.value = rain;
  WATER.mat.uniforms.uWind.value = wind;
  WATER.mat.uniforms.uCloud.value = SKY ? (SKY.sun.intensity / 1.6) : 1;
  WATER.wallMat.uniforms.uTime.value = t;
  WATER.pudMat.uniforms.uTime.value = t;
  WATER.pudMat.uniforms.uRain.value = rain;
  WATER.weedMat.uniforms.uTime.value = t;
  WATER.causticMat.opacity = 0.22 + 0.10 * Math.sin(t * 0.7);
  if (TEX.caustic) {
    TEX.caustic.offset.x = (t * 0.010) % 1;
    TEX.caustic.offset.y = (t * 0.006) % 1;
  }
  if (BASE.foams) {
    BASE.foams.forEach(f => {
      const k = 0.5 + 0.5 * Math.sin(t * 0.9 + (f.userData.phase || 0));
      f.material.opacity = 0.22 + 0.42 * k;
      f.scale.setScalar(0.85 + 0.28 * k);
    });
  }

  // fish
  const camPos = CAMERA ? CAMERA.position : null;
  let flee = 0;
  if (camPos) {
    const d = Math.hypot(camPos.x - 17.0, camPos.y + 3.9, camPos.z - 6.0);
    flee = 1 - smoothstep(8, 26, d);
  }
  const dummy = new THREE.Object3D();
  const center = new THREE.Vector3(17.0 + Math.sin(t * 0.05) * 0.8, -3.9, 6.0 + Math.cos(t * 0.04) * 0.9);
  WATER.fishData.forEach((f, i) => {
    const ang = f.a + t * f.sp;
    const rad = f.r * (1 + flee * 0.9);
    const x = center.x + Math.cos(ang) * rad * 1.3;
    const z = center.z + Math.sin(ang) * rad * 0.8;
    const y = f.y + Math.sin(t * 0.9 + f.ph) * 0.12 + flee * 0.5;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, -ang + Math.PI / 2, Math.sin(t * 2 + f.ph) * 0.12);
    dummy.scale.setScalar(f.s * (1 + flee * 0.15));
    dummy.updateMatrix();
    WATER.fish.setMatrixAt(i, dummy.matrix);
  });
  WATER.fish.instanceMatrix.needsUpdate = true;
}