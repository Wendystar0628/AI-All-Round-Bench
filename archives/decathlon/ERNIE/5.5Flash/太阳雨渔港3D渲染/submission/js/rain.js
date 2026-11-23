// ---------- sun-shower rain, wind, drips ----------
const RAIN = { mesh: null, uniforms: null, intensity: 0.7, wind: 0.2 };

function windAt(t) {
  const period = 40;
  const p = ((t % period) + period) % period;
  const gust = smoothstep(26, 31, p) * (1 - smoothstep(35, 40, p));
  return 0.10 + 0.05 * Math.sin(t * 0.23) + 0.95 * gust;
}

function rainAt(t) {
  let r = 0.58 + 0.20 * Math.sin(t * 0.052 + 0.7) + 0.08 * Math.sin(t * 0.137 + 2.2);
  const lull = smoothstep(0.30, 0.9, Math.sin(t * 0.085 + 4.0));
  r *= 1 - 0.50 * lull;
  return clamp(r, 0.28, 0.92);
}

function cloudAt(t) {
  let c = 0.62 + 0.30 * Math.sin(t * 0.035 + 1.2) + 0.10 * Math.sin(t * 0.011);
  // occasional darker veil
  const dip = smoothstep(0.75, 0.98, Math.sin(t * 0.019 + 3.4));
  c *= 1 - 0.45 * dip;
  return clamp(c, 0.25, 1.0);
}

function initRain(scene) {
  const N = 3400;
  const pos = new Float32Array(N * 2 * 3);
  const base = new Float32Array(N * 2 * 3);
  const speed = new Float32Array(N * 2);
  const len = new Float32Array(N * 2);
  const corner = new Float32Array(N * 2);
  const r = mulberry32(1101);
  for (let i = 0; i < N; i++) {
    const x = -27 + r() * 54;
    const y = r() * 27;
    const z = -27 + r() * 54;
    const sp = 13 + r() * 9;
    const ln = 0.34 + r() * 0.48;
    for (let k = 0; k < 2; k++) {
      const idx = (i * 2 + k);
      base[idx * 3] = x; base[idx * 3 + 1] = y; base[idx * 3 + 2] = z;
      speed[idx] = sp;
      len[idx] = ln;
      corner[idx] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aLen', new THREE.BufferAttribute(len, 1));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.7 },
      uWind: { value: 0.2 },
      uColor: { value: new THREE.Color(0xffe9b8) },
      fogColor: { value: new THREE.Color(0xdceff1) },
      fogDensity: { value: 0.0042 }
    },
    vertexShader: `
      attribute vec3 aBase;
      attribute float aSpeed;
      attribute float aLen;
      attribute float aCorner;
      uniform float uTime, uWind;
      varying float vA;
      varying float vFogDepth;
      void main(){
        float y = mod(aBase.y - uTime * aSpeed, 27.0);
        vec3 p = aBase;
        p.y = y + aCorner * aLen;
        float slant = (0.10 + 0.22 * uWind);
        p.x += (27.0 - y) * slant * 0.55;
        p.z += (27.0 - y) * slant * 0.22;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        float nearFade = smoothstep(1.5, 6.0, -mv.z);
        vA = (0.30 + 0.70 * aCorner) * nearFade;
      }`,
    fragmentShader: `
      uniform float uIntensity;
      uniform vec3 uColor;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying float vA;
      varying float vFogDepth;
      void main(){
        float a = vA * uIntensity * 0.72;
        float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        vec3 col = mix(uColor, fogColor, clamp(f, 0.0, 0.8));
        gl_FragColor = vec4(col, a * (1.0 - f * 0.7));
      }`
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  scene.add(mesh);
  RAIN.mesh = mesh;
  RAIN.uniforms = mat.uniforms;

  // drips from gunwales / lamp ring
  const dripMat = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.75 });
  RAIN.drips = [];
  const emitters = [
    [-9.4, 1.35, 6.6], [-7.1, 1.15, 6.3], [-3.9, 1.05, 6.4], [1.8, 1.2, 6.6],
    [5.9, 4.0, 10.4], [-13.6, 3.95, 10.8], [7.0, 4.2, 11.2]
  ];
  const dr = mulberry32(1103);
  emitters.forEach((e, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), dripMat);
    m.visible = false;
    scene.add(m);
    RAIN.drips.push({ mesh: m, x: e[0] + (dr() - 0.5) * 0.6, y0: e[1], z: e[2] + (dr() - 0.5) * 0.6, period: 2.4 + dr() * 3.2, phase: dr() * 5, ground: 0.03 });
  });
}

function updateRain(t, wind) {
  RAIN.wind = wind;
  RAIN.uniforms.uTime.value = t;
  RAIN.uniforms.uIntensity.value = RAIN.intensity;
  RAIN.uniforms.uWind.value = wind;
  RAIN.drips.forEach(d => {
    const p = (((t + d.phase) % d.period) + d.period) % d.period / d.period;
    if (p < 0.26) {
      d.mesh.visible = true;
      const k = p / 0.26;
      d.mesh.position.set(d.x + k * 0.05, d.y0 - k * k * (d.y0 - d.ground), d.z);
      d.mesh.scale.setScalar(1 - k * 0.35);
    } else d.mesh.visible = false;
  });
}
