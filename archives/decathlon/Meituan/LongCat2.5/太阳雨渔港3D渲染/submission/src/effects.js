import * as THREE from 'three';
import {
  PAL, WATER_Y, QUAY_Y, mulberry32, hash1, hash2, clamp, lerp, GLSL_NOISE,
} from './common.js';

export function computeDyn(t) {
  let r = 0.50 + 0.30 * Math.sin(t * 0.10 + 1.3) + 0.16 * Math.sin(t * 0.031 + 0.4);
  const rain = clamp(r, 0.10, 0.95);
  let c = 0.22 + 0.18 * Math.sin(t * 0.06 + 0.8) + 0.10 * Math.sin(t * 0.017 + 2.2);
  const pd = (((t % 150) + 150) % 150) / 150;
  c += 0.52 * Math.exp(-Math.pow((pd - 0.5) * 9, 2));
  const coverage = clamp(c, 0.05, 0.92);
  const dark = clamp((coverage - 0.74) / 0.12, 0, 1);
  const rainbow = clamp((0.33 - rain) / 0.09, 0, 1);
  const pulses = [];
  const period = 30;
  const k0 = Math.floor((t - 40) / period);
  for (let k = k0; k < k0 + 4; k++) {
    const t0 = 12 + k * period + (hash1(k * 3 + 1) - 0.5) * 8;
    const amp = 0.55 + 0.45 * hash1(k * 7 + 2);
    pulses.push({ t0, amp });
  }
  const gustAt = (x) => {
    let s = 0;
    for (const p of pulses) {
      const dtg = t - p.t0 - (34 - x) * 0.045;
      s += p.amp * Math.exp(-Math.pow(dtg / 3.2, 2));
    }
    return s;
  };
  return {
    t, rain, coverage, dark, rainbow,
    gustAt, gustGlobal: gustAt(34),
    swell: Math.sin(t * 0.9) * 0.5 + Math.sin(t * 0.53 + 1) * 0.5,
  };
}

function causticTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(777);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const x = rng() * 256, y = rng() * 256, r = 8 + rng() * 26;
    g.strokeStyle = `rgba(255,250,230,${0.10 + rng() * 0.16})`;
    g.lineWidth = 1.5 + rng() * 2.5;
    g.beginPath();
    g.arc(x, y, r, rng() * 6.28, rng() * 6.28 + 1.5 + rng() * 2.5);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const x = rng() * 256, y = rng() * 256, r = 3 + rng() * 8;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,246,220,${0.15 + rng() * 0.2})`);
    gr.addColorStop(1, 'rgba(255,246,220,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildEffects(ctx) {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const E = {};
  ctx.effects = E;
  ctx.shafts = [];
  const causticTex = causticTexture();

  function makeShaft(rTop, rBot, h, color = 0xffe9bf) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 14, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uIntensity; uniform float uTime;
        varying vec2 vUv;
        ${GLSL_NOISE}
        void main(){
          float vert = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65*vUv.y);
          float n = vn2(vec2(vUv.x*6.0, vUv.y*3.0 - uTime*0.35));
          float a = vert * (0.5 + n*0.7) * uIntensity;
          gl_FragColor = vec4(uColor, a*0.4);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 6;
    m.userData.mat = mat;
    ctx.shafts.push(m);
    return m;
  }
  E.makeShaft = makeShaft;

  function makeCaustic(w, d, strength = 0.5) {
    const tex = causticTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, w / 6), Math.max(1, d / 6));
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: strength,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.renderOrder = 5;
    m.rotation.x = -Math.PI / 2;
    m.userData.tex = tex;
    m.userData.strength = strength;
    return m;
  }
  E.makeCaustic = makeCaustic;

  function makeRope(points, radius, dryColor, wetColor, segments = 48) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, segments, radius, 6, false);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const dry = new THREE.Color(dryColor);
    const wet = new THREE.Color(wetColor);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = clamp((WATER_Y + 0.12 - y) / 0.5, 0, 1);
      tmp.copy(dry).lerp(wet, k);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshToonMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }
  E.makeRope = makeRope;

  const rainGeo = new THREE.InstancedBufferGeometry();
  rainGeo.index = null;
  const quad = new THREE.PlaneGeometry(1, 1);
  rainGeo.attributes.position = quad.attributes.position;
  rainGeo.attributes.uv = quad.attributes.uv;
  const RAIN_N = 900;
  const seeds = new Float32Array(RAIN_N * 4);
  const rngRain = mulberry32(1234);
  for (let i = 0; i < RAIN_N * 4; i++) seeds[i] = rngRain();
  rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  rainGeo.instanceCount = RAIN_N;
  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRain: { value: 0.5 },
      uGust: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      attribute vec4 aSeed;
      uniform float uTime; uniform float uRain; uniform float uGust;
      uniform vec3 uCamPos;
      varying float vAlpha;
      void main(){
        float speed = 11.0 + aSeed.w * 5.0;
        float range = 34.0;
        float y0 = 26.0;
        float cyc = range / speed;
        float ph = fract(uTime / cyc + aSeed.x * 7.13);
        float y = y0 - ph * range;
        float slant = 0.42 + uGust * 0.9;
        float x = (aSeed.y * 2.0 - 1.0) * 33.0 + slant * (y0 - y) * 0.6;
        float z = (aSeed.z * 2.0 - 1.0) * 33.0 + (y0 - y) * 0.18;
        vec3 vel = normalize(vec3(slant * 0.6, -speed, 0.18));
        vec3 center = vec3(x, y, z);
        vec3 right = normalize(cross(vel, normalize(uCamPos - center)));
        float vis = step(aSeed.x * 0.92, uRain);
        float len = 0.55 + aSeed.w * 0.5;
        vec3 p = center + right * position.x * 0.018 * vis + vel * position.y * len * vis;
        vAlpha = vis * (0.35 + 0.4 * aSeed.w) * smoothstep(0.0, 0.06, ph) * smoothstep(1.0, 0.94, ph);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main(){ gl_FragColor = vec4(1.0, 0.94, 0.78, vAlpha); }`,
    transparent: true,
    depthWrite: false,
  });
  const rain = new THREE.Mesh(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.renderOrder = 7;
  root.add(rain);

  function makeRipples(count, spots, maxR, alpha, tint) {
    const geo = new THREE.InstancedBufferGeometry();
    const ring = new THREE.RingGeometry(0.72, 1.0, 20);
    geo.attributes.position = ring.attributes.position;
    geo.attributes.uv = ring.attributes.uv;
    geo.index = ring.index;
    const data = new Float32Array(count * 4);
    const rng = mulberry32(count * 31 + 7);
    for (let i = 0; i < count; i++) {
      const s = spots[Math.floor(rng() * spots.length)];
      data[i * 4] = s.x + (rng() - 0.5) * s.rx;
      data[i * 4 + 1] = s.z + (rng() - 0.5) * s.rz;
      data[i * 4 + 2] = rng() * 100;
      data[i * 4 + 3] = 0.8 + rng() * 1.4;
    }
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uRain: { value: 0.5 },
        uMaxR: { value: maxR }, uAlpha: { value: alpha }, uTint: { value: new THREE.Color(tint) },
      },
      vertexShader: `
        attribute vec4 aData;
        uniform float uTime; uniform float uRain; uniform float uMaxR;
        varying float vA;
        void main(){
          float age = fract((uTime + aData.z) / aData.w);
          float vis = step(aData.z * 0.13, uRain);
          float sc = mix(0.12, uMaxR, pow(age, 0.55)) * vis;
          vA = pow(1.0 - age, 1.6) * vis;
          vec3 p = position * sc + vec3(aData.x, 0.0, aData.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uAlpha; uniform vec3 uTint;
        varying float vA;
        void main(){ gl_FragColor = vec4(uTint, vA * uAlpha); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 4;
    m.frustumCulled = false;
    return m;
  }

  const waterSpots = [];
  {
    const rng = mulberry32(999);
    let guard = 0;
    while (waterSpots.length < 48 && guard++ < 500) {
      const x = 0.8 + rng() * 30.4, z = -31 + rng() * 62;
      if (x < 21 && z > -24.5 && z < -17.5) continue;
      if (x > 19.5 && x < 28 && z > -24.5 && z < -17.5) continue;
      waterSpots.push({ x, z, rx: 6, rz: 8 });
    }
  }
  const waterRipples = makeRipples(420, waterSpots, 1.15, 0.4, 0xe8f4ee);
  waterRipples.position.y = WATER_Y + 0.03;
  root.add(waterRipples);

  const puddleSpots = [
    { x: -3.2, z: -26.5, rx: 1.5, rz: 1.0 }, { x: -2.3, z: -14.8, rx: 1.9, rz: 1.2 },
    { x: -6.2, z: -2.2, rx: 1.1, rz: 0.8 }, { x: -3.6, z: 6.2, rx: 1.7, rz: 1.1 },
    { x: -1.9, z: -21.5, rx: 0.9, rz: 0.7 }, { x: -8.5, z: 12.5, rx: 1.3, rz: 0.9 },
  ];
  const puddleRipples = makeRipples(70, puddleSpots, 0.42, 0.5, 0xf4faf6);
  puddleRipples.position.y = QUAY_Y + 0.05;
  root.add(puddleRipples);

  const foamSpots = [];
  for (const s of ctx.tetraSpots || []) foamSpots.push({ x: s.x, z: s.z, s: 0.8 + hash2(s.x, s.z) * 0.7 });
  for (let i = 0; i < 14; i++) foamSpots.push({ x: 2 + i * 2.1, z: -24.4 + hash2(i, 3) * 0.5, s: 0.55 });
  for (let i = 0; i < 10; i++) foamSpots.push({ x: 0.6 + hash2(i, 5) * 0.5, z: -30 + i * 4.4, s: 0.5 });
  const FOAM_N = 260;
  const foamGeo = new THREE.InstancedBufferGeometry();
  const fcircle = new THREE.CircleGeometry(0.5, 10);
  foamGeo.attributes.position = fcircle.attributes.position;
  foamGeo.attributes.uv = fcircle.attributes.uv;
  foamGeo.index = fcircle.index;
  const foamDataA = new Float32Array(FOAM_N * 4);
  const foamDataB = new Float32Array(FOAM_N);
  const rngF = mulberry32(5150);
  for (let i = 0; i < FOAM_N; i++) {
    const s = foamSpots[i % foamSpots.length];
    foamDataA[i * 4] = s.x + (rngF() - 0.5) * 2.2;
    foamDataA[i * 4 + 1] = s.z + (rngF() - 0.5) * 2.2;
    foamDataA[i * 4 + 2] = s.s * (0.6 + rngF() * 0.9);
    foamDataA[i * 4 + 3] = rngF() * 100;
    foamDataB[i] = 0.5 + rngF() * 1.0;
  }
  foamGeo.setAttribute('aData4', new THREE.InstancedBufferAttribute(foamDataA, 4));
  foamGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(foamDataB, 1));
  foamGeo.instanceCount = FOAM_N;
  const foamMatReal = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uGust: { value: 0 },
      uWakePos: { value: new THREE.Vector3(0, -50, 0) },
      uWakeStr: { value: 0 },
      uWaterY: { value: WATER_Y },
    },
    vertexShader: `
      attribute vec4 aData4;
      attribute float aKind;
      uniform float uTime; uniform float uGust; uniform float uWaterY;
      uniform vec3 uWakePos; uniform float uWakeStr;
      varying float vA;
      void main(){
        vec3 p = position * aData4.z + vec3(aData4.x, 0.0, aData4.y);
        p.y = uWaterY + 0.05;
        float ph = fract((uTime + aKind) / (aKind * 0.4 + 1.0));
        float pulse = 0.5 + 0.5 * sin(uTime * (0.6 + aKind * 0.13) + aKind * 3.0);
        float boost = 0.35 + uGust * 1.1;
        float dw = distance(p.xz, uWakePos.xz);
        boost += uWakeStr * exp(-dw*dw/7.0) * (0.6 + 0.4*sin(uTime*3.0 + dw*2.0));
        vA = pulse * boost;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        float a = clamp(vA, 0.0, 1.0) * 0.55;
        gl_FragColor = vec4(0.95, 0.99, 0.98, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const foam = new THREE.Mesh(foamGeo, foamMatReal);
  foam.rotation.x = -Math.PI / 2;
  foam.renderOrder = 4;
  foam.frustumCulled = false;
  root.add(foam);

const drips = [];
  const dripGeo = new THREE.SphereGeometry(0.045, 6, 5);
  const dripMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.8 });
  function addDrip(getPos, interval, spread = 0.1, floorY = WATER_Y) {
    const pool = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(dripGeo, dripMat);
      m.visible = false;
      root.add(m);
      pool.push(m);
    }
    drips.push({ getPos, interval, spread, floorY, pool, next: 0 });
  }
  E.addDrip = addDrip;

  ctx.updaters.push((t, dyn) => {
    rainMat.uniforms.uTime.value = t;
    rainMat.uniforms.uRain.value = dyn.rain;
    rainMat.uniforms.uGust.value = dyn.gustGlobal;
    rainMat.uniforms.uCamPos.value.copy(ctx.camera.position);
    waterRipples.material.uniforms.uTime.value = t;
    waterRipples.material.uniforms.uRain.value = dyn.rain;
    puddleRipples.material.uniforms.uTime.value = t;
    puddleRipples.material.uniforms.uRain.value = dyn.rain * 0.8;
    foamMatReal.uniforms.uTime.value = t;
    foamMatReal.uniforms.uGust.value = dyn.gustGlobal;
    const wk = ctx.dyn.wake || { px: 0, pz: -60, str: 0 };
    foamMatReal.uniforms.uWakePos.value.set(wk.px, 0, wk.pz);
    foamMatReal.uniforms.uWakeStr.value = wk.str;
    for (const d of drips) {
      if (t >= d.next) {
        d.next = t + d.interval * (0.7 + hash1(Math.floor(t * 7 + d.interval)) * 0.6);
        const m = d.pool.find(p => !p.visible);
        if (m) {
          const p = d.getPos(t);
          m.position.set(p.x + (hash1(Math.floor(t * 13)) - 0.5) * d.spread, p.y, p.z + (hash1(Math.floor(t * 17)) - 0.5) * d.spread);
          m.visible = true;
          m.userData.t0 = t;
          m.userData.p0 = m.position.clone();
        }
      }
      for (const m of d.pool) {
        if (!m.visible) continue;
        const dt = t - m.userData.t0;
        m.position.y = m.userData.p0.y - 4.9 * dt * dt;
        if (m.position.y < d.floorY - 0.06 || dt > 1.6) m.visible = false;
      }
    }
    for (const s of ctx.shafts) {
      s.userData.mat.uniforms.uTime.value = t;
      s.userData.mat.uniforms.uIntensity.value = (1 - dyn.coverage * 0.85) * (0.55 + dyn.gustGlobal * 0.2);
    }
  });
}
