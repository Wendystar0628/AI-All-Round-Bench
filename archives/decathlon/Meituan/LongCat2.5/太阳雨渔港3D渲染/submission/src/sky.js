import * as THREE from 'three';
import { PAL, WATER_Y, mulberry32, hash1, clamp, lerp } from './common.js';

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const rng = mulberry32(88);
  for (let i = 0; i < 26; i++) {
    const x = 30 + rng() * 196, y = 34 + rng() * 60, r = 14 + rng() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.10 + rng() * 0.12})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSky(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);

  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(PAL.skyTop) },
      uHorizon: { value: new THREE.Color(PAL.skyHorizon) },
      uSunDir: { value: new THREE.Vector3(38, 46, -24).normalize() },
      uSunCol: { value: new THREE.Color(0xfff3d6) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol;
      varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
        float s = max(dot(normalize(vDir), uSunDir), 0.0);
        col += uSunCol * (pow(s, 220.0) * 0.85 + pow(s, 18.0) * 0.22);
        col = mix(col, uHorizon, smoothstep(0.0, -0.25, vDir.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 28, 18), skyMat);
  root.add(sky);

  const blobTex = softBlobTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: blobTex, color: 0xfff6dc, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunSprite.position.set(38, 46, -24).normalize().multiplyScalar(290);
  sunSprite.scale.set(90, 90, 1);
  root.add(sunSprite);

  const cloudTex = cloudTexture();
  const clouds = [];
  const rngC = mulberry32(4321);
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, depthWrite: false, fog: false,
      opacity: 0.30 + rngC() * 0.28,
    });
    const sp = new THREE.Sprite(mat);
    const s = 26 + rngC() * 34;
    sp.scale.set(s, s * (0.32 + rngC() * 0.14), 1);
    sp.position.set(-160 + rngC() * 320, 34 + rngC() * 22, -160 + rngC() * 320);
    sp.userData.speed = 0.9 + rngC() * 0.8;
    sp.userData.baseOp = mat.opacity;
    clouds.push(sp);
    root.add(sp);
  }

  const shadowMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.15 },
      uColor: { value: new THREE.Color(0x5a6a72) },
      uMap: { value: blobTex },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uOpacity; uniform vec3 uColor; uniform sampler2D uMap;
      varying vec2 vUv;
      void main(){
        float m = texture2D(uMap, vUv).a;
        gl_FragColor = vec4(uColor, m * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const shadowGeo = new THREE.PlaneGeometry(34, 26);
  const cloudShadow1 = new THREE.Mesh(shadowGeo, shadowMat);
  cloudShadow1.rotation.x = -Math.PI / 2;
  cloudShadow1.position.set(-6, 0.12, -20);
  cloudShadow1.renderOrder = 2;
  root.add(cloudShadow1);
  const cloudShadow2 = new THREE.Mesh(shadowGeo, shadowMat);
  cloudShadow2.rotation.x = -Math.PI / 2;
  cloudShadow2.position.set(16, WATER_Y + 0.06, 0);
  cloudShadow2.renderOrder = 3;
  root.add(cloudShadow2);

  const rainbowMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uArc: { value: Math.PI * 0.75 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      vec3 spectrum(float t){
        vec3 c = vec3(0.0);
        c += vec3(1.0, 0.25, 0.25) * smoothstep(0.0, 0.18, t) * (1.0 - smoothstep(0.30, 0.5, t));
        c += vec3(1.0, 0.85, 0.25) * smoothstep(0.18, 0.32, t) * (1.0 - smoothstep(0.42, 0.6, t));
        c += vec3(0.4, 1.0, 0.45) * smoothstep(0.32, 0.46, t) * (1.0 - smoothstep(0.55, 0.72, t));
        c += vec3(0.4, 0.7, 1.0) * smoothstep(0.46, 0.6, t) * (1.0 - smoothstep(0.68, 0.85, t));
        c += vec3(0.75, 0.5, 1.0) * smoothstep(0.6, 0.75, t) * (1.0 - smoothstep(0.8, 0.98, t));
        return c;
      }
      void main(){
        vec3 band = spectrum(clamp(vUv.y, 0.0, 1.0));
        float ends = smoothstep(0.0, 0.10, vUv.x) * (1.0 - smoothstep(0.90, 1.0, vUv.x));
        float lum = max(band.r, max(band.g, band.b));
        gl_FragColor = vec4(band, lum * ends * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const rainbow = new THREE.Mesh(new THREE.TorusGeometry(46, 1.5, 8, 48, Math.PI * 0.75), rainbowMat);
  rainbow.position.set(58, WATER_Y + 2, 58);
  rainbow.rotation.z = Math.PI / 2 - Math.PI * 0.375;
  rainbow.rotation.y = -Math.PI / 4;
  rainbow.renderOrder = 5;
  root.add(rainbow);

  const mistMat = new THREE.SpriteMaterial({
    map: blobTex, transparent: true, depthWrite: false, opacity: 0.16, fog: false,
  });
  const mists = [];
  const rngM = mulberry32(555);
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(mistMat.clone());
    sp.material.opacity = 0.10 + rngM() * 0.10;
    sp.scale.set(34 + rngM() * 30, 12 + rngM() * 10, 1);
    sp.position.set(-40 + rngM() * 90, 2 + rngM() * 8, 20 + rngM() * 16);
    sp.userData.ph = rngM() * 6.28;
    mists.push(sp);
    root.add(sp);
  }

  const distBoat = new THREE.Group();
  {
    const hullMat = new THREE.MeshBasicMaterial({ color: 0xaebfc6 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 1.5), hullMat);
    hull.position.y = 0.45;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.4, 4), hullMat);
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(2.8, 0.45, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.1), new THREE.MeshBasicMaterial({ color: 0xd8dde0 }));
    cabin.position.set(-0.6, 1.35, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), hullMat);
    mast.position.set(0.8, 2.2, 0);
    distBoat.add(hull, bow, cabin, mast);
    distBoat.scale.setScalar(0.9);
  }
  root.add(distBoat);

  ctx.updaters.push((t, dyn) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * 0.016;
      if (c.position.x > 190) c.position.x = -190;
      c.material.opacity = c.userData.baseOp * (0.6 + dyn.coverage * 0.7);
    }
    const sx = Math.sin(t * 0.045) * 9;
    cloudShadow1.position.x = -6 + sx * 0.6;
    cloudShadow1.position.z = -20 + Math.cos(t * 0.031) * 8;
    cloudShadow2.position.x = 16 + sx;
    cloudShadow2.position.z = Math.sin(t * 0.04) * 9;
    shadowMat.uniforms.uOpacity.value = dyn.coverage * 0.28;
    rainbowMat.uniforms.uOpacity.value = dyn.rainbow * 0.30;
    for (const m of mists) {
      m.position.x += Math.sin(t * 0.05 + m.userData.ph) * 0.004;
      m.material.opacity = (0.08 + 0.08 * dyn.coverage) + 0.04 * Math.sin(t * 0.1 + m.userData.ph);
    }
    const cyc = t % 58;
    if (cyc < 13) {
      distBoat.visible = true;
      distBoat.position.set(-30 + (cyc / 13) * 66, WATER_Y, 29.6);
    } else {
      distBoat.visible = false;
    }
  });
}
