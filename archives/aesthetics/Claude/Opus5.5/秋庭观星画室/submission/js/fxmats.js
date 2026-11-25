/* special materials: water, stream, glass, sky, shafts, particles */
(function () {
  'use strict';
  const W = window.W, U = W.U;

  W.waterUniforms = {
    tRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uHasRefl: { value: 0 },
    tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.08 }, uFar: { value: 420 },
    uRip: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uPondC: { value: new THREE.Vector3(-1, 0, 12) },
  };
  const WU = Object.assign({}, U, W.waterUniforms);

  const COMMON = `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uShadeCol; uniform vec3 uSkyCol;
  uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform float uShadowTexel;
  uniform vec4 uCloud; uniform vec2 uCloudDir; uniform float uTime;
  uniform vec4 uWind; uniform vec2 uWindDir;
  uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar;
  ${W.GL_NOISE}
  float cloudAt(vec2 p){
    vec2 d = p - uCloud.xy;
    vec2 a = vec2(dot(d, uCloudDir), dot(d, vec2(-uCloudDir.y, uCloudDir.x)));
    float wob = fbm2(p * 0.08 + uCloud.xy * 0.02) * 0.5;
    float r = length(a / vec2(1.25, 0.8)) / uCloud.z + wob * 0.35;
    return 1.0 - uCloud.w * (1.0 - smoothstep(0.62, 0.95, r));
  }
  float gustAt(vec3 wp){ float s = dot(wp.xz, uWindDir); float d = uWind.y - s;
    return uWind.z * smoothstep(-1.0, 1.5, d) * exp(-max(d, 0.0) / uWind.w); }
  float shadow1(vec3 wp){
    vec4 sc = uShadowMat * vec4(wp, 1.0); vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
    if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) return 1.0;
    float s = 0.0;
    for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2)
      s += step(c.z - 0.001, unpackRGBAToDepth(textureLod(uShadowMap, c.xy + vec2(float(i), float(j)) * uShadowTexel, 0.0)));
    return smoothstep(0.2, 0.8, s / 4.0);
  }
  float linD(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  `;
  const WV = `varying vec3 vWP; varying vec3 vNw; varying vec2 vUv;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vNw = normalize(mat3(modelMatrix) * normal); vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp; }`;

  // ---------- pond jelly water ----------
  W.makePondMat = function (mode) {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, WU, { uMode: { value: mode } }),
      vertexShader: WV,
      fragmentShader: `#include <packing>
      ${COMMON}
      uniform sampler2D tRefl; uniform mat4 uReflMat; uniform float uHasRefl; uniform vec4 uRip[16]; uniform float uMode; uniform vec3 uPondC;
      varying vec3 vWP; varying vec3 vNw; varying vec2 vUv;
      void main(){
        vec2 suv = gl_FragCoord.xy / uRes;
        float sceneD = linD(texture2D(tDepth, suv).r);
        float myD = linD(gl_FragCoord.z);
        float thick = max(sceneD - myD, 0.0);
        vec3 V = normalize(cameraPosition - vWP);
        float t = uTime;
        float cl = cloudAt(vWP.xz);
        float sh = shadow1(vWP + vec3(0.0, 0.02, 0.0));
        if (uMode < 0.5) {
          vec2 p = vWP.xz;
          vec2 gr = vec2(0.0);
          gr += vec2(cos(p.x * 1.7 + t * 0.8 + p.y * 0.6), cos(p.y * 1.5 - t * 0.65 + p.x * 0.4)) * 0.035;
          gr += vec2(cos(p.x * 3.9 - t * 1.3 + p.y * 2.1), cos(p.y * 4.3 + t * 1.1 - p.x * 1.7)) * 0.018;
          float g = gustAt(vWP);
          gr += vec2(vnoise2(p * 6.0 + t * 3.0) - 0.5, vnoise2(p * 6.0 - t * 2.7 + 7.0) - 0.5) * g * 0.35;
          for (int i = 0; i < 16; i++) {
            vec4 r = uRip[i]; float age = t - r.z;
            if (age < 0.0 || age > 5.0) continue;
            vec2 dv = p - r.xy; float d = length(dv) + 1e-4;
            float rad = age * 0.55;
            float ring = sin((d - rad) * 18.0) * exp(-abs(d - rad) * 7.0) * exp(-age * 0.8) * r.w;
            gr += dv / d * ring * 0.25;
          }
          vec3 n = normalize(vec3(-gr.x, 1.0, -gr.y));
          // posterized distortion for flat-block reflections
          vec2 dist = floor(n.xz * 18.0 + 0.5) / 18.0;
          vec4 rc = uReflMat * vec4(vWP + vec3(dist.x, 0.0, dist.y) * 0.55, 1.0);
          vec3 refl = texture2DProj(tRefl, rc).rgb;
          float rl = dot(refl, vec3(0.3, 0.55, 0.15));
          refl = mix(refl, vec3(floor(rl * 5.0 + 0.5) / 5.0) * normalize(refl + 0.001) * 1.6, 0.35);
          float fres = 0.18 + 0.62 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
          vec3 shallow = vec3(0.30, 0.74, 0.82);
          vec3 deep = vec3(0.05, 0.30, 0.56);
          vec3 body = mix(shallow, deep, smoothstep(0.05, 1.1, thick));
          float pondR = length(vWP.xz - uPondC.xz);
          body = mix(body, body * vec3(0.8, 0.9, 1.0), smoothstep(1.0, 4.0, pondR) * 0.25);
          vec3 lit = body * mix(uShadeCol * 1.25, uSunCol, sh * cl * 0.85 + 0.15);
          vec3 col = mix(lit, refl * vec3(0.92, 0.98, 1.05), fres * uHasRefl);
          vec3 H = normalize(uSunDir + V);
          float sp = dot(n, H);
          col += uSunCol * smoothstep(0.9975, 0.9985, sp) * 1.2 * sh * cl;
          col += vec3(0.75, 0.9, 1.0) * smoothstep(0.985, 0.987, sp) * 0.12 * sh * cl;
          float edge = 1.0 - smoothstep(0.015, 0.05, thick);
          col = mix(col, vec3(0.86, 0.97, 1.0), edge * 0.85);
          float a = clamp(0.34 + (1.0 - exp(-thick * 1.5)) * 0.45 + fres * 0.3, 0.0, 0.95);
          a = max(a, edge * 0.9);
          gl_FragColor = vec4(col, a);
        } else {
          // section face: jelly cross section
          float depthBelow = clamp((-0.08 - vWP.y) / 0.8, 0.0, 1.0);
          vec3 body = mix(vec3(0.28, 0.76, 0.88), vec3(0.03, 0.24, 0.56), depthBelow);
          body = mix(body, body * vec3(0.7, 0.85, 1.0), smoothstep(0.3, 4.0, thick) * 0.5);
          float wv = vWP.y * 9.0 + sin(vWP.x * 2.3 + uTime * 0.6) * 0.35 + sin(vWP.z * 2.1 - uTime * 0.5) * 0.35;
          float band = smoothstep(0.46, 0.5, fract(wv * 0.25)) * (1.0 - smoothstep(0.54, 0.58, fract(wv * 0.25)));
          body += vec3(0.08, 0.12, 0.14) * band;
          vec3 col = body * (0.82 + 0.3 * cl);
          float topLine = 1.0 - smoothstep(0.0, 0.035, -0.08 - vWP.y);
          col = mix(col, vec3(0.88, 0.98, 1.0), topLine * 0.75);
          float edge = 1.0 - smoothstep(0.01, 0.04, thick);
          col = mix(col, vec3(0.85, 0.97, 1.0), edge * 0.6);
          float a = clamp(0.4 + (1.0 - exp(-thick * 0.85)) * 0.5, 0.0, 0.92);
          a = max(a, topLine * 0.9);
          gl_FragColor = vec4(col, a);
        }
      }`,
      transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
  };

  // ---------- flowing water (stream, spouts, small basins) ----------
  W.makeFlowMat = function (opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, WU, { uSpeed: { value: opts.speed || 0.6 }, uStill: { value: opts.still ? 1 : 0 }, uTint: { value: new THREE.Color(opts.tint || 0x6ec4d6) }, uScale: { value: opts.scale || 1 } }),
      vertexShader: WV,
      fragmentShader: `#include <packing>
      ${COMMON}
      uniform float uSpeed; uniform float uStill; uniform vec3 uTint; uniform float uScale;
      varying vec3 vWP; varying vec3 vNw; varying vec2 vUv;
      void main(){
        vec2 suv = gl_FragCoord.xy / uRes;
        float thick = max(linD(texture2D(tDepth, suv).r) - linD(gl_FragCoord.z), 0.0);
        vec3 V = normalize(cameraPosition - vWP);
        float cl = cloudAt(vWP.xz);
        float sh = shadow1(vWP + vNw * 0.02);
        float t = uTime;
        vec3 body = mix(uTint, uTint * vec3(0.45, 0.62, 0.85), smoothstep(0.02, 0.35, thick));
        vec3 col = body * mix(uShadeCol * 1.3, uSunCol, sh * cl * 0.8 + 0.2);
        float streak = 0.0;
        if (uStill < 0.5) {
          vec2 q = vec2(vUv.x * 6.0 * uScale - t * uSpeed * 3.0, vUv.y * 5.0);
          float n = vnoise2(vec2(q.x * 0.8, q.y * 2.0)) * 0.6 + vnoise2(q * vec2(1.6, 4.0) + 3.0) * 0.4;
          streak = smoothstep(0.63, 0.67, n);
          float n2 = vnoise2(vec2(q.x * 1.7 + 11.0, q.y * 3.0));
          streak = max(streak, smoothstep(0.7, 0.73, n2) * 0.6);
        } else {
          vec2 q = vWP.xz * 7.0 * uScale + vec2(t * 0.2, -t * 0.15);
          streak = smoothstep(0.7, 0.74, vnoise2(q)) * 0.5;
        }
        col = mix(col, vec3(0.9, 0.98, 1.0), streak * (0.55 + 0.45 * sh * cl));
        float fres = pow(1.0 - max(dot(vNw, V), 0.0), 3.0);
        col += uSkyCol * fres * 0.35;
        vec3 H = normalize(uSunDir + V);
        col += uSunCol * smoothstep(0.985, 0.99, dot(normalize(vNw + vec3(sin(vWP.x * 9.0 + t * 2.0), 0.0, cos(vWP.z * 9.0 - t * 2.3)) * 0.06), H)) * sh * cl;
        float edge = 1.0 - smoothstep(0.004, 0.02, thick);
        col = mix(col, vec3(0.9, 0.98, 1.0), edge * 0.7);
        float a = clamp(0.4 + thick * 3.0 + streak * 0.3 + fres * 0.3, 0.0, 0.88);
        a = max(a, edge * 0.85);
        gl_FragColor = vec4(col, a);
      }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  };

  // ---------- glass with stylized reflection ----------
  W.makeGlassMat = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U),
      vertexShader: `varying vec3 vWP; varying vec3 vNw; varying vec2 vUv;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vNw = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform sampler2D uAtlas; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uSunDir; uniform float uTime;
        varying vec3 vWP; varying vec3 vNw; varying vec2 vUv;
        void main(){
          vec3 V = normalize(cameraPosition - vWP);
          vec3 N = normalize(vNw); if (!gl_FrontFacing) N = -N;
          float fres = 0.12 + 0.7 * pow(1.0 - abs(dot(N, V)), 3.0);
          vec4 r = texture2D(uAtlas, vUv);
          vec3 col = mix(uSkyCol * 1.05, r.rgb * 1.05, 0.85);
          // diagonal glare bands
          float s = vWP.x * 0.8 + vWP.y * 1.1 + vWP.z * 0.8;
          float band = smoothstep(0.46, 0.5, fract(s * 0.35)) * (1.0 - smoothstep(0.56, 0.6, fract(s * 0.35)));
          col += vec3(1.0, 0.95, 0.85) * band * 0.3;
          float a = 0.04 + fres * 0.42 + band * 0.1;
          float lum = dot(r.rgb, vec3(0.33));
          a += 0.08 * smoothstep(0.2, 0.9, 1.0 - lum) * fres * 2.0;
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.72));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  };

  // ---------- sky ----------
  W.makeSkyMat = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U),
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 uSunDir; uniform float uTime; uniform vec4 uCloud;
        varying vec3 vDir;
        ${W.GL_NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 top = vec3(0.30, 0.52, 0.86);
          vec3 mid = vec3(0.56, 0.74, 0.94);
          vec3 hor = vec3(0.93, 0.89, 0.82);
          vec3 low = vec3(0.80, 0.76, 0.75);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, y));
          c = mix(c, top, smoothstep(0.25, 0.85, y));
          c = mix(c, low, smoothstep(0.02, -0.55, y));
          float sd = max(dot(d, uSunDir), 0.0);
          c += vec3(1.0, 0.82, 0.55) * pow(sd, 8.0) * 0.35;
          c += vec3(1.0, 0.9, 0.7) * smoothstep(0.9985, 0.9992, sd) * 2.0;
          c += vec3(1.0, 0.88, 0.62) * smoothstep(0.985, 0.995, sd) * 0.5;
          // cirrus wisps
          if (y > 0.02) {
            vec2 p = d.xz / (y + 0.25) * 2.0;
            p += vec2(uTime * 0.004, uTime * 0.0015);
            vec2 q = vec2(p.x * 0.6 + p.y * 0.8, -p.x * 0.8 + p.y * 0.6);
            float n = fbm2(vec2(q.x * 0.9, q.y * 4.5));
            float n2 = fbm2(vec2(q.x * 2.3 + 4.0, q.y * 9.0));
            float wisp = smoothstep(0.55, 0.62, n * 0.75 + n2 * 0.3);
            float wisp2 = smoothstep(0.62, 0.66, n * 0.75 + n2 * 0.3);
            float fade = smoothstep(0.02, 0.2, y) * (1.0 - smoothstep(0.75, 1.0, y));
            c = mix(c, vec3(0.96, 0.96, 0.97), wisp * 0.45 * fade);
            c = mix(c, vec3(1.0, 0.97, 0.92), wisp2 * 0.35 * fade);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
  };

  // ---------- light shafts ----------
  W.makeShaftMat = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uOpacity: { value: 1 } }),
      vertexShader: `attribute float aSeed; varying vec2 vUv; varying vec3 vWP; varying float vSeed; varying vec3 vNw;
        void main(){ vUv = uv; vSeed = aSeed; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec4 uCloud; uniform vec2 uCloudDir; uniform float uTime; uniform vec3 uSunCol; uniform float uOpacity;
        varying vec2 vUv; varying vec3 vWP; varying float vSeed; varying vec3 vNw;
        ${W.GL_NOISE}
        float cloudAt(vec2 p){
          vec2 d = p - uCloud.xy;
          vec2 a = vec2(dot(d, uCloudDir), dot(d, vec2(-uCloudDir.y, uCloudDir.x)));
          float wob = fbm2(p * 0.08 + uCloud.xy * 0.02) * 0.5;
          float r = length(a / vec2(1.25, 0.8)) / uCloud.z + wob * 0.35;
          return 1.0 - uCloud.w * (1.0 - smoothstep(0.62, 0.95, r));
        }
        void main(){
          float along = vUv.y;
          vec3 V = normalize(cameraPosition - vWP);
          float nv = abs(dot(normalize(vNw), V));
          float endFade = smoothstep(0.0, 0.3, along) * (1.0 - smoothstep(0.65, 1.0, along));
          float body = smoothstep(0.15, 0.24, nv);
          float core = smoothstep(0.62, 0.7, nv);
          float shimmer = 0.8 + 0.2 * sin(uTime * 0.35 + vSeed * 6.0 + along * 4.0);
          float a = (body * 0.5 + core * 0.5) * endFade * shimmer;
          float cl = cloudAt(vWP.xz);
          a *= cl * cl;
          a = clamp(a, 0.0, 1.0);
          if (isnan(a)) a = 0.0;
          gl_FragColor = vec4(uSunCol * vec3(1.0, 0.88, 0.62) * a * 0.13 * uOpacity, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  };

  // ---------- point sprites: dust, sparkles, puffs ----------
  // Each point: position (base), aData (seed, size, kind, phase)
  W.makeMoteMat = function (opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uRes: W.waterUniforms.uRes, uColor: { value: new THREE.Color(opts.color || 0xfff1c8) }, uSize: { value: opts.size || 0.05 }, uDrift: { value: opts.drift || 0.3 }, uBox: { value: new THREE.Vector3(1, 1, 1) }, uAmt: { value: 1 } }),
      vertexShader: `attribute vec4 aData; uniform float uTime; uniform vec2 uRes; uniform float uSize; uniform float uDrift; uniform vec3 uBox;
        uniform vec4 uCloud; uniform vec2 uCloudDir;
        varying float vA;
        void main(){
          float s = aData.x;
          vec3 p = position;
          float t = uTime * uDrift;
          p += vec3(sin(t * 0.7 + s * 6.3) * 0.4, sin(t * 0.5 + s * 3.1) * 0.5 - mod(t * 0.08 + s, 1.0) * 0.4, cos(t * 0.6 + s * 4.7) * 0.4) * uBox;
          vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.5 + 0.5 * sin(uTime * (1.0 + s * 2.0) + s * 40.0);
          vA = tw * aData.w;
          gl_PointSize = max(1.5, uSize * aData.y * uRes.y / -mv.z);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAmt; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float a = (1.0 - smoothstep(0.32, 0.38, d)) * 0.8 + (1.0 - smoothstep(0.1, 0.16, d)) * 0.4;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a * vA * uAmt, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  };

  // puffs: steam / smoke rising columns (toon two-tone)
  W.makePuffMat = function (opts) {
    opts = opts || {};
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uRes: W.waterUniforms.uRes, uColor: { value: new THREE.Color(opts.color || 0xffffff) }, uShade: { value: new THREE.Color(opts.shade || 0xc8cde6) },
        uRise: { value: opts.rise || 0.5 }, uLife: { value: opts.life || 3 }, uSize: { value: opts.size || 0.12 }, uSpread: { value: opts.spread || 0.08 }, uBend: { value: new THREE.Vector2(0, 0) }, uAlpha: { value: opts.alpha || 0.6 } }),
      vertexShader: `attribute vec4 aData; uniform float uTime; uniform vec2 uRes; uniform float uRise; uniform float uLife; uniform float uSize; uniform float uSpread; uniform vec2 uBend;
        varying float vA; varying float vAge;
        void main(){
          float seed = aData.x;
          float age = mod(uTime / uLife + seed, 1.0);
          vAge = age;
          float h = age * uRise;
          vec3 p = position;
          p.y += h;
          p.x += sin(age * 6.0 + seed * 12.0 + uTime * 0.8) * uSpread * (0.3 + age) + uBend.x * h * h * 1.5;
          p.z += cos(age * 5.0 + seed * 9.0 + uTime * 0.7) * uSpread * (0.3 + age) + uBend.y * h * h * 1.5;
          vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.55, 1.0, age));
          gl_PointSize = uSize * (0.5 + age * 1.4) * aData.y * uRes.y / -mv.z;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uShade; uniform float uAlpha; varying float vA; varying float vAge;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float body = 1.0 - smoothstep(0.38, 0.44, d);
          if (body < 0.01) discard;
          float lit = 1.0 - smoothstep(0.16, 0.22, length(c - vec2(-0.1, -0.12)));
          vec3 col = mix(uShade, uColor, lit);
          gl_FragColor = vec4(col, body * vA * uAlpha); }`,
      transparent: true, depthWrite: false,
    });
  };

  // halo: banded glow billboard (points)
  W.makeHaloMat = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uRes: W.waterUniforms.uRes }),
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform vec2 uRes; varying vec4 vCol;
        void main(){ vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vCol = aCol;
          gl_PointSize = min(aSize * uRes.y / -mv.z, uRes.y * 0.5); }`,
      fragmentShader: `varying vec4 vCol;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.92, 1.0, d)) * 0.25 + (1.0 - smoothstep(0.6, 0.66, d)) * 0.3 + (1.0 - smoothstep(0.3, 0.36, d)) * 0.45;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  };

  // mist band (soft horizontal planes)
  W.makeMistMat = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uAmt: { value: 1 } }),
      vertexShader: `varying vec2 vUv; varying vec3 vWP; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime; uniform float uAmt; uniform vec3 uSunCol; varying vec2 vUv; varying vec3 vWP;
        ${W.GL_NOISE}
        void main(){
          float n = fbm2(vec2(vWP.x * 0.18 + uTime * 0.02, vWP.y * 0.5 + vWP.z * 0.1));
          float e = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y)) * smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
          float a = smoothstep(0.38, 0.5, n) * 0.5 + smoothstep(0.52, 0.6, n) * 0.3;
          a *= e * uAmt;
          vec3 Vd = normalize(cameraPosition - vWP);
          a *= smoothstep(0.15, 0.6, abs(Vd.z));
          vec3 col = mix(vec3(0.86, 0.88, 0.93), vec3(1.0, 0.94, 0.82), smoothstep(0.5, 0.65, n));
          gl_FragColor = vec4(col, a * 0.55);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  };

  // glowing orb (orrery star) material
  W.makeOrbMat = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uGlow: { value: 1 } }),
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vWP; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime; uniform float uGlow; uniform float uFlash; uniform float uPass;
        varying vec3 vN; varying vec3 vP; varying vec3 vWP;
        ${W.GL_NOISE}
        void main(){
          if (uPass > 1.5) { discard; }
          if (uPass > 0.5) { gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 0.2); return; }
          vec3 p = normalize(vP);
          float t = uTime * 0.12;
          float n = fbm3(p * 2.5 + vec3(t, t * 0.6, -t * 0.4));
          float bands = sin((p.y + n * 0.8) * 10.0 + uTime * 0.5);
          float b = smoothstep(0.55, 0.65, bands);
          vec3 a = vec3(0.22, 0.48, 1.0);
          vec3 g = vec3(1.0, 0.8, 0.42);
          float b2 = smoothstep(0.35, 0.45, sin((p.x - n * 0.6) * 7.0 - uTime * 0.35));
          vec3 col = mix(a, g * 1.2, b * 0.85);
          col = mix(col, vec3(0.75, 0.9, 1.0), b2 * 0.35);
          float fres = 1.0 - abs(normalize(vN).z);
          col += vec3(0.6, 0.85, 1.0) * smoothstep(0.5, 0.6, fres) * 0.8;
          col *= (0.75 + uGlow * 0.45 + uFlash * 2.4);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  };
})();
