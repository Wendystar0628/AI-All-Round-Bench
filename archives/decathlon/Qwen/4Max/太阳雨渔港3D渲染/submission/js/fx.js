/* 天空、太阳雨、色块化水面反射、水洼、光柱、粼光、涟漪、彩虹、云影、航迹 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const toon = H.toon, box = H.box, cyl = H.cyl, sph = H.sph, grp = H.grp;

  const NOISE_GLSL = `
    float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
  `;

  const fx = {};
  H.fx = fx;

  fx.init = function (scene, renderer, camera) {
    fx.scene = scene; fx.renderer = renderer; fx.camera = camera;
    fx.sunDir = new THREE.Vector3(0.55, 0.72, 0.42).normalize();

    // ---------- 天空 ----------
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCloud: { value: 1 },
        uSunDir: { value: fx.sunDir },
        uTop: { value: new THREE.Color(P.skyTop) },
        uHorizon: { value: new THREE.Color(P.skyHorizon) }
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform float uTime, uCloud;
        uniform vec3 uSunDir, uTop, uHorizon;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.65));
          // 太阳与光晕
          float sd = max(dot(d, uSunDir), 0.0);
          col += vec3(1.0, 0.93, 0.72) * pow(sd, 900.0) * 2.4 * uCloud;
          col += vec3(1.0, 0.92, 0.70) * pow(sd, 14.0) * 0.30 * uCloud;
          col += vec3(1.0, 0.95, 0.80) * pow(sd, 3.0) * 0.10 * uCloud;
          // 薄云
          if(d.y > 0.02){
            vec2 cuv = d.xz / (d.y + 0.18);
            float cl = fbm(cuv * 1.4 + vec2(uTime * 0.008, uTime * 0.003));
            cl = smoothstep(0.48, 0.78, cl) * 0.30;
            float cl2 = fbm(cuv * 3.1 - vec2(uTime * 0.012, 0.0));
            cl += smoothstep(0.55, 0.85, cl2) * 0.12;
            col = mix(col, vec3(1.0, 1.0, 0.99), cl * (0.5 + 0.5 * uCloud));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 20), skyMat);
    sky.renderOrder = -100;
    scene.add(sky);
    fx.skyMat = skyMat; fx.sky = sky;

    // ---------- 光照 ----------
    const hemi = new THREE.HemisphereLight(H.srgbColor(0xf2fbf8), H.srgbColor(0x8fbcb2), 0.52);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(H.srgbColor(0xfff2d8), 0.65);
    sun.position.set(20, 27, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
    sun.shadow.camera.near = 5; sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    fx.hemi = hemi; fx.sun = sun;
    scene.fog = new THREE.Fog(H.srgbColor(0xe9f4f0), 36, 100);

    // ---------- 平面反射 ----------
    function makeReflection(planeY, size) {
      const rt = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
      rt.texture.encoding = THREE.sRGBEncoding;
      const cam = new THREE.PerspectiveCamera();
      const texMat = new THREE.Matrix4();
      const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const r = { rt: rt, cam: cam, texMat: texMat, clip: clip, planeY: planeY, target: new THREE.Vector3() };
      r.update = function (mainCam) {
        cam.position.set(mainCam.position.x, 2 * planeY - mainCam.position.y, mainCam.position.z);
        const dir = new THREE.Vector3();
        mainCam.getWorldDirection(dir);
        r.target.copy(mainCam.position).addScaledVector(dir, 12);
        r.target.y = 2 * planeY - r.target.y;
        cam.up.set(0, -1, 0);
        cam.lookAt(r.target);
        cam.near = mainCam.near; cam.far = mainCam.far;
        cam.fov = mainCam.fov; cam.aspect = mainCam.aspect;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        texMat.multiply(cam.projectionMatrix);
        texMat.multiply(cam.matrixWorldInverse);
      };
      return r;
    }
    fx.waterRefl = makeReflection(L.waterY, 1024);
    fx.puddleRefl = makeReflection(L.quayY + 0.015, 512);

    // ---------- 水面（色块化倒影） ----------
    const waterGeo = new THREE.PlaneGeometry(15.5, 15.5, 56, 56);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        tRefl: { value: fx.waterRefl.rt.texture },
        uTexMat: { value: fx.waterRefl.texMat },
        uTime: { value: 0 }, uCloud: { value: 1 },
        uSunDir: { value: fx.sunDir }, uCamPos: { value: new THREE.Vector3() },
        uShallow: { value: new THREE.Color(P.waterShallow) },
        uMid: { value: new THREE.Color(P.waterMid) },
        uDeep: { value: new THREE.Color(P.waterDeep) },
        uGust: { value: 0 }, uGustCenter: { value: new THREE.Vector2(8, -8) }, uGustRadius: { value: 0 }
      },
      vertexShader: `
        uniform mat4 uTexMat;
        uniform float uTime;
        varying vec3 vWorld;
        varying vec4 vReflUv;
        void main(){
          vec3 p = position;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          float w = sin(wp.x * 0.9 + uTime * 0.8) * 0.014 + sin(wp.z * 1.3 - uTime * 0.6) * 0.012
                  + sin((wp.x + wp.z) * 0.5 + uTime * 0.4) * 0.01;
          wp.y += w;
          vWorld = wp.xyz;
          vReflUv = uTexMat * wp;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform sampler2D tRefl;
        uniform float uTime, uCloud, uGust, uGustRadius;
        uniform vec3 uSunDir, uCamPos, uShallow, uMid, uDeep;
        uniform vec2 uGustCenter;
        varying vec3 vWorld;
        varying vec4 vReflUv;
        void main(){
          vec2 p = vWorld.xz;
          float t = uTime;
          // 波浪法线
          float e = 0.06;
          float gx = cos(p.x*0.9+t*0.8)*0.9*0.014 + cos((p.x+p.y)*0.5+t*0.4)*0.5*0.01;
          float gz = cos(p.y*1.3-t*0.6)*1.3*0.012 + cos((p.x+p.y)*0.5+t*0.4)*0.5*0.01;
          gx += (vnoise(p*2.2+vec2(t*0.25,0.0))-0.5)*0.10;
          gz += (vnoise(p*2.2+vec2(0.0,t*0.22)+7.3)-0.5)*0.10;
          vec3 n = normalize(vec3(-gx, 1.0, -gz));
          // 碎块化扰动（按格子量化，边缘利落）
          vec2 cell = floor(p * 1.55);
          float cp = hash21(cell);
          vec2 dist = vec3(gx, 0.0, gz).xz * 0.85;
          dist += vec2(sin(t*0.28+cp*6.28), cos(t*0.21+cp*6.28)) * 0.014;
          dist = floor(dist * 46.0) / 46.0;
          vec2 ruv = vReflUv.xy / max(vReflUv.w, 0.001) + dist;
          vec3 refl = texture2D(tRefl, clamp(ruv, 0.002, 0.998)).rgb;
          // 色块化（posterize）
          refl = floor(refl * 5.0 + 0.5) / 5.0;
          float lum = dot(refl, vec3(0.299, 0.587, 0.114));
          vec3 tint = mix(uDeep * 0.85, vec3(0.99, 1.0, 0.98), smoothstep(0.18, 0.92, lum));
          refl = mix(refl, tint, 0.38);
          // 基色（近岸浅 → 深）
          float shoreD = min(p.x + 4.5, 4.5 - p.y);
          shoreD = min(shoreD, min(11.0 - p.x, p.y + 11.0));
          vec3 base = mix(uShallow, uMid, smoothstep(0.0, 2.6, shoreD));
          base = mix(base, uDeep, smoothstep(2.6, 8.5, shoreD));
          // 菲涅尔混合
          vec3 V = normalize(uCamPos - vWorld);
          float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);
          float reflStr = mix(0.46, 0.9, fres);
          vec3 col = mix(base, refl, reflStr);
          // 粼光
          float sp = vnoise(p * 7.5 + vec2(t * 0.6, t * 0.35));
          sp = pow(sp, 16.0) * 2.6;
          float sunAlign = pow(max(dot(reflect(-V, n), uSunDir), 0.0), 5.0);
          col += vec3(1.0, 0.94, 0.74) * sp * (0.3 + sunAlign * 0.9) * uCloud;
          // 岸缘细沫
          float foamN = vnoise(p * 3.0 + vec2(t * 0.3, -t * 0.2));
          float foam = smoothstep(0.42, 0.0, shoreD) * smoothstep(0.35, 0.75, foamN);
          col = mix(col, vec3(0.96, 0.99, 0.97), foam * 0.55);
          // 阵风波纹带
          float gd = distance(p, uGustCenter);
          float ring = smoothstep(1.6, 0.0, abs(gd - uGustRadius)) * uGust;
          col += vec3(0.92, 0.99, 0.96) * ring * 0.14;
          gl_FragColor = vec4(col, 0.94);
        }`,
      transparent: true
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(3.25, L.waterY, -3.25);
    water.renderOrder = 4;
    water.receiveShadow = true;
    scene.add(water);
    fx.water = water; fx.waterMat = waterMat;

    // ---------- 水洼 ----------
    fx.puddles = [];
    const puddleMat = new THREE.ShaderMaterial({
      uniforms: {
        tRefl: { value: fx.puddleRefl.rt.texture },
        uTexMat: { value: fx.puddleRefl.texMat },
        uTime: { value: 0 }, uCloud: { value: 1 },
        uCamPos: { value: new THREE.Vector3() },
        uBase: { value: new THREE.Color(0x8aa49c) }
      },
      vertexShader: `
        uniform mat4 uTexMat;
        varying vec3 vWorld; varying vec4 vReflUv; varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vReflUv = uTexMat * wp;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform sampler2D tRefl;
        uniform float uTime, uCloud;
        uniform vec3 uCamPos, uBase;
        varying vec3 vWorld; varying vec4 vReflUv; varying vec2 vUv;
        void main(){
          vec2 p = vWorld.xz;
          float t = uTime;
          vec2 dist = vec2(vnoise(p*4.0+t*0.3)-0.5, vnoise(p*4.0-t*0.25+3.7)-0.5) * 0.035;
          vec2 ruv = vReflUv.xy / max(vReflUv.w, 0.001) + dist;
          vec3 refl = texture2D(tRefl, clamp(ruv, 0.002, 0.998)).rgb;
          refl = floor(refl * 4.0 + 0.5) / 4.0;
          float lum = dot(refl, vec3(0.299,0.587,0.114));
          refl = mix(refl, mix(vec3(0.18,0.34,0.36), vec3(1.0), smoothstep(0.15,0.9,lum)), 0.3);
          vec3 col = mix(uBase, refl, 0.72);
          float sp = pow(vnoise(p*9.0+vec2(t*0.5,0.0)), 18.0) * 2.0;
          col += vec3(1.0,0.95,0.78) * sp * uCloud;
          // 边缘柔和（ShapeGeometry UV 即形状坐标，半径约 0.4~0.54）
          vec2 c = vUv;
          float edge = 1.0 - smoothstep(0.30, 0.50, length(c * vec2(1.0, 1.25)));
          gl_FragColor = vec4(col, 0.92 * edge);
        }`,
      transparent: true, depthWrite: false
    });
    function puddle(x, z, w, h, rot) {
      const shape = new THREE.Shape();
      const rnd = H.mulberry32((x * 13 + z * 7) | 0);
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2;
        const r = 0.5 * (0.78 + rnd() * 0.3);
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
      }
      const geo = new THREE.ShapeGeometry(shape);
      const m = new THREE.Mesh(geo, puddleMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rot || 0;
      m.position.set(x, L.quayY + 0.016, z);
      m.scale.set(w, h, 1);
      m.renderOrder = 3;
      scene.add(m);
      fx.puddles.push(m);
      return m;
    }
    puddle(1.15, 6.15, 1.5, 0.95, 0.3);
    puddle(-2.3, 7.9, 1.7, 1.0, -0.5);
    puddle(5.9, 6.8, 1.2, 0.75, 0.8);
    puddle(-6.1, 2.3, 1.0, 0.65, 0.2);
    fx.puddleMat = puddleMat;

    // ---------- 太阳雨 ----------
    const RAIN_N = 1600;
    const rainGeo = new THREE.BufferGeometry();
    const seeds = new Float32Array(RAIN_N * 2 * 3);
    const ends = new Float32Array(RAIN_N * 2);
    const rr = H.mulberry32(123);
    for (let i = 0; i < RAIN_N; i++) {
      const sx = rr(), sy = rr(), sz = rr();
      for (let k = 0; k < 2; k++) {
        seeds[(i * 2 + k) * 3] = sx;
        seeds[(i * 2 + k) * 3 + 1] = sy;
        seeds[(i * 2 + k) * 3 + 2] = sz;
        ends[i * 2 + k] = k;
      }
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 2 * 3), 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const rainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDensity: { value: 0.5 }, uSlant: { value: 0.5 },
        uCloud: { value: 1 }
      },
      vertexShader: `
        attribute vec3 aSeed;
        attribute float aEnd;
        uniform float uTime, uDensity, uSlant;
        varying float vAlpha;
        void main(){
          float H = 15.0;
          float speed = 7.5 + aSeed.y * 3.5;
          float y = mod(aSeed.y * H + uTime * speed, H);
          vec3 p = vec3(aSeed.x * 27.0 - 13.5, y, aSeed.z * 27.0 - 13.5);
          p.x += uSlant * (H - y) * 0.16;
          p += aEnd * vec3(uSlant * 0.2, -0.78, 0.05);
          // 地面高度（陆域 1.0 / 水域 0.45）
          float ground = (p.x < -4.5 && p.z < 4.5) ? 1.0 : ((p.z > 4.5 || p.x < -11.0) ? 1.0 : 0.45);
          if (p.x < -5.0 && p.z < -6.0) ground = 1.0 + 2.4 * (1.0 - smoothstep(0.0, 1.0, length(vec2((p.x+11.0)/6.0, (p.z+11.0)/5.0))));
          float fade = smoothstep(ground, ground + 0.5, p.y);
          float vis = step(aSeed.y, uDensity);
          vAlpha = fade * vis * (0.28 + 0.26 * aSeed.x);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uCloud;
        varying float vAlpha;
        void main(){
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.86), vAlpha * (0.6 + 0.4 * uCloud));
        }`,
      transparent: true, depthWrite: false
    });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.renderOrder = 20;
    scene.add(rain);
    fx.rain = rain; fx.rainMat = rainMat;

    // ---------- 光柱中的金色亮雨丝 ----------
    const GLINT_N = 220;
    const glintGeo = new THREE.BufferGeometry();
    const gBase = new Float32Array(GLINT_N * 2 * 3);
    const gSeed = new Float32Array(GLINT_N * 2);
    const gEnd = new Float32Array(GLINT_N * 2);
    const gH = new Float32Array(GLINT_N * 2);
    // 光柱区域：两道露天光柱 + 仓库卷帘内
    const columns = [
      { x: 2.2, z: -3.6, r: 1.1, y0: 0.6, h: 8.0 },
      { x: -3.1, z: 1.4, r: 0.8, y0: 0.6, h: 7.5 },
      { x: -7.6, z: -1.2, r: 0.9, y0: 1.05, h: 1.9 }
    ];
    const gr = H.mulberry32(555);
    for (let i = 0; i < GLINT_N; i++) {
      const col = columns[i % 3];
      const a = gr() * 6.283, rr2 = Math.sqrt(gr()) * col.r;
      const bx = col.x + Math.cos(a) * rr2, bz = col.z + Math.sin(a) * rr2;
      const sd = gr();
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        gBase[j * 3] = bx; gBase[j * 3 + 1] = col.y0; gBase[j * 3 + 2] = bz;
        gSeed[j] = sd; gEnd[j] = k; gH[j] = col.h;
      }
    }
    glintGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GLINT_N * 2 * 3), 3));
    glintGeo.setAttribute('aBase', new THREE.BufferAttribute(gBase, 3));
    glintGeo.setAttribute('aSeed', new THREE.BufferAttribute(gSeed, 1));
    glintGeo.setAttribute('aEnd', new THREE.BufferAttribute(gEnd, 1));
    glintGeo.setAttribute('aH', new THREE.BufferAttribute(gH, 1));
    const glintMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCloud: { value: 1 }, uSlant: { value: 0.5 } },
      vertexShader: `
        attribute vec3 aBase; attribute float aSeed, aEnd, aH;
        uniform float uTime, uSlant;
        varying float vA;
        void main(){
          float speed = 6.0 + aSeed * 3.0;
          float y = mod(aSeed * aH + uTime * speed, aH);
          vec3 p = aBase + vec3(uSlant * (aH - y) * 0.1, y, 0.0);
          p += aEnd * vec3(uSlant * 0.12, -0.4, 0.02);
          float fade = smoothstep(0.0, 0.4, y) * (1.0 - smoothstep(aH - 0.6, aH, y));
          float tw = 0.5 + 0.5 * sin(uTime * 9.0 + aSeed * 40.0);
          vA = fade * tw;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uCloud;
        varying float vA;
        void main(){ gl_FragColor = vec4(1.0, 0.9, 0.6, vA * 0.5 * uCloud); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const glintRain = new THREE.LineSegments(glintGeo, glintMat);
    glintRain.frustumCulled = false;
    glintRain.renderOrder = 21;
    scene.add(glintRain);
    fx.glintRain = glintRain; fx.glintMat = glintMat;

    // ---------- 涟漪池 ----------
    fx.ripples = [];
    const rippleGeo = new THREE.RingGeometry(0.86, 1.0, 26);
    rippleGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: H.srgbColor(0xf2fbf7), transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      fx.ripples.push({ mesh: m, t0: -10, dur: 1.6, maxR: 0.3, active: false });
    }
    fx.spawnRipple = function (x, z, y, maxR, dur) {
      for (let i = 0; i < fx.ripples.length; i++) {
        const r = fx.ripples[i];
        if (!r.active) {
          r.active = true; r.t0 = fx.time; r.dur = dur || 1.6; r.maxR = maxR || 0.3;
          r.mesh.position.set(x, y, z);
          r.mesh.visible = true;
          return;
        }
      }
    };

    // ---------- 滴水池 ----------
    fx.drops = [];
    const dropGeo = new THREE.SphereGeometry(0.014, 6, 5);
    const dropMat = new THREE.MeshBasicMaterial({ color: H.srgbColor(0xfff6dd), transparent: true, opacity: 0.9 });
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      scene.add(m);
      fx.drops.push({ mesh: m, active: false, vel: 0, groundY: 1, water: false, x: 0, z: 0 });
    }
    fx.spawnDrop = function (pos, groundY, water) {
      for (let i = 0; i < fx.drops.length; i++) {
        const d = fx.drops[i];
        if (!d.active) {
          d.active = true;
          d.mesh.position.copy(pos);
          d.mesh.visible = true;
          d.vel = 0; d.groundY = groundY; d.water = !!water;
          d.x = pos.x; d.z = pos.z;
          return;
        }
      }
    };

    // ---------- 浪花（消波块/岸壁） ----------
    fx.foams = [];
    const foamMat = toon(P.foam, { transparent: true, opacity: 0.9 });
    const foamSpots = [
      [10.0, -9.9, 1.1], [9.3, -10.2, 0.9], [10.2, -8.9, 0.8],
      [10.1, 3.4, 1.0], [9.4, 3.9, 0.8],
      [-2.2, -9.3, 1.0], [-3.4, -8.9, 0.9], [-4.6, -8.5, 0.8],
      [1.2, -9.5, 0.9], [0.2, -9.8, 0.8],
      [-4.3, 2.2, 0.6], [-4.3, -2.6, 0.6], [1.9, 4.3, 0.6], [6.2, 4.3, 0.6], [8.6, 2.0, 0.7]
    ];
    foamSpots.forEach(function (f, idx) {
      const fg = grp(f[0], L.waterY + 0.02, f[1], scene);
      const rnd = H.mulberry32(idx * 5 + 2);
      const blobs = [];
      for (let i = 0; i < 4; i++) {
        const b = sph(0.1 + rnd() * 0.1, foamMat, (rnd() - 0.5) * 0.5, 0.02, (rnd() - 0.5) * 0.5, fg, 8, 6);
        b.scale.y = 0.45;
        b.castShadow = false;
        blobs.push(b);
      }
      fx.foams.push({ group: fg, blobs: blobs, phase: idx * 1.7, scale: f[2] });
    });

    // ---------- 光柱 ----------
    const beamTex = H.canvasTex(64, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,236,170,0.85)');
      g.addColorStop(0.5, 'rgba(255,236,170,0.35)');
      g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createLinearGradient(0, 0, w, 0);
      g2.addColorStop(0, 'rgba(0,0,0,1)');
      g2.addColorStop(0.25, 'rgba(0,0,0,0)');
      g2.addColorStop(0.75, 'rgba(0,0,0,0)');
      g2.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
    });
    fx.shafts = [];
    function shaft(pos, dir, len, w, base) {
      const geo = new THREE.PlaneGeometry(w, len);
      geo.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: beamTex, color: H.srgbColor(0xffe6a8), transparent: true, opacity: base,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
      }));
      m.position.copy(pos);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
      m.renderOrder = 15;
      scene.add(m);
      // 交叉第二片增强体积感
      const m2 = m.clone();
      m2.material = m.material;
      m2.rotateY(Math.PI / 2);
      m.add(m2);
      fx.shafts.push({ mesh: m, base: base, phase: pos.x * 2 + pos.z });
      return m;
    }
    (H.refs.warehouseShafts || []).forEach(function (s) {
      shaft(s.pos, s.dir, s.len, s.w, 0.24);
    });
    // 船舱玻璃光柱
    shaft(new THREE.Vector3(-2.7, L.waterY + 1.15, -2.3), new THREE.Vector3(-0.5, -0.7, -0.2), 1.4, 0.5, 0.12);
    shaft(new THREE.Vector3(4.6, L.waterY + 1.1, 3.1), new THREE.Vector3(-0.5, -0.7, -0.15), 1.4, 0.5, 0.12);
    // 云隙露天光柱
    shaft(new THREE.Vector3(2.5, 9.5, -3.5), new THREE.Vector3(-0.35, -1, -0.2), 9.5, 2.2, 0.07);
    shaft(new THREE.Vector3(-3.0, 9.0, 1.5), new THREE.Vector3(-0.3, -1, -0.15), 8.5, 1.6, 0.05);

    // ---------- 粼光（天花板/顶棚/海床） ----------
    const causticMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCloud: { value: 1 }, uIntensity: { value: 0.16 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime, uCloud, uIntensity;
        varying vec2 vUv;
        void main(){
          vec2 p = vUv * 7.0;
          float t = uTime * 0.35;
          float v = sin(p.x*2.1+t)*sin(p.y*2.3-t*0.8);
          v += sin((p.x+p.y)*1.7+t*0.6)*0.6;
          v += sin(length(p-vec2(3.5))*3.0-t)*0.4;
          v = pow(max(v*0.5+0.2, 0.0), 3.0);
          vec3 col = mix(vec3(0.75,0.95,0.9), vec3(1.0,0.93,0.7), 0.4);
          gl_FragColor = vec4(col, v * uIntensity * uCloud);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    fx.causticMat = causticMat;
    fx.caustics = [];
    (H.anim.causticTargets || []).forEach(function (ct) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ct.w, ct.h), causticMat);
      m.position.set(ct.x, ct.y, ct.z);
      m.rotation.x = ct.rotX;
      m.renderOrder = 14;
      ct.parent.add(m);
      fx.caustics.push(m);
    });
    // 海床粼光
    const seabedCaustic = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), causticMat);
    seabedCaustic.rotation.x = -Math.PI / 2;
    seabedCaustic.position.set(3.25, L.seabedY + 0.03, -3.25);
    seabedCaustic.renderOrder = 1;
    scene.add(seabedCaustic);

    // ---------- 彩虹 ----------
    const rbR = 8.5, rbW = 0.85, rbSeg = 64, rbArc = Math.PI * 0.82;
    const rbVerts = [], rbCols = [], rbIdx = [], rbT = [];
    for (let i = 0; i <= rbSeg; i++) {
      const a = Math.PI * 0.09 + i / rbSeg * rbArc;
      for (let j = 0; j <= 7; j++) {
        const r = rbR + (j / 7 - 0.5) * rbW;
        rbVerts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
        const c = new THREE.Color(P.rainbow[6 - j]);
        rbCols.push(c.r, c.g, c.b);
        rbT.push(i / rbSeg);
      }
    }
    for (let i = 0; i < rbSeg; i++) {
      for (let j = 0; j < 7; j++) {
        const a = i * 8 + j, b = a + 1, c = a + 8, d = c + 1;
        rbIdx.push(a, c, b, b, c, d);
      }
    }
    const rbGeo = new THREE.BufferGeometry();
    rbGeo.setAttribute('position', new THREE.Float32BufferAttribute(rbVerts, 3));
    rbGeo.setAttribute('color', new THREE.Float32BufferAttribute(rbCols, 3));
    rbGeo.setAttribute('aT', new THREE.Float32BufferAttribute(rbT, 1));
    rbGeo.setIndex(rbIdx);
    const rbMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `
        attribute float aT;
        varying vec3 vColor; varying float vT;
        void main(){ vColor = color; vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor; varying float vT;
        void main(){
          float endFade = smoothstep(0.0, 0.12, vT) * smoothstep(1.0, 0.88, vT);
          gl_FragColor = vec4(vColor, uOpacity * endFade * 0.55);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true
    });
    const rainbow = new THREE.Mesh(rbGeo, rbMat);
    rainbow.position.set(5.5, -1.5, -15.5);
    rainbow.rotation.y = -0.35;
    rainbow.renderOrder = 16;
    rainbow.visible = false;
    scene.add(rainbow);
    fx.rainbow = rainbow; fx.rbMat = rbMat;

    // ---------- 云影 ----------
    const cloudShadowTex = H.canvasTex(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
      g.addColorStop(0, 'rgba(42,77,84,0.55)');
      g.addColorStop(0.6, 'rgba(42,77,84,0.28)');
      g.addColorStop(1, 'rgba(42,77,84,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    });
    const csMatL = new THREE.MeshBasicMaterial({ map: cloudShadowTex, transparent: true, opacity: 0, depthWrite: false });
    const csLand = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), csMatL);
    csLand.rotation.x = -Math.PI / 2;
    csLand.position.set(0, L.quayY + 0.03, 7.5);
    csLand.renderOrder = 2;
    scene.add(csLand);
    const csWater = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), csMatL.clone());
    csWater.rotation.x = -Math.PI / 2;
    csWater.position.set(3, L.waterY + 0.03, -3);
    csWater.renderOrder = 5;
    scene.add(csWater);
    fx.csLand = csLand; fx.csWater = csWater;

    // ---------- 远雾 ----------
    const hazeTex = H.canvasTex(64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(233,244,240,0)');
      g.addColorStop(0.55, 'rgba(233,244,240,0.55)');
      g.addColorStop(1, 'rgba(233,244,240,0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(34, 5), new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, depthWrite: false, fog: false }));
    haze.position.set(3, 1.6, -12.6);
    haze.renderOrder = 17;
    scene.add(haze);
    fx.haze = haze;
    // 流动雾团
    fx.mists = [];
    const mistTex = H.canvasTex(128, 64, (ctx) => {
      const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 60);
      g.addColorStop(0, 'rgba(238,248,244,0.5)');
      g.addColorStop(1, 'rgba(238,248,244,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 64);
    });
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.3, depthWrite: false }));
      sp.scale.set(7, 2.2, 1);
      sp.position.set(2 + i * 4, 1.1, -11.5);
      sp.renderOrder = 18;
      scene.add(sp);
      fx.mists.push({ sprite: sp, phase: i * 2.4, baseX: 2 + i * 4 });
    }

    // ---------- 航迹 ----------
    const wakeGeo = new THREE.BufferGeometry();
    const wakeMax = 60;
    const wakePos = new Float32Array(wakeMax * 6 * 3);
    const wakeAlpha = new Float32Array(wakeMax * 6);
    wakeGeo.setAttribute('position', new THREE.BufferAttribute(wakePos, 3));
    wakeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(wakeAlpha, 1));
    const wakeMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.85 } },
      vertexShader: `
        attribute float aAlpha;
        varying float vA;
        void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uOpacity;
        varying float vA;
        void main(){ gl_FragColor = vec4(0.97, 1.0, 0.98, vA * uOpacity); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const wake = new THREE.Mesh(wakeGeo, wakeMat);
    wake.frustumCulled = false;
    wake.renderOrder = 6;
    wake.visible = false;
    scene.add(wake);
    fx.wake = wake; fx.wakeGeo = wakeGeo; fx.wakeMax = wakeMax;
    // 船头浪花
    const bowFoam = new THREE.Sprite(new THREE.SpriteMaterial({
      map: H.canvasTex(64, 64, (ctx) => {
        const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        g.addColorStop(0, 'rgba(250,255,252,0.9)');
        g.addColorStop(0.6, 'rgba(240,250,246,0.4)');
        g.addColorStop(1, 'rgba(240,250,246,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      }), transparent: true, depthWrite: false
    }));
    bowFoam.scale.set(0.9, 0.5, 1);
    bowFoam.visible = false;
    bowFoam.renderOrder = 7;
    scene.add(bowFoam);
    fx.bowFoam = bowFoam;

    // ---------- 反射渲染 ----------
    fx.hideList = [water, rain, glintRain, seabedCaustic, haze, rainbow, wake, bowFoam, csLand, csWater];
    fx.renderReflections = function (mainCam) {
      const hidden = [];
      function hide(obj) { if (obj && obj.visible) { obj.visible = false; hidden.push(obj); } }
      fx.hideList.forEach(hide);
      hide(H.refs.underwater);
      hide(H.refs.waterVolume);
      fx.shafts.forEach(function (s) { hide(s.mesh); });
      fx.ripples.forEach(function (r) { hide(r.mesh); });
      fx.drops.forEach(function (d) { hide(d.mesh); });
      fx.mists.forEach(function (m) { hide(m.sprite); });
      fx.puddles.forEach(hide);
      fx.caustics.forEach(hide);

      const oldPlanes = fx.renderer.clippingPlanes;
      const oldRT = fx.renderer.getRenderTarget();
      const oldShadow = fx.renderer.shadowMap.autoUpdate;
      fx.renderer.shadowMap.autoUpdate = false;

      // 水面反射
      fx.waterRefl.update(mainCam);
      fx.renderer.clippingPlanes = [fx.waterRefl.clip];
      fx.renderer.setRenderTarget(fx.waterRefl.rt);
      fx.renderer.clear();
      fx.renderer.render(fx.scene, fx.waterRefl.cam);

      // 水洼反射
      fx.puddleRefl.update(mainCam);
      fx.renderer.clippingPlanes = [fx.puddleRefl.clip];
      fx.renderer.setRenderTarget(fx.puddleRefl.rt);
      fx.renderer.clear();
      fx.renderer.render(fx.scene, fx.puddleRefl.cam);

      fx.renderer.clippingPlanes = oldPlanes;
      fx.renderer.setRenderTarget(oldRT);
      fx.renderer.shadowMap.autoUpdate = oldShadow;
      hidden.forEach(function (o) { o.visible = true; });
    };

    fx.time = 0;
  };

  // ---------- 每帧更新 ----------
  fx.update = function (t, env) {
    fx.time = t;
    const cloud = env.cloud;
    fx.skyMat.uniforms.uTime.value = t;
    fx.skyMat.uniforms.uCloud.value = cloud;
    fx.sun.intensity = 0.34 + 0.31 * cloud;
    fx.hemi.intensity = 0.38 + 0.14 * cloud;
    const warmth = 0.5 + 0.2 * cloud;
    fx.sun.color.copy(H.srgbColor(0xfff2d8)).lerp(H.srgbColor(0xe8f0f2), 1 - warmth);

    fx.waterMat.uniforms.uTime.value = t;
    fx.waterMat.uniforms.uCloud.value = cloud;
    fx.waterMat.uniforms.uCamPos.value.copy(fx.camera.position);
    fx.waterMat.uniforms.uGust.value = env.gustStrength;
    fx.waterMat.uniforms.uGustCenter.value.set(env.gustX, env.gustZ);
    fx.waterMat.uniforms.uGustRadius.value = env.gustRadius;

    fx.puddleMat.uniforms.uTime.value = t;
    fx.puddleMat.uniforms.uCloud.value = cloud;
    fx.puddleMat.uniforms.uCamPos.value.copy(fx.camera.position);

    fx.rainMat.uniforms.uTime.value = t;
    fx.rainMat.uniforms.uDensity.value = env.rain;
    fx.rainMat.uniforms.uSlant.value = 0.45 + env.wind * 1.6;
    fx.rainMat.uniforms.uCloud.value = cloud;
    fx.glintMat.uniforms.uTime.value = t;
    fx.glintMat.uniforms.uCloud.value = cloud * (0.4 + env.rain * 0.7);
    fx.glintMat.uniforms.uSlant.value = 0.45 + env.wind * 1.6;

    fx.causticMat.uniforms.uTime.value = t;
    fx.causticMat.uniforms.uCloud.value = cloud;

    // 光柱闪烁（镜头贴近时淡出，避免糊屏）
    fx.shafts.forEach(function (s) {
      const flick = 0.85 + 0.15 * Math.sin(t * 0.7 + s.phase);
      const d = s.mesh.position.distanceTo(fx.camera.position);
      const prox = H.smoothstep(0.7, 2.0, d);
      s.mesh.material.opacity = s.base * cloud * flick * (0.6 + env.rain * 0.5) * prox;
    });

    // 涟漪
    fx.ripples.forEach(function (r) {
      if (!r.active) return;
      const raw = (t - r.t0) / r.dur;
      if (raw >= 1) { r.active = false; r.mesh.visible = false; return; }
      if (raw < 0) { r.mesh.visible = false; return; }
      const k = raw;
      const s = r.maxR * (0.15 + 0.85 * (1 - Math.pow(1 - k, 2)));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 0.45 * (1 - k);
      r.mesh.visible = true;
    });

    // 滴水
    fx.drops.forEach(function (d) {
      if (!d.active) return;
      d.vel += 9.8 * env.dt;
      d.mesh.position.y -= d.vel * env.dt;
      if (d.mesh.position.y <= d.groundY + 0.02) {
        d.active = false; d.mesh.visible = false;
        if (d.water || d.groundY < L.quayY - 0.1) fx.spawnRipple(d.x, d.z, d.groundY + 0.015, 0.16, 1.2);
        else fx.spawnRipple(d.x, d.z, L.quayY + 0.02, 0.1, 0.9);
      }
    });

    // 浪花（航迹浪按距离先后拍上消波块与岸壁）
    fx.foams.forEach(function (f) {
      let wakeHit = 0;
      const pts = env.wakePoints;
      if (pts) {
        for (let i = 0; i < pts.length; i++) {
          const wp = pts[i];
          const dx = f.group.position.x - wp.x, dz = f.group.position.z - wp.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const k = t - (wp.t + dist / 3.2);
          if (k > 0 && k < 2.6) wakeHit += 0.9 * Math.exp(-dist * 0.09) * Math.max(0, Math.sin(k * 5.5)) * (1 - k / 2.6);
        }
      }
      const w = 0.5 + 0.5 * Math.sin(t * 0.9 + f.phase) + env.gustStrength * 0.6 + Math.min(1.2, wakeHit);
      const s = f.scale * (0.55 + 0.45 * w);
      f.group.scale.set(s, 0.5 + 0.5 * w, s);
      f.group.position.y = L.waterY + 0.01 + 0.03 * Math.sin(t * 1.1 + f.phase);
      f.blobs.forEach(function (b, i) {
        b.material.opacity = 0.55 + 0.35 * w;
      });
    });

    // 彩虹
    const rbOp = env.rainbow;
    fx.rainbow.visible = rbOp > 0.01;
    fx.rbMat.uniforms.uOpacity.value = rbOp;

    // 云影位置
    const csOp = (1 - cloud) * 0.5;
    fx.csLand.material.opacity = csOp;
    fx.csWater.material.opacity = csOp * 0.8;
    const cx = H.lerp(15, -15, env.cloudShadowPos);
    fx.csLand.position.x = cx;
    fx.csWater.position.x = cx + 2;

    // 远雾流动
    fx.mists.forEach(function (m) {
      m.sprite.position.x = m.baseX + Math.sin(t * 0.05 + m.phase) * 2.5;
      m.sprite.material.opacity = 0.18 + 0.12 * Math.sin(t * 0.07 + m.phase * 2);
    });

    // 航迹
    const pts = env.wakePoints;
    if (pts && pts.length > 1) {
      fx.wake.visible = true;
      const posAttr = fx.wakeGeo.attributes.position;
      const alphaAttr = fx.wakeGeo.attributes.aAlpha;
      let vi = 0, ai = 0, count = 0;
      const n = Math.min(pts.length - 1, fx.wakeMax);
      for (let i = 0; i < n; i++) {
        const p0 = pts[pts.length - 1 - i], p1 = pts[pts.length - 2 - i];
        const age = t - p0.t;
        if (age > 7) break;
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 0.001;
        const nx = -dz / len, nz = dx / len;
        const w0 = 0.18 + age * 0.22, w1 = 0.18 + (t - p1.t) * 0.22;
        const a0 = Math.max(0, 0.75 * (1 - age / 7));
        const a1 = Math.max(0, 0.75 * (1 - (t - p1.t) / 7));
        const y = L.waterY + 0.025;
        const quad = [
          p0.x + nx * w0, y, p0.z + nz * w0,
          p0.x - nx * w0, y, p0.z - nz * w0,
          p1.x + nx * w1, y, p1.z + nz * w1,
          p0.x - nx * w0, y, p0.z - nz * w0,
          p1.x - nx * w1, y, p1.z - nz * w1,
          p1.x + nx * w1, y, p1.z + nz * w1
        ];
        for (let k = 0; k < 18; k++) posAttr.array[vi++] = quad[k];
        alphaAttr.array[ai++] = a0; alphaAttr.array[ai++] = a0; alphaAttr.array[ai++] = a1;
        alphaAttr.array[ai++] = a0; alphaAttr.array[ai++] = a1; alphaAttr.array[ai++] = a1;
        count += 6;
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      fx.wakeGeo.setDrawRange(0, count);
    } else {
      fx.wake.visible = false;
    }
    // 船头浪花
    if (env.boatMoving) {
      fx.bowFoam.visible = true;
      fx.bowFoam.position.set(env.boatX + env.boatDirX * 1.6, L.waterY + 0.06, env.boatZ + env.boatDirZ * 1.6);
      const s = 0.7 + 0.3 * Math.sin(t * 6);
      fx.bowFoam.scale.set(s, s * 0.5, 1);
    } else {
      fx.bowFoam.visible = false;
    }
  };

})(window.HARBOR);