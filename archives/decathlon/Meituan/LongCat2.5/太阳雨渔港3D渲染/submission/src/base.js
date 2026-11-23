import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PAL, QUAY_Y, WATER_Y, BASE_BOTTOM, HALF,
  toon, flat, addOutline, canvasTex, box, cyl, sph,
  mulberry32, hash2, hash1, GLSL_NOISE, shadowify, clamp, lerp,
} from './common.js';

function pavementTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d3d2c9'; g.fillRect(0, 0, w, h);
    const rng = mulberry32(11);
    for (let i = 0; i < 2600; i++) {
      const x = rng() * w, y = rng() * h, r = rng() * 1.8 + 0.4;
      g.fillStyle = `rgba(${90 + rng() * 60},${95 + rng() * 55},${88 + rng() * 50},${0.05 + rng() * 0.08})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 26; i++) {
      const x = rng() * w, y = rng() * h, r = 20 + rng() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(70,80,78,${0.05 + rng() * 0.07})`);
      gr.addColorStop(1, 'rgba(70,80,78,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(88,90,84,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.moveTo(2, 0); g.lineTo(2, h); g.stroke();
    g.strokeStyle = 'rgba(88,90,84,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h - 3); g.lineTo(w, h - 3); g.moveTo(w - 3, 0); g.lineTo(w - 3, h); g.stroke();
    g.strokeStyle = 'rgba(70,72,66,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      let x = rng() * w, y = rng() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
  }, { repeat: [1, 1] });
}

function wallTexture(seed = 21) {
  return canvasTex(512, 512, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = '#b9b7ad'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      const x = rng() * w, y = rng() * h;
      g.fillStyle = `rgba(${80 + rng() * 70},${82 + rng() * 66},${76 + rng() * 60},${0.05 + rng() * 0.09})`;
      g.fillRect(x, y, 2 + rng() * 3, 2 + rng() * 3);
    }
    g.strokeStyle = 'rgba(70,72,66,0.5)'; g.lineWidth = 2.5;
    const course = 46;
    for (let y = course; y < h; y += course) {
      g.beginPath(); g.moveTo(0, y + (rng() - 0.5) * 2); g.lineTo(w, y + (rng() - 0.5) * 2); g.stroke();
      for (let x = ((y / course) % 2) * 85; x < w; x += 170) {
        g.beginPath(); g.moveTo(x, y - course); g.lineTo(x, y); g.stroke();
      }
    }
    for (let i = 0; i < 40; i++) {
      const x = rng() * w, y0 = rng() * h * 0.5, len = 30 + rng() * 120;
      g.fillStyle = `rgba(58,66,62,${0.05 + rng() * 0.1})`;
      g.fillRect(x, y0, 2 + rng() * 7, len);
    }
    for (let i = 0; i < 8; i++) {
      const x = rng() * w, y0 = rng() * h * 0.4;
      g.fillStyle = `rgba(138,90,60,${0.06 + rng() * 0.08})`;
      g.fillRect(x, y0, 3 + rng() * 5, 20 + rng() * 60);
    }
    const waterV = 1 - (WATER_Y - BASE_BOTTOM) / (QUAY_Y - BASE_BOTTOM);
    const wy = (1 - waterV) * h;
    const grd = g.createLinearGradient(0, wy - 60, 0, h);
    grd.addColorStop(0, 'rgba(46,64,60,0)');
    grd.addColorStop(0.55, 'rgba(40,58,54,0.5)');
    grd.addColorStop(1, 'rgba(24,40,38,0.85)');
    g.fillStyle = grd; g.fillRect(0, wy - 60, w, h - (wy - 60));
    g.fillStyle = 'rgba(52,86,64,0.55)';
    g.fillRect(0, wy - 4, w, 8);
    g.fillStyle = 'rgba(230,238,234,0.18)';
    g.fillRect(0, wy - 26, w, 14);
    for (let i = 0; i < 26; i++) {
      const x = rng() * w;
      g.fillStyle = `rgba(30,46,42,${0.1 + rng() * 0.2})`;
      g.fillRect(x, wy - 2, 3 + rng() * 8, 6 + rng() * 20);
    }
  });
}

function seabedTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const rng = mulberry32(33);
    g.fillStyle = '#b3bda0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rng() * w, y = rng() * h, r = 1 + rng() * 3;
      const c = 120 + rng() * 60;
      g.fillStyle = `rgba(${c},${c - 8},${c - 30},${0.12 + rng() * 0.2})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 24; i++) {
      const x = rng() * w, y = rng() * h, r = 8 + rng() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(58,72,58,${0.10 + rng() * 0.12})`);
      gr.addColorStop(1, 'rgba(58,72,58,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, { repeat: [6, 6] });
}

function stripeTexture() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#e8b923'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2e2e2c';
    g.save();
    g.translate(w / 2, h / 2); g.rotate(-Math.PI / 5); g.translate(-w, -h);
    for (let x = 0; x < w * 3; x += 64) g.fillRect(x, -h, 32, h * 3);
    g.restore();
    const rng = mulberry32(44);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(120,110,95,${0.10 + rng() * 0.25})`;
      g.beginPath(); g.arc(rng() * w, rng() * h, 1 + rng() * 3.5, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(90,88,80,0.25)'; g.fillRect(0, h - 8, w, 8);
  }, { repeat: [8, 1] });
}

function tetrapodGeo() {
  const parts = [];
  const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => new THREE.Vector3(...v).normalize());
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of dirs) {
    const geo = new THREE.CylinderGeometry(0.16, 0.4, 1.9, 7);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3().copy(d).multiplyScalar(0.62),
      new THREE.Quaternion().setFromUnitVectors(up, d),
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    parts.push(geo);
  }
  const core = new THREE.SphereGeometry(0.46, 8, 6);
  parts.push(core);
  return mergeGeometries(parts);
}

function makeTetrapod(mat) {
  const m = new THREE.Mesh(tetrapodGeo(), mat);
  addOutline(m, 0.03, 0x2a3436);
  return m;
}

function grassTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(46,84,52,0.95)');
    grd.addColorStop(0.6, 'rgba(72,120,70,0.85)');
    grd.addColorStop(1, 'rgba(120,160,96,0.0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,60,38,0.5)'; g.lineWidth = 2;
    for (let x = 8; x < w; x += 12) {
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + 4, h * 0.5, x + (x > 32 ? 6 : -6), 8); g.stroke();
    }
  });
}

function netTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,110,90,0.9)'; g.lineWidth = 1.6;
    const s = 16;
    for (let y = -s; y < h + s; y += s) {
      for (let x = -s; x < w + s; x += s) {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + s, y + s);
        g.moveTo(x + s, y); g.lineTo(x, y + s);
        g.stroke();
      }
    }
  }, { repeat: [3, 2] });
}

export function buildBase(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const dyn = () => ctx.dyn;

  const reflGroup = new THREE.Group();
  reflGroup.scale.y = -1;
  reflGroup.position.y = 2 * WATER_Y;
  ctx.scene.add(reflGroup);
  ctx.reflectGroup = reflGroup;

  const _reflMats = new Map();
  ctx.renderer.localClippingEnabled = true;
  const reflClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), WATER_Y);
  function reflMat(color, alpha = 0.5) {
    const key = color + '_' + alpha;
    if (_reflMats.has(key)) return _reflMats.get(key);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: alpha },
        uWaterY: { value: WATER_Y },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWaterY;
        varying float vDepth;
        varying vec3 vWp;
        #include <clipping_planes_pars_vertex>
        ${GLSL_NOISE}
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float depth = clamp((uWaterY - wp.y) / 5.5, 0.0, 1.0);
          vec2 cell = floor(wp.xz / 1.5 + wp.y * 0.35);
          float r1 = h21(cell);
          float r2 = h21(cell + 31.7);
          float wob = sin(uTime * 0.6 + r1 * 6.2831) * 0.22 + sin(uTime*0.23 + r2*6.2831)*0.3;
          wp.x += (r1 - 0.5) * 1.1 * depth + wob * depth * 0.6;
          wp.z += (r2 - 0.5) * 1.1 * depth + cos(uTime * 0.5 + r2 * 6.2831) * depth * 0.5;
          vDepth = depth;
          vWp = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <clipping_planes_vertex>
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vDepth;
        varying vec3 vWp;
        #include <clipping_planes_pars_fragment>
        void main(){
          #include <clipping_planes_fragment>
          vec3 deep = vec3(0.11, 0.36, 0.40);
          vec3 col = mix(uColor, deep, vDepth * 0.55);
          float a = uAlpha * (1.0 - vDepth * 0.35);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      clippingPlanes: [reflClip],
    });
    _reflMats.set(key, m);
    return m;
  }
  ctx.reflMat = reflMat;
  ctx.addReflection = (mesh, color, alpha = 0.5) => {
    const r = new THREE.Mesh(mesh.geometry, reflMat(color, alpha));
    r.position.copy(mesh.position);
    r.quaternion.copy(mesh.quaternion);
    r.scale.copy(mesh.scale);
    r.castShadow = false; r.receiveShadow = false;
    r.renderOrder = 1;
    reflGroup.add(r);
    return r;
  };

  const paveTex = pavementTexture();
  const grad = (function () {
    const data = new Uint8Array([90, 140, 195, 255]);
    const t = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    return t;
  })();
  const matPave = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: paveTex });

  const wallTex = wallTexture();
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  const matQuayWall = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: wallTex });
  const matConcreteOut = toon(PAL.concreteDark);
  const matConcreteDark = toon(0x8f8e85);
  const matBottom = toon(0x4a4c48);

  const landMats = [matQuayWall, matConcreteOut, matPave, matBottom, matConcreteOut, matConcreteOut];
  const land = new THREE.Mesh(new THREE.BoxGeometry(32, 7.5, 64), landMats);
  land.position.set(-16, BASE_BOTTOM + 3.75, 0);
  land.receiveShadow = true;
  root.add(land);

  const armPaveTex = paveTex.clone();
  armPaveTex.repeat.set(2.5, 0.8);
  const matArmPave = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: armPaveTex });
  const armWallTex = wallTexture(77);
  armWallTex.wrapS = armWallTex.wrapT = THREE.RepeatWrapping;
  armWallTex.repeat.set(5, 1);
  const matArmWall = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: armWallTex });

  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(20, 7.5, 6),
    [matConcreteOut, matConcreteOut, matArmPave, matBottom, matArmWall, matConcreteDark]);
  arm1.position.set(10, BASE_BOTTOM + 3.75, -21);
  arm1.castShadow = true; arm1.receiveShadow = true;
  root.add(arm1);

  const bwGeo = new THREE.BufferGeometry();
  const bwV = [
    -3.5, -3, -2.3, 3.5, -3, -2.3, 3.5, -0.55, -1.15, -3.5, -0.55, -1.15,
    -3.5, -3, 2.3, 3.5, -3, 2.3, 3.5, -0.55, 1.15, -3.5, -0.55, 1.15,
  ];
  const bwIdx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  bwGeo.setAttribute('position', new THREE.Float32BufferAttribute(bwV, 3));
  bwGeo.setIndex(bwIdx);
  bwGeo.computeVertexNormals();
  const bwUv = [];
  for (let i = 0; i < bwV.length; i += 3) bwUv.push((bwV[i] + 3.5) / 7, (bwV[i + 1] + 3) / 2.5);
  bwGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bwUv, 2));
  const matBW = new THREE.MeshToonMaterial({ color: 0xb5b3a9, gradientMap: grad, map: wallTexture(99) });
  const breakwater = new THREE.Mesh(bwGeo, matBW);
  breakwater.position.set(23.2, 0, -21);
  breakwater.castShadow = true; breakwater.receiveShadow = true;
  root.add(breakwater);

  const lighthouse = new THREE.Group();
  const lhRockMat = toon(0x8a8d84);
  const rock = cyl(1.5, 1.9, 1.2, lhRockMat, 0, 0.1, 0, 9);
  lighthouse.add(rock);
  const lhWhite = toon(PAL.lighthouseWhite);
  const lhRed = toon(PAL.lighthouseRed);
  const lhBase = cyl(0.62, 0.78, 0.5, lhWhite, 0, 0.85, 0, 12);
  lighthouse.add(lhBase);
  const tower1 = cyl(0.42, 0.55, 1.5, lhRed, 0, 1.85, 0, 12);
  const tower2 = cyl(0.34, 0.44, 1.2, lhWhite, 0, 3.15, 0, 12);
  const tower3 = cyl(0.28, 0.36, 1.0, lhRed, 0, 4.2, 0, 12);
  lighthouse.add(tower1, tower2, tower3);
  const gallery = cyl(0.5, 0.5, 0.12, toon(0x3a4044), 0, 4.78, 0, 12);
  lighthouse.add(gallery);
  const lampRoom = cyl(0.3, 0.3, 0.5, new THREE.MeshPhongMaterial({
    color: 0xfff2cc, transparent: true, opacity: 0.55, shininess: 120,
    emissive: 0xffdf90, emissiveIntensity: 0.4,
  }), 0, 5.1, 0, 10);
  lighthouse.add(lampRoom);
  const lampCore = sph(0.16, new THREE.MeshBasicMaterial({ color: 0xffe9b0 }), 0, 5.1, 0, 8, 6);
  lighthouse.add(lampCore);
  const lhRoof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 10), lhRed);
  lhRoof.position.y = 5.6;
  lighthouse.add(lhRoof);
  const lhRail = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 6, 14), toon(0x3a4044));
  lhRail.rotation.x = Math.PI / 2;
  lhRail.position.y = 4.9;
  lighthouse.add(lhRail);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uIntensity: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uIntensity;
      varying vec2 vUv;
      void main(){
        float a = vUv.y * 0.4 * uIntensity;
        gl_FragColor = vec4(1.0, 0.9, 0.65, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(2.6, 14, 12, 1, true);
  beamGeo.rotateZ(Math.PI / 2);
  beamGeo.translate(7, 0, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, 5.1, 0);
  beam.renderOrder = 6;
  beam.frustumCulled = false;
  lighthouse.add(beam);
  lighthouse.position.set(25.6, -0.55, -21);
  shadowify(lighthouse);
  root.add(lighthouse);
  ctx.lighthouse = { group: lighthouse, beamMat, lampCore, beam };

  const stripeTex = stripeTexture();
  stripeTex.wrapS = THREE.RepeatWrapping;
  const matStripe = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: stripeTex });
  const curbLand = box(0.5, 0.32, 64, matStripe, -0.28, 0.16, 0);
  root.add(curbLand);
  const curbArmN = box(20, 0.28, 0.4, matStripe, 10, 0.14, -18.2);
  root.add(curbArmN);
  const curbArmS = box(20, 0.28, 0.4, matStripe, 10, 0.14, -23.8);
  root.add(curbArmS);

  const rimMat = toon(PAL.curb);
  const rimH = 0.55, rimT = 0.7;
  const rims = [
    box(rimT, rimH, 64, rimMat, -32 + rimT / 2, rimH / 2, 0),
    box(32 - 0.5, rimH, rimT, rimMat, -16 + 0.25, rimH / 2, 32 - rimT / 2),
    box(32 - 0.5, rimH, rimT, rimMat, -16 + 0.25, rimH / 2, -32 + rimT / 2),
  ];
  for (const r of rims) root.add(r);
  const rimWaterMat = toon(0xbfc4bd);
  const rimsW = [
    box(0.5, 0.5, 64, rimWaterMat, 32 - 0.25, WATER_Y + 0.25, 0),
    box(32, 0.5, 0.5, rimWaterMat, 16, WATER_Y + 0.25, 32 - 0.25),
    box(32, 0.5, 0.5, rimWaterMat, 16, WATER_Y + 0.25, -32 + 0.25),
  ];
  for (const r of rimsW) root.add(r);

  const plinth = box(66, 1.0, 66, toon(0x3c4042), 0, BASE_BOTTOM - 0.5, 0);
  root.add(plinth);

  const seaSkirtMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x2e7d88) },
      uShallow: { value: new THREE.Color(0x8fd0c6) },
      uGlint: { value: 0.5 },
      uHaze: { value: new THREE.Color(0xe4f0ee) },
    },
    vertexShader: `
      varying vec3 vWp;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uGlint; uniform vec3 uHaze;
      varying vec3 vWp;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vWp.xz;
        float n = vn2(p*0.06 + vec2(uTime*0.02, uTime*0.013));
        float b = floor(n*6.0)/6.0;
        vec3 col = mix(uDeep, uShallow, b);
        float g = h21(floor(p*1.5));
        float tw = step(0.988, g) * (0.5+0.5*sin(uTime*2.0+g*40.0));
        col += uGlint * tw * vec3(1.0,0.95,0.75);
        float dist = length(vWp.xz - cameraPosition.xz);
        float haze = smoothstep(60.0, 240.0, dist);
        col = mix(col, uHaze, haze);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const seaSkirt = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), seaSkirtMat);
  seaSkirt.name = 'seaSkirt';
  seaSkirt.rotation.x = -Math.PI / 2;
  seaSkirt.position.y = WATER_Y;
  root.add(seaSkirt);

  const waterGlassMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0xa8e2d8) },
      uDeep: { value: new THREE.Color(0x2f8a92) },
    },
    vertexShader: `
      varying vec3 vWp;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep;
      varying vec3 vWp;
      ${GLSL_NOISE}
      void main(){
        float depth = clamp((${-1.5} - vWp.y) / 6.0, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, depth);
        float band = sin(vWp.x*0.9 + uTime*0.7 + sin(vWp.z*0.8 + uTime*0.4)*1.2);
        col += vec3(0.06,0.10,0.10) * smoothstep(0.75, 1.0, band) * (1.0-depth);
        float n = vn2(vWp.xz*0.5 + uTime*0.05);
        col *= 0.94 + n*0.10;
        float a = mix(0.26, 0.60, depth);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const seabedTex = seabedTexture();
  const matSeabed = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, map: seabedTex });

  const waterBox = new THREE.Mesh(new THREE.BoxGeometry(32, 6, 64),
    [waterGlassMat, waterGlassMat, waterGlassMat, matSeabed, waterGlassMat, waterGlassMat]);
  waterBox.name = 'waterBox';
  waterBox.position.set(16, WATER_Y - 3.02, 0);
  waterBox.renderOrder = 2;
  root.add(waterBox);

  const underLight = new THREE.PointLight(0xa8dcd4, 130, 55, 1.6);
  underLight.position.set(16, -4.5, 0);
  root.add(underLight);

  const waterSurfMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0.5 },
      uCoverage: { value: 0.2 },
      uDeep: { value: new THREE.Color(PAL.waterDeep) },
      uMid: { value: new THREE.Color(PAL.waterSurface) },
      uLight: { value: new THREE.Color(PAL.waterLight) },
      uGlint: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWp;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform float uTime; uniform float uRain; uniform float uCoverage; uniform float uGlint;
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uLight;
      varying vec3 vWp;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vWp.xz;
        float n1 = vn2(p*0.33 + vec2(uTime*0.045, uTime*0.028));
        float n2 = vn2(p*0.85 - vec2(uTime*0.07, uTime*0.012));
        float b = floor(n1*5.0)/5.0;
        vec3 col = mix(uDeep, uMid, b);
        col = mix(col, uLight, step(0.70, n2)*0.28);
        float band = sin(p.x*0.8 + uTime*0.6 + sin(p.y*0.6)*1.5);
        col += vec3(0.05,0.09,0.09) * smoothstep(0.8, 1.0, band);
        float g = h21(floor(p*2.6));
        float tw = step(0.986 - uRain*0.012, g) * (0.5+0.5*sin(uTime*3.2+g*40.0));
        col += uGlint * tw * vec3(1.0,0.96,0.78);
        col *= (1.0 - uCoverage*0.22);
        gl_FragColor = vec4(col, 0.86);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const waterSurf = new THREE.Mesh(new THREE.PlaneGeometry(32, 64), waterSurfMat);
  waterSurf.name = 'waterSurf';
  waterSurf.rotation.x = -Math.PI / 2;
  waterSurf.position.set(16, WATER_Y, 0);
  waterSurf.renderOrder = 3;
  root.add(waterSurf);

  ctx.addReflection(new THREE.Mesh(new THREE.BoxGeometry(20, 2.2, 6)), 0x3f7f88, 0.42).position.set(10, 0.4, -21);
  ctx.addReflection(new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 3)), 0x4a8890, 0.4).position.set(23.2, 0.2, -21);
  const wallRefl = new THREE.Mesh(new THREE.PlaneGeometry(64, 1.5), reflMat(0x2f6f78, 0.5));
  wallRefl.rotation.y = -Math.PI / 2;
  wallRefl.position.set(0.05, WATER_Y - 0.75, 0);
  wallRefl.renderOrder = 1;
  reflGroup.add(wallRefl);

  const stepMat = new THREE.MeshToonMaterial({ color: 0xc9c8bf, gradientMap: grad, map: wallTexture(55) });
  for (let i = 0; i < 5; i++) {
    const top = -0.32 * i;
    const s = box(0.62, top - (-3.2), 4.2, stepMat, 0.31 + i * 0.62, (top - 3.2) / 2, -11.5);
    s.castShadow = true; s.receiveShadow = true;
    root.add(s);
  }

  const platMat = toon(PAL.concrete);
  const plat = box(3.4, 0.28, 4.2, platMat, 1.9, -0.95, -5.8);
  plat.castShadow = true; plat.receiveShadow = true;
  root.add(plat);
  const pileMat = toon(0x6b5a44);
  for (const dz of [-1.8, 1.8]) {
    const p = cyl(0.14, 0.16, 6.4, pileMat, 3.3, -4.0, -5.8 + dz, 8);
    root.add(p);
  }
  const platEdge = box(3.4, 0.1, 0.24, matStripe, 1.9, -0.78, -3.75);
  root.add(platEdge);

  const rampMat = new THREE.MeshToonMaterial({ color: 0xc6c5bc, gradientMap: grad, map: wallTexture(66) });
  const ramp = box(7.2, 0.5, 4.6, rampMat, 3.2, -1.05, 7);
  ramp.rotation.z = -0.30;
  ramp.castShadow = true; ramp.receiveShadow = true;
  root.add(ramp);
  for (const dz of [-1.9, 1.9]) {
    const rail = cyl(0.05, 0.05, 7.0, toon(PAL.ironBlack), 3.2, -0.4, 7 + dz, 6);
    rail.rotation.z = Math.PI / 2 - 0.30;
    root.add(rail);
  }

  const tetras = new THREE.Group();
  const tetraMat = toon(0xd8d8d0);
  const rngT = mulberry32(101);
  const spots = [
    [24.5, -27.5], [26.2, -29.2], [28.5, -27.0], [25.4, -30.2], [29.4, -29.6],
    [27.6, -24.8], [30.2, -26.2], [22.2, -30.4], [16.5, -30.6], [9.5, -30.9],
    [30.4, -21.0], [28.9, -19.4],
  ];
  for (const [sx, sz] of spots) {
    const t = makeTetrapod(tetraMat);
    t.position.set(sx + (rngT() - 0.5) * 0.8, WATER_Y - 0.5 - rngT() * 0.7, sz + (rngT() - 0.5) * 0.8);
    t.rotation.set(rngT() * 0.6, rngT() * Math.PI * 2, rngT() * 0.6);
    t.scale.setScalar(0.9 + rngT() * 0.5);
    tetras.add(t);
  }
  shadowify(tetras);
  root.add(tetras);
  ctx.tetraSpots = spots.map(([x, z]) => new THREE.Vector3(x, WATER_Y, z));

  const rockMat = toon(PAL.rock);
  const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const rocks = new THREE.Group();
  const rngR = mulberry32(202);
  for (let i = 0; i < 30; i++) {
    const x = 1 + rngR() * 30, z = -31 + rngR() * 62;
    if (x < 21 && z > -25 && z < -17) continue;
    if (x > 19 && x < 28 && z > -25 && z < -18) continue;
    const r = new THREE.Mesh(rockGeo, rockMat);
    r.position.set(x, BASE_BOTTOM + 0.6 + rngR() * 0.3, z);
    r.scale.set(0.5 + rngR() * 1.4, 0.4 + rngR() * 0.9, 0.5 + rngR() * 1.4);
    r.rotation.set(rngR() * 3, rngR() * 3, rngR() * 3);
    rocks.add(r);
  }
  shadowify(rocks, true, false);
  root.add(rocks);

  const tireMat = toon(0x26282a);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.24, 8, 18), tireMat);
  tire.position.set(5.5, BASE_BOTTOM + 0.5, -9);
  tire.rotation.x = Math.PI / 2 - 0.25;
  tire.rotation.z = 0.4;
  root.add(tire);

  const anchorMat = toon(0x5a5e60);
  const anchor = new THREE.Group();
  const shank = cyl(0.09, 0.09, 2.4, anchorMat, 0, 0, 0, 6);
  shank.rotation.z = Math.PI / 2 - 0.15;
  anchor.add(shank);
  const cross = cyl(0.07, 0.07, 1.1, anchorMat, -0.9, 0.5, 0, 6);
  cross.rotation.x = Math.PI / 2;
  anchor.add(cross);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), anchorMat);
  ring.position.set(1.2, 0.15, 0);
  anchor.add(ring);
  for (const s of [-1, 1]) {
    const fluke = box(0.8, 0.5, 0.08, anchorMat, 1.0, -0.15, s * 0.5);
    fluke.rotation.y = s * 0.5;
    fluke.rotation.z = 0.3;
    anchor.add(fluke);
  }
  anchor.position.set(12, BASE_BOTTOM + 0.35, 5);
  anchor.rotation.y = 0.7;
  shadowify(anchor);
  root.add(anchor);

  const linkGeo = new THREE.TorusGeometry(0.11, 0.035, 5, 8);
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(12.8, BASE_BOTTOM + 0.4, 4.6),
    new THREE.Vector3(10, BASE_BOTTOM + 0.35, 2.5),
    new THREE.Vector3(6, BASE_BOTTOM + 0.3, 0.5),
    new THREE.Vector3(2.5, BASE_BOTTOM + 0.6, -0.8),
    new THREE.Vector3(0.6, -3.2, -1.4),
    new THREE.Vector3(0.25, -0.8, -1.8),
  ]);
  const linkCount = 26;
  const linkGeos = [];
  const dummyL = new THREE.Object3D();
  for (let i = 0; i < linkCount; i++) {
    const u = i / (linkCount - 1);
    const p = chainCurve.getPoint(u);
    dummyL.position.copy(p);
    dummyL.rotation.set(i % 2 ? Math.PI / 2 : 0, i * 0.7, i % 2 ? 0.4 : 0);
    dummyL.updateMatrix();
    const g2 = linkGeo.clone();
    g2.applyMatrix4(dummyL.matrix);
    linkGeos.push(g2);
  }
  const chainMesh = new THREE.Mesh(mergeGeometries(linkGeos), anchorMat);
  root.add(chainMesh);

  const grassTex = grassTexture();
  const grassMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: grassTex } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        float sway = sin(uTime*0.8 + position.x*2.0 + position.y*1.2);
        p.x += sway * 0.12 * uv.y;
        p.z += cos(uTime*0.6 + position.y*2.0) * 0.08 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main(){ vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb, c.a*0.92); }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const grassSpots = [[3, -14], [5, 2], [8, 12], [14, -8], [18, 8], [24, 0], [27, 12], [12, 18], [6, 22], [20, 20]];
  const grassGroup = new THREE.Group();
  for (const [gx, gz] of grassSpots) {
    const blades = [];
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.PlaneGeometry(0.7, 1.3, 1, 4);
      blade.translate(0, 0.65, 0);
      blade.rotateY(i * Math.PI / 3);
      blades.push(blade);
    }
    const g3 = mergeGeometries(blades);
    const m = new THREE.Mesh(g3, grassMat);
    m.position.set(gx, BASE_BOTTOM + 0.35, gz);
    m.rotation.y = hash2(gx, gz) * 6.28;
    grassGroup.add(m);
  }
  root.add(grassGroup);

  const barnGeo = new THREE.SphereGeometry(0.1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const barnMat = toon(0xcfc9ba);
  const barnPos = [];
  const rngB = mulberry32(303);
  for (let i = 0; i < 240; i++) {
    const wall = rngB();
    if (wall < 0.62) {
      const z = -30 + rngB() * 42;
      const y = -1.2 - rngB() * 2.6;
      barnPos.push([0.12, y, z, rngB()]);
    } else if (wall < 0.86) {
      const x = 2 + rngB() * 17;
      const y = -1.2 - rngB() * 2.6;
      barnPos.push([x, y, -17.88, rngB()]);
    } else {
      const x = 20.5 + rngB() * 6;
      const z = -23 + rngB() * 4;
      barnPos.push([x, -1.2 - rngB() * 1.6, z, rngB()]);
    }
  }
  const barnacles = new THREE.InstancedMesh(barnGeo, barnMat, barnPos.length);
  const dummy = new THREE.Object3D();
  barnPos.forEach(([x, y, z, r], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(x < 0.5 ? Math.PI / 2 : 0, r * 6.28, z > -18 && x > 1 ? -Math.PI / 2 : 0);
    if (x < 0.5) dummy.rotation.set(0, 0, -Math.PI / 2);
    else if (z > -18 && x > 1) dummy.rotation.set(Math.PI / 2, 0, 0);
    else dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(0.6 + r * 0.9);
    dummy.updateMatrix();
    barnacles.setMatrixAt(i, dummy.matrix);
  });
  barnacles.instanceMatrix.needsUpdate = true;
  root.add(barnacles);

  const oysGeo = new THREE.SphereGeometry(0.13, 7, 5);
  const oysMat = toon(0xdfd8c8);
  const oysters = new THREE.InstancedMesh(oysGeo, oysMat, 70);
  const rngO = mulberry32(404);
  for (let i = 0; i < 70; i++) {
    const onWall = rngO() < 0.7;
    const x = onWall ? 0.16 : 2 + rngO() * 17;
    const z = onWall ? -28 + rngO() * 40 : -17.92;
    const y = -1.1 - rngO() * 1.8;
    dummy.position.set(x, y, z);
    dummy.rotation.set(onWall ? Math.PI / 2 : 0, rngO() * 6.28, rngO());
    dummy.scale.set(0.8 + rngO(), 0.5 + rngO() * 0.5, 0.7 + rngO() * 0.8);
    dummy.updateMatrix();
    oysters.setMatrixAt(i, dummy.matrix);
  }
  oysters.instanceMatrix.needsUpdate = true;
  root.add(oysters);

  const weedMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: grassTexture() } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      attribute float aPhase;
      void main(){
        vUv = uv;
        vec3 p = position;
        float sw = sin(uTime*0.9 + aPhase + uv.y*1.6) * 0.18 * uv.y;
        p.x += sw; p.z += sw*0.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main(){ vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb*0.8, c.a*0.85); }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const weedGeos = [];
  const rngW = mulberry32(505);
  const phases = [];
  for (let i = 0; i < 14; i++) {
    const onLand = i < 9;
    const x = onLand ? 0.1 : 1 + rngW() * 18;
    const z = onLand ? -27 + rngW() * 44 : -17.9;
    const top = -0.5 - rngW() * 1.2;
    const len = 0.9 + rngW() * 1.3;
    const wg = new THREE.PlaneGeometry(0.3, len, 1, 3);
    wg.translate(x, top - len / 2, z);
    wg.rotateY(rngW() * 0.6 - 0.3 + (onLand ? Math.PI / 2 : 0));
    weedGeos.push(wg);
    for (let v = 0; v < wg.attributes.position.count; v++) phases.push(hash1(i * 7 + v));
  }
  const weedGeo = mergeGeometries(weedGeos);
  weedGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  const weeds = new THREE.Mesh(weedGeo, weedMat);
  root.add(weeds);

  const puddleMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSky: { value: new THREE.Color(0xcfe8e6) },
      uDeep: { value: new THREE.Color(0x5f9aa2) },
      uGlint: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSky; uniform vec3 uDeep; uniform float uGlint;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main(){
        vec2 c = vUv - 0.5;
        float d = length(c * vec2(1.0, 1.25)) + (vn2(vUv*5.0)-0.5)*0.18;
        float mask = 1.0 - smoothstep(0.32, 0.46, d);
        float streak = vn2(vec2(vUv.x*3.0, vUv.y*40.0) + vec2(uTime*0.1, 0.0));
        vec3 col = mix(uDeep, uSky, 0.35 + streak*0.3);
        float glint = step(0.975, h21(floor(vUv*vec2(24.0,18.0)) + floor(uTime*2.0)*0.13));
        col += uGlint * glint * vec3(1.0,0.95,0.8) * 0.6;
        float drip = sin(d*40.0 - uTime*4.0)*0.5+0.5;
        col += vec3(0.06) * smoothstep(0.85, 1.0, drip) * mask;
        gl_FragColor = vec4(col, mask * 0.92);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const puddles = [
    [-3.2, -26.5, 1.7, 1.15], [-2.3, -14.8, 2.1, 1.35], [-6.2, -2.2, 1.3, 0.95],
    [-3.6, 6.2, 1.9, 1.25], [-1.9, -21.5, 1.0, 0.8], [-8.5, 12.5, 1.5, 1.0],
  ];
  const puddleMeshes = [];
  for (const [px, pz, rx, rz] of puddles) {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), puddleMat);
    pm.rotation.x = -Math.PI / 2;
    pm.position.set(px, 0.02, pz);
    pm.renderOrder = 2;
    root.add(pm);
    puddleMeshes.push(pm);
  }

  const sheenMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0.16 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vWp;
      void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vWp = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `
      uniform float uTime; uniform float uStrength;
      varying vec2 vUv; varying vec3 vWp;
      ${GLSL_NOISE}
      void main(){
        float n = vn2(vWp.xz*0.35 + vec2(uTime*0.02, 0.0));
        float n2 = vn2(vWp.xz*0.12 - vec2(0.0, uTime*0.015));
        float s = smoothstep(0.55, 0.95, n) * 0.5 + smoothstep(0.6, 1.0, n2)*0.5;
        vec3 col = vec3(0.92, 0.97, 0.98);
        gl_FragColor = vec4(col, s * uStrength);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(32, 64), sheenMat);
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(-16, 0.035, 0);
  sheen.renderOrder = 2;
  root.add(sheen);

  ctx.updaters.push((t, dyn) => {
    if (ctx.lighthouse) {
      ctx.lighthouse.beam.rotation.y = t * 1.4;
      ctx.lighthouse.beamMat.uniforms.uIntensity.value = ctx.dyn.dark * 0.9;
      const lk = ctx.dyn.dark;
      ctx.lighthouse.lampCore.material.color.setRGB(1, 0.85 + lk * 0.15, 0.6 + lk * 0.3);
      ctx.lighthouse.group.rotation.y = Math.sin(t * 0.1) * 0.01;
    }
    waterSurfMat.uniforms.uTime.value = t;
    waterSurfMat.uniforms.uRain.value = ctx.dyn.rain;
    waterSurfMat.uniforms.uCoverage.value = ctx.dyn.coverage;
    waterSurfMat.uniforms.uGlint.value = 0.45 + ctx.dyn.gustGlobal * 0.8;
    waterGlassMat.uniforms.uTime.value = t;
    seaSkirtMat.uniforms.uTime.value = t;
    seaSkirtMat.uniforms.uGlint.value = 0.4 + ctx.dyn.gustGlobal * 0.7;
    grassMat.uniforms.uTime.value = t;
    weedMat.uniforms.uTime.value = t;
    puddleMat.uniforms.uTime.value = t;
    puddleMat.uniforms.uGlint.value = 0.35 + ctx.dyn.gustGlobal * 0.4;
    sheenMat.uniforms.uTime.value = t;
    sheenMat.uniforms.uStrength.value = 0.12 + (1 - ctx.dyn.coverage) * 0.10;
    for (const m of _reflMats.values()) m.uniforms.uTime.value = t;
  });
}
