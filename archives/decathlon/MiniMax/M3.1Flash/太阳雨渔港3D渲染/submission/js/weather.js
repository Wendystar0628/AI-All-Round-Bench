/* =====================================================================
   weather.js — 太阳雨（雨丝 / 溅起水花 / 滴水 / 雾 / 彩虹 / 水洼倒影）
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const G = U.G, T = U.T;
  const M = TY.M;
  const L = TY.LAYOUT;

  const weather = {
    group: null,
    rainAmt: 0.55,
    rainObj: null,
    splashQuay: null,
    splashWater: null,
    drips: null,
    puddleRef: null,
    rainbow: null,
    rainbowAmt: 0,
    mist: [],
    dripSources: [],
    dropInst: null,
    drops: [],
  };

  weather.build = function (scene, renderer) {
    const grp = new THREE.Group();
    grp.name = 'weather';
    scene.add(grp);
    weather.group = grp;

    weather.buildRain(grp);
    weather.buildSplashes(grp);
    weather.buildPuddles(grp, renderer, scene);
    weather.buildMist(grp);
    weather.buildRainbow(grp);
    weather.buildDrips(grp);

    return grp;
  };

  /* ---------------- 雨丝 ---------------- */
  weather.buildRain = function (grp) {
    const N = 3200;
    const boxW = 48, boxH = 30, boxD = 48;
    const pos = new Float32Array(N * 6);
    const end = new Float32Array(N * 2);
    const spd = new Float32Array(N * 2);
    const rnd = new Float32Array(N * 2);
    const rnd2 = U.mulberry32(1234);
    for (let i = 0; i < N; i++) {
      const x = (rnd2() - 0.5) * boxW;
      const y = rnd2() * boxH;
      const z = (rnd2() - 0.5) * boxD;
      const s = 0.7 + rnd2() * 0.7;
      const r = rnd2();
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        end[i * 2 + k] = k;
        spd[i * 2 + k] = s;
        rnd[i * 2 + k] = r;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBoxH: { value: boxH },
        uAmount: { value: 0.55 },
        uColor: { value: new THREE.Color(0xffd891) },
        uWind: { value: new THREE.Vector3(0.28, 0, 0.16) },
        uCloudTex: { value: TY.shared.uCloudTex.value },
        uCloudOffset: { value: TY.shared.uCloudOffset.value },
        uCloudScale: { value: TY.shared.uCloudScale.value },
        uCloudAmt: { value: TY.shared.uCloudAmt.value },
      },
      vertexShader: [
        'attribute float aEnd; attribute float aSpeed; attribute float aRand;',
        'uniform float uTime, uBoxH, uAmount, uCloudScale, uCloudAmt;',
        'uniform vec3 uWind; uniform sampler2D uCloudTex; uniform vec2 uCloudOffset;',
        'varying float vA;',
        'void main(){',
        '  vec3 p = position;',
        '  float fall = uTime * aSpeed * 9.0;',
        '  p.y = mod(p.y - fall, uBoxH);',
        '  p.xz += uWind.xz * (uBoxH - p.y) * 0.055;',
        '  vec3 wp = (modelMatrix * vec4(p,1.0)).xyz;',
        '  float cf = texture2D(uCloudTex, (wp.xz + uCloudOffset) * uCloudScale).r;',
        '  cf = mix(1.0 - uCloudAmt, 1.0, smoothstep(0.18, 0.78, cf));',
        '  p += aEnd * vec3(uWind.x * 0.18, 0.26, uWind.z * 0.18);',
        '  vA = (1.0 - aEnd * 0.85) * (0.18 + 0.82 * aRand * aRand) * uAmount * cf;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'varying float vA;',
        'void main(){ gl_FragColor = vec4(uColor, vA * 0.55); }'
      ].join('\n'),
    });
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 8;
    grp.add(rain);
    weather.rainObj = rain;
    weather.rainMat = mat;
  };

  /* ---------------- 溅起的水花 ---------------- */
  function splashSystem(count, sampler, rate) {
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const rd = new Float32Array(count);
    const rnd = U.mulberry32(Math.floor(rate * 1000) + 17);
    for (let i = 0; i < count; i++) {
      const p = sampler(rnd);
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      ph[i] = rnd();
      rd[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rd, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uAmount: { value: 0.7 }, uRate: { value: rate },
        uColor: { value: new THREE.Color(0xeafaff) }, uScale: { value: 500 },
      },
      vertexShader: [
        'attribute float aPhase; attribute float aRand;',
        'uniform float uTime, uRate, uScale;',
        'varying float vA; varying float vT;',
        'void main(){',
        '  float t = fract(uTime * uRate + aPhase);',
        '  vT = t; vA = (1.0 - t) * (1.0 - t) * (0.4 + 0.6 * aRand);',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  gl_PointSize = max(1.0, (0.02 + t * 0.19) * uScale / max(-mv.z, 0.1));',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uAmount;',
        'varying float vA; varying float vT;',
        'void main(){',
        '  vec2 c = gl_PointCoord - 0.5;',
        '  float d = length(c) * 2.0;',
        '  float ring = smoothstep(0.55, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d));',
        '  float a = ring * vA * uAmount;',
        '  if (a < 0.01) discard;',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n'),
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    return pts;
  }

  weather.buildSplashes = function (grp) {
    const quaySamp = (rnd) => {
      const onWest = rnd() < 0.45;
      let x, z;
      if (onWest) { x = L.west.x0 + rnd() * (L.west.x1 - L.west.x0); z = L.west.z0 + rnd() * (L.west.z1 - L.west.z0); }
      else { x = L.south.x0 + rnd() * (L.south.x1 - L.south.x0); z = L.south.z0 + rnd() * (L.south.z1 - L.south.z0); }
      return [x, L.top + 0.02, z];
    };
    const waterSamp = (rnd) => {
      const x = L.waterRect.x0 + rnd() * (L.waterRect.x1 - L.waterRect.x0);
      const z = L.waterRect.z0 + rnd() * (L.waterRect.z1 - L.waterRect.z0);
      return [x, 0.03, z];
    };
    weather.splashQuay = splashSystem(520, quaySamp, 1.05);
    weather.splashWater = splashSystem(620, waterSamp, 0.85);
    grp.add(weather.splashQuay);
    grp.add(weather.splashWater);
  };

  /* ---------------- 水洼（倒影 + 涟漪） ---------------- */
  weather.buildPuddles = function (grp, renderer, scene) {
    const puddles = TY.props.puddles;
    if (!puddles.length) return;
    // 反射器（平面 y = 1.25）
    const dummy = new THREE.Object3D();
    dummy.position.set(0, L.top, 0);
    dummy.rotation.x = -Math.PI / 2;
    dummy.updateMatrixWorld(true);
    const refl = new TY.PlanarReflector(renderer, scene, dummy, 384, L.top);
    weather.puddleRef = refl;

    const grp2 = new THREE.Group();
    grp.add(grp2);
    puddles.forEach((p, i) => {
      const geo = new THREE.CircleGeometry(p.r, 26);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: {
          tReflect: { value: refl.rt.texture },
          tNoise: { value: TY.tex.tex(TY.tex.noiseCanvas(256, 23), 1, 1, false) },
          uTime: { value: 0 },
          uSeed: { value: p.seed },
          uAmount: { value: 0.82 },
          uRain: { value: 0.5 },
        },
        vertexShader: [
          'uniform mat4 textureMatrix;',
          'varying vec2 vUvp; varying vec3 vWPos; varying vec4 vRefUv;',
          'void main(){',
          '  vUvp = uv;',
          '  vec4 wp = modelMatrix * vec4(position,1.0);',
          '  vWPos = wp.xyz;',
          '  vRefUv = textureMatrix * vec4(position,1.0);',
          '  gl_Position = projectionMatrix * viewMatrix * wp;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D tReflect, tNoise;',
          'uniform float uTime, uSeed, uAmount, uRain;',
          'varying vec2 vUvp; varying vec3 vWPos; varying vec4 vRefUv;',
          'vec3 posterize(vec3 c, float n){ return floor(c*n + 0.5)/n; }',
          'void main(){',
          '  vec2 c = vUvp - 0.5;',
          '  float rad = length(c) * 2.0;',
          '  float shape = 1.0 - smoothstep(0.70, 0.99, rad);',
          '  float wob = texture2D(tNoise, vUvp * 2.4 + uSeed).r;',
          '  shape *= smoothstep(0.30, 0.72, wob + 0.28);',
          '  if (shape < 0.02) discard;',
          // 涟漪
          '  float rip = 0.0;',
          '  for (int i=0;i<3;i++){',
          '    float fi = float(i);',
          '    vec2 cc = vec2(fract(sin((uSeed+fi*7.3)*12.9898)*43758.5453), fract(sin((uSeed+fi*3.1)*78.233)*43758.5453));',
          '    float d = distance(vUvp, cc);',
          '    float ph = fract(uTime * (0.9 + fi*0.35) + fi*0.37);',
          '    float rr = ph * 0.52;',
          '    rip += smoothstep(0.035, 0.0, abs(d - rr)) * (1.0 - ph) * uRain;',
          '  }',
          '  vec2 ruv = vRefUv.xy / max(vRefUv.w, 0.0001);',
          '  ruv += vec2(sin(vWPos.x*3.1 + uTime*1.6), cos(vWPos.z*2.7 + uTime*1.3)) * 0.006;',
          '  ruv += rip * 0.012;',
          '  vec3 refl = texture2D(tReflect, clamp(ruv, vec2(0.003), vec2(0.997))).rgb;',
          '  refl = posterize(refl, 4.0);',
          '  vec3 wet = vec3(0.26, 0.32, 0.34);',
          '  vec3 col = mix(wet, refl * 1.05, 0.78);',
          '  col += vec3(1.0,0.98,0.9) * rip * 0.26;',
          '  col = mix(col*12.92, 1.055*pow(max(col, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), col));',
          '  float a = shape * uAmount * 0.88;',
          '  gl_FragColor = vec4(col, a);',
          '}'
        ].join('\n'),
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.y + 0.012, p.z);
      m.scale.set(1, 1, 0.68 + ((i * 7) % 5) * 0.08);
      m.renderOrder = 3;
      grp2.add(m);
    });
  };

  /* ---------------- 海雾 ---------------- */
  weather.buildMist = function (grp) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uColor: { value: new THREE.Color(0xeaf6f7) },
        uSeed: { value: 0 },
      },
      vertexShader: [
        'varying vec2 vUvm;',
        'void main(){ vUvm = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime, uSeed; uniform vec3 uColor;',
        'varying vec2 vUvm;',
        'void main(){',
        '  vec2 p = vUvm * vec2(3.0, 1.2);',
        '  float n = 0.0;',
        '  n += sin(p.x*3.1 + uTime*0.11 + uSeed)*0.5;',
        '  n += sin(p.x*6.7 - uTime*0.07 + uSeed*2.0)*0.3;',
        '  n += sin(p.y*4.3 + uTime*0.05)*0.25;',
        '  float a = smoothstep(0.1, 0.75, n*0.5 + 0.5);',
        '  a *= smoothstep(0.0, 0.35, vUvm.y) * smoothstep(1.0, 0.55, vUvm.y);',
        '  gl_FragColor = vec4(uColor, a * 0.30);',
        '}'
      ].join('\n'),
    });
    const spots = [[4.0, -9.2, 26, 5, 0], [8.2, -3.0, 18, 4, 1.7], [1.0, -6.0, 20, 3.4, 3.1]];
    spots.forEach((s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s[2], s[3]), mat.clone());
      m.material.uniforms.uSeed.value = s[4];
      m.position.set(s[0], 0.5 + s[3] * 0.25, s[1]);
      m.renderOrder = 6;
      grp.add(m);
      weather.mist.push(m);
    });
  };

  /* ---------------- 彩虹 ---------------- */
  weather.buildRainbow = function (grp) {
    const R = 30, width = 3.4;
    const geo = new THREE.RingGeometry(R - width, R, 64, 1, Math.PI * 0.18, Math.PI * 0.64);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: {
        uAmt: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: [
        'varying vec2 vUvr;',
        'void main(){ vUvr = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uAmt, uTime;',
        'varying vec2 vUvr;',
        'void main(){',
        '  float t = vUvr.x;',
        '  vec3 col;',
        '  if (t < 0.2) col = mix(vec3(1.0,0.45,0.42), vec3(1.0,0.78,0.35), t/0.2);',
        '  else if (t < 0.4) col = mix(vec3(1.0,0.78,0.35), vec3(0.72,0.95,0.5), (t-0.2)/0.2);',
        '  else if (t < 0.62) col = mix(vec3(0.72,0.95,0.5), vec3(0.5,0.85,0.95), (t-0.4)/0.22);',
        '  else if (t < 0.82) col = mix(vec3(0.5,0.85,0.95), vec3(0.62,0.6,0.95), (t-0.62)/0.2);',
        '  else col = mix(vec3(0.62,0.6,0.95), vec3(0.95,0.6,0.85), (t-0.82)/0.18);',
        '  float a = uAmt * 0.30 * smoothstep(0.0,0.12,t) * smoothstep(1.0,0.88,t);',
        '  gl_FragColor = vec4(col, a);',
        '}'
      ].join('\n'),
    });
    const m = new THREE.Mesh(geo, mat);
    // 彩虹位于太阳反方向
    const dir = TY.sky.sunDir.clone().multiplyScalar(-1);
    m.position.set(dir.x * 26, -6, dir.z * 26);
    m.lookAt(0, 6, 0);
    m.rotateX(Math.PI / 2);
    m.renderOrder = 9;
    m.frustumCulled = false;
    grp.add(m);
    weather.rainbow = m;
    weather.rainbowMat = mat;
  };

  /* ---------------- 滴水 ---------------- */
  weather.buildDrips = function (grp) {
    const geo = new THREE.SphereGeometry(0.022, 6, 5);
    const mat = TY.toon({
      color: 0xeafaff, steps: 2, transparent: true, opacity: 0.9,
      spec: { color: 0xffffff, strength: 0.9, power: 90, thresh: 0.3 },
      rim: { color: 0xffffff, strength: 0.55, power: 2 },
    });
    const N = 56;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;
    inst.castShadow = false;
    grp.add(inst);
    weather.dropInst = inst;
    for (let i = 0; i < N; i++) weather.drops.push({ on: false, x: 0, y: 0, y0: 0, z: 0, vy: 0, life: 0, t0: 0 });
  };

  weather.addDripSource = function (x, y, z, period, seed) {
    const s = {
      x: x, y: y, z: z, period: period, seed: seed || 0, cyc: 0,
      until: ((seed || 0) * 1.37) % period, target: -1,
    };
    weather.dripSources.push(s);
    return s;
  };

  /* 雨量只由时间决定（可预测，便于角色预判） */
  weather.rainAt = function (t) {
    const base = 0.5 + 0.5 * Math.sin(t * 0.055 - 1.2);
    const fine = 0.5 + 0.5 * Math.sin(t * 0.13 + 0.7);
    return U.clamp(0.22 + base * 0.55 + fine * 0.25, 0.12, 1.0);
  };

  weather.update = function (t, dt, camera, renderer, scene) {
    /* 雨量缓慢起伏 */
    weather.rainAmt = weather.rainAt(t);

    /* 雨 */
    const rm = weather.rainMat;
    rm.uniforms.uTime.value = t;
    rm.uniforms.uAmount.value = 0.35 + weather.rainAmt * 0.75;
    rm.uniforms.uCloudAmt.value = TY.shared.uCloudAmt.value;
    rm.uniforms.uCloudOffset.value = TY.shared.uCloudOffset.value;
    const gust = TY.life ? TY.life.gustAmount : 0;
    rm.uniforms.uWind.value.set(0.22 + gust * 0.55, 0, 0.12 + gust * 0.3);
    if (weather.rainObj) {
      weather.rainObj.position.set(camera.position.x, 0, camera.position.z);
    }

    /* 水花 */
    const rain = weather.rainAmt;
    weather.splashQuay.material.uniforms.uTime.value = t;
    weather.splashQuay.material.uniforms.uAmount.value = 0.2 + rain * 0.6;
    weather.splashWater.material.uniforms.uTime.value = t;
    weather.splashWater.material.uniforms.uAmount.value = 0.2 + rain * 0.6;

    /* 水洼 */
    if (weather.puddleRef) {
      weather.puddleRef.update(camera);
      weather.group.children.forEach((c) => {
        if (c.type === 'Group') c.children.forEach((m) => {
          if (m.material && m.material.uniforms && m.material.uniforms.uTime) {
            m.material.uniforms.uTime.value = t;
            m.material.uniforms.uRain.value = rain;
          }
        });
      });
    }

    /* 雾 */
    for (const m of weather.mist) {
      m.material.uniforms.uTime.value = t;
      m.position.x += Math.sin(t * 0.05 + m.position.z) * 0.0016;
    }

    /* 彩虹：雨转弱时短暂出现 */
    const rb = U.smoothstep(0.34, 0.16, weather.rainAmt) * U.smoothstep(0.2, 0.5, Math.sin(t * 0.045) * 0.5 + 0.5);
    weather.rainbowAmt += (rb - weather.rainbowAmt) * Math.min(1, dt * 0.8);
    if (weather.rainbowMat) weather.rainbowMat.uniforms.uAmt.value = weather.rainbowAmt;

    /* 滴水（绝对时间驱动，导出可复现） */
    for (const s of weather.dripSources) {
      if (t >= s.until) {
        s.cyc++;
        const r = U.mulberry32(s.seed * 7919 + s.cyc * 104729)();
        s.until = t + s.period * (0.6 + r * 0.8);
        const d = weather.drops.find((x) => !x.on);
        if (d) {
          d.on = true; d.x = s.x; d.y = s.y; d.y0 = s.y; d.z = s.z; d.vy = 0; d.life = 0; d.t0 = t;
        }
      }
    }
    const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
    let idx = 0;
    for (const d of weather.drops) {
      if (!d.on) continue;
      const el = t - d.t0;
      d.vy = 9.0 * el;
      d.y = d.y0 - 4.5 * el * el;
      d.life = el;
      const floorY = (d.x < L.west.x1 || d.z > L.south.z0) ? L.top : 0;
      if (d.y < floorY + 0.02 || d.life > 3.2) { d.on = false; continue; }
      const stretch = 1 + Math.min(3.2, d.vy * 0.42);
      _p.set(d.x, d.y, d.z);
      _s.set(1, stretch, 1);
      _m.compose(_p, _q, _s);
      weather.dropInst.setMatrixAt(idx++, _m);
    }
    for (let i = idx; i < weather.drops.length; i++) {
      _m.compose(_p.set(0, -50, 0), _q, _s.set(0.001, 0.001, 0.001));
      weather.dropInst.setMatrixAt(i, _m);
    }
    weather.dropInst.instanceMatrix.needsUpdate = true;
  };

  TY.weather = weather;
})();
