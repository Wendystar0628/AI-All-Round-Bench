// ---------- sky, sun, clouds, rainbow ----------
const SKY = {};

function initSky(scene) {
  const sunDir = new THREE.Vector3(-0.38, 0.66, 0.50).normalize();
  SKY.sunDir = sunDir;

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: sunDir.clone() },
      uZenith: { value: new THREE.Color(0x8ecfe6) },
      uMid: { value: new THREE.Color(0xc2e7f1) },
      uHorizon: { value: new THREE.Color(0xe9f5f3) },
      uSunColor: { value: new THREE.Color(0xfff1cf) },
      uCloud: { value: 0.55 }
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSun, uZenith, uMid, uHorizon, uSunColor;
      uniform float uCloud;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
      }
      float fbm(vec2 p){
        float v=0.0, a=0.5;
        for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; }
        return v;
      }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.26, h));
        col = mix(col, uZenith, smoothstep(0.10, 0.62, h));
        // sun halo
        float sd = max(dot(d, uSun), 0.0);
        col += uSunColor * pow(sd, 8.0) * 0.22;
        col += uSunColor * pow(sd, 90.0) * 0.35;
        // thin clouds, projected on a virtual plane
        vec2 cp = d.xz / max(d.y + 0.12, 0.05);
        cp = cp * 1.25 + vec2(uTime * 0.0045, uTime * 0.0016);
        float c = fbm(cp * 1.1 + 3.7);
        c += 0.5 * fbm(cp * 2.3 - 1.3);
        float cloudMask = smoothstep(0.55, 0.95, c) * smoothstep(0.015, 0.22, d.y) * uCloud;
        vec3 cloudCol = mix(vec3(0.90,0.95,0.97), vec3(1.0,0.995,0.97), pow(sd,3.0));
        cloudCol = mix(cloudCol, vec3(0.86,0.92,0.94), smoothstep(0.2, 0.8, fbm(cp * 0.7 + 9.1)) * 0.25);
        col = mix(col, cloudCol, clamp(cloudMask, 0.0, 0.92));
        // warm sun-side tint
        col += vec3(0.10,0.075,0.02) * pow(sd, 4.0) * (1.0 - cloudMask);
        // soft studio backdrop below the horizon (the diorama floats in a pale sky)
        float b = smoothstep(0.0, -0.62, d.y);
        vec3 low = mix(vec3(0.90,0.955,0.955), vec3(0.66,0.83,0.885), b);
        low += vec3(0.05,0.035,0.0) * pow(sd, 6.0) * (1.0 - b);
        col = mix(col, low, smoothstep(0.035, -0.10, d.y));
        // horizon haze
        col = mix(col, vec3(0.93,0.965,0.96), smoothstep(0.10, 0.0, d.y) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 40, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);
  SKY.mesh = sky;
  SKY.mat = skyMat;

  // sun glow sprite
  const sunSprite = makeGlow(0xfff3cf, 42, 0.38);
  sunSprite.position.copy(sunDir).multiplyScalar(240);
  scene.add(sunSprite);
  SKY.sunSprite = sunSprite;

  // lights
  const hemi = new THREE.HemisphereLight(0xe2f4fb, 0x5f7d7a, 0.62);
  scene.add(hemi);
  SKY.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xfff8ec, 1.42);
  sun.position.copy(sunDir).multiplyScalar(70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3.2;
  scene.add(sun);
  scene.add(sun.target);
  SKY.sun = sun;

  const fill = new THREE.DirectionalLight(0xc6e6f2, 0.18);
  fill.position.set(-36, 26, -34);
  scene.add(fill);
  SKY.fill = fill;

  const bounce = new THREE.DirectionalLight(0xfff4de, 0.08);
  bounce.position.set(-10, -18, 26);
  scene.add(bounce);
  SKY.bounce = bounce;

  // cloud shadow caster (invisible in colour pass)
  const cloudMat = new THREE.MeshBasicMaterial({
    map: TEX.cloud, transparent: true, alphaTest: 0.42,
    colorWrite: false, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const cloudGeo = new THREE.PlaneGeometry(120, 120);
  const cloudPlane = new THREE.Mesh(cloudGeo, cloudMat);
  cloudPlane.rotation.x = -Math.PI / 2;
  cloudPlane.position.y = 33;
  cloudPlane.castShadow = true;
  cloudPlane.receiveShadow = false;
  cloudPlane.renderOrder = -50;
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: TEX.cloud, alphaTest: 0.42, side: THREE.DoubleSide
  });
  cloudPlane.customDepthMaterial = depthMat;
  scene.add(cloudPlane);
  SKY.cloudPlane = cloudPlane;
  TEX.cloud.wrapS = TEX.cloud.wrapT = THREE.RepeatWrapping;

  // faint rainbow
  const rbMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uOpacity;
      vec3 hue(float h){
        return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
      }
      void main(){
        vec2 p = vUv - vec2(0.5, -0.08);
        float r = length(p * vec2(1.0, 1.25));
        float band = smoothstep(0.335, 0.345, r) * (1.0 - smoothstep(0.445, 0.455, r));
        float t = (r - 0.335) / 0.12;
        vec3 col = hue(0.78 - t * 0.78);
        float a = band * uOpacity * smoothstep(0.02, 0.25, vUv.y);
        gl_FragColor = vec4(col, a * 0.55);
      }`
  });
  const rb = new THREE.Mesh(new THREE.PlaneGeometry(230, 130), rbMat);
  rb.position.set(-6, 12, -135);
  rb.renderOrder = 5;
  scene.add(rb);
  SKY.rainbow = rb;
  SKY.rainbowMat = rbMat;

  // low drifting mist over the far water
  SKY.mist = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.cloud, color: 0xffffff, transparent: true, opacity: 0.09,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: true
    }));
    m.scale.set(18 + i * 3, 4.2, 1);
    m.position.set(-9 + i * 9, 1.4, -20.4 + (i % 2) * 1.2);
    scene.add(m);
    SKY.mist.push({ s: m, x0: m.position.x, phase: i * 2.1 });
  }

  // thin high cloud streaks (extra depth)
  const streakMat = new THREE.MeshBasicMaterial({
    map: TEX.cloud, transparent: true, opacity: 0.10, depthWrite: false,
    color: 0xffffff, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  const streaks = new THREE.Mesh(new THREE.PlaneGeometry(260, 70), streakMat);
  streaks.position.set(0, 70, -120);
  streaks.rotation.x = -0.28;
  scene.add(streaks);
  SKY.streaks = streaks;

  return SKY;
}

function updateSky(t, wind, rain, cloudFactor) {
  SKY.mat.uniforms.uTime.value = t;
  SKY.mat.uniforms.uCloud.value = 0.40 + 0.22 * (1 - cloudFactor);
  TEX.cloud.offset.x = (t * 0.0035) % 1;
  TEX.cloud.offset.y = (t * 0.0011) % 1;
  SKY.streaks.position.x = Math.sin(t * 0.01) * 8;
  if (SKY.mist) {
    SKY.mist.forEach((m, i) => {
      m.s.position.x = m.x0 + Math.sin(t * 0.021 + m.phase) * 3.2;
      m.s.material.opacity = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.045 + m.phase));
    });
  }
  SKY.sun.intensity = 0.88 + 0.46 * cloudFactor;
  SKY.hemi.intensity = 0.60 + 0.10 * cloudFactor;
  SKY.fill.intensity = 0.16 + 0.08 * cloudFactor;
  SKY.bounce.intensity = 0.05 + 0.03 * cloudFactor;
  SKY.sunSprite.material.opacity = 0.20 + 0.20 * cloudFactor;
  const rb = smoothstep(0.62, 0.28, rain) * 0.9;
  SKY.rainbowMat.uniforms.uOpacity.value = rb;
  SKY.rainbow.visible = rb > 0.01;
}