// Posterized Anime Harbor Water Surface, Translucent Teal Cutaway Side Walls,
// Foreground Reflective Rain Puddle, High-Key Sky Dome + Thin Clouds,
// Diagonal Warm-Gold Sunshower Rain, Edge Drip Particles, Faint Cel Rainbow & Distant Sea Mist
(function () {
  const {
    BASE_SIZE, HALF, DECK_Y, WATER_Y, SUN_DIR, createRNG, lerp, clamp,
    getSeabedY, evaluateGust, evaluateCloud, evaluateRain
  } = window.HARBOR;
  const { GLOBAL_UNIFORMS } = window.HARBOR_MATERIALS;

  function buildWaterAndWeather(scene, baseRef, propsRef) {
    const group = new THREE.Group();
    group.name = 'WaterAndWeather';
    scene.add(group);

    const rng = createRNG(6060);

    // Prepare tetrapod positions uniform array (13 tetrapods for exact cel foam collars!)
    const maxTetras = 14;
    const tetraUniformArr = [];
    for (let i = 0; i < maxTetras; i++) {
      if (baseRef && baseRef.tetrapodCenters && i < baseRef.tetrapodCenters.length) {
        const c = baseRef.tetrapodCenters[i];
        tetraUniformArr.push(new THREE.Vector2(c.x, c.z));
      } else {
        tetraUniformArr.push(new THREE.Vector2(999, 999));
      }
    }

    // Prepare dynamic wake rings uniform array (up to 6 wake wave rings from departing Boat 4)
    const maxWakes = 6;
    const wakeUniformArr = [];
    for (let i = 0; i < maxWakes; i++) {
      wakeUniformArr.push(new THREE.Vector4(999, 999, 0, 0)); // (x, z, radius, strength)
    }

    // Placeholder 1x1 reflection textures (replaced every frame by postprocess.js!)
    const dummyTex = new THREE.DataTexture(new Uint8Array([190, 232, 238, 255]), 1, 1);
    dummyTex.needsUpdate = true;

    // =========================================================================
    // 1. POSTERIZED ANIME HARBOR WATER SURFACE (y = 0.0)
    // =========================================================================
    const waterGeo = new THREE.PlaneGeometry(BASE_SIZE - 0.02, BASE_SIZE - 0.02, 128, 128);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GLOBAL_UNIFORMS.uTime,
        uSunDir: GLOBAL_UNIFORMS.uSunDir,
        uCloudPos: GLOBAL_UNIFORMS.uCloudPos,
        uCloudParams: GLOBAL_UNIFORMS.uCloudParams,
        uRainIntensity: GLOBAL_UNIFORMS.uRainIntensity,
        uGustStrength: { value: 0.0 },
        uGustFront: { value: -40.0 },
        uGustDir: { value: new THREE.Vector2(-0.78, -0.625) },
        uReflectTex: { value: dummyTex },
        uTetras: { value: tetraUniformArr },
        uWakes: { value: wakeUniformArr }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uGustStrength;
        uniform float uGustFront;
        uniform vec2 uGustDir;
        uniform vec4 uWakes[6];
        varying vec3 vWorldPos;
        varying vec4 vClipPos;
        varying float vWaveH;

        float waveFunc(vec2 p, float t) {
          float w = sin(p.x * 0.55 + t * 1.15) * 0.028
                  + cos(p.y * 0.62 - t * 0.95) * 0.024
                  + sin((p.x + p.y) * 0.92 + t * 1.45) * 0.014;
          // Gust capillary band
          float proj = dot(p, uGustDir);
          float gDist = proj - uGustFront;
          float gEnv = exp(-(gDist * gDist) / 26.0) * uGustStrength;
          w += sin(proj * 3.8 - t * 9.5) * 0.018 * gEnv;
          // Boat 4 causal wake wave rings
          for (int i = 0; i < 6; i++) {
            vec4 wk = uWakes[i];
            if (wk.w > 0.01) {
              float d = length(p - wk.xy);
              float rd = d - wk.z;
              float env = exp(-(rd * rd) / 0.85) * wk.w;
              w += sin(rd * 5.2) * 0.045 * env;
            }
          }
          return w;
        }

        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = waveFunc(wp.xz, uTime);
          wp.y += h;
          vWorldPos = wp.xyz;
          vWaveH = h;
          vClipPos = projectionMatrix * viewMatrix * wp;
          gl_Position = vClipPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec2 uCloudPos;
        uniform vec2 uCloudParams;
        uniform float uRainIntensity;
        uniform float uGustStrength;
        uniform float uGustFront;
        uniform vec2 uGustDir;
        uniform sampler2D uReflectTex;
        uniform vec2 uTetras[14];
        uniform vec4 uWakes[6];

        varying vec3 vWorldPos;
        varying vec4 vClipPos;
        varying float vWaveH;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }

        // Exact signed distance to concrete land structures for crisp shoreline foam & exact cut-out
        float boxDist(vec2 p, vec2 bMin, vec2 bMax) {
          vec2 c = (bMin + bMax) * 0.5;
          vec2 e = (bMax - bMin) * 0.5;
          vec2 d = abs(p - c) - e;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        float landSDF(vec2 p) {
          float d1 = boxDist(p, vec2(-17.5, -17.5), vec2(-5.49, 17.5)); // West Wharf
          float d2 = boxDist(p, vec2(-5.5, 7.49), vec2(2.01, 17.5));    // Foreground Quay
          float d3 = boxDist(p, vec2(1.99, 9.19), vec2(3.46, 13.21));   // Boarding Platform
          float d4 = boxDist(p, vec2(-5.5, -8.21), vec2(5.41, -5.59));  // Short Breakwater
          // Slipway submerged edge (water intersects ramp y=0 at x ≈ -2.48)
          float d5 = boxDist(p, vec2(-5.5, 4.39), vec2(-2.48, 7.51));
          return min(min(min(d1, d2), min(d3, d4)), d5);
        }

        // Procedural multi-cell expanding concentric raindrop ripples
        float rainRipples(vec2 p, float t, float intensity) {
          float sum = 0.0;
          for (int layer = 0; layer < 2; layer++) {
            float scale = layer == 0 ? 0.85 : 1.35;
            vec2 g = p * scale;
            vec2 id = floor(g);
            vec2 gv = fract(g) - 0.5;
            float rnd = hash21(id + float(layer) * 19.7);
            float period = 1.6 + rnd * 1.1;
            float phase = fract(t / period + rnd);
            vec2 center = (vec2(hash21(id + 3.1), hash21(id + 7.9)) - 0.5) * 0.55;
            float d = length(gv - center);
            float rad = phase * 0.44;
            float ring = smoothstep(0.025, 0.0, abs(d - rad)) * (1.0 - phase) * smoothstep(0.0, 0.08, phase);
            // Outer secondary harmonic ring
            float ring2 = smoothstep(0.018, 0.0, abs(d - rad * 0.65)) * (1.0 - phase) * 0.5;
            float isActive = step(1.0 - intensity * 0.88, rnd);
            sum += (ring + ring2) * isActive;
          }
          return clamp(sum, 0.0, 1.0);
        }

        void main() {
          vec2 p = vWorldPos.xz;
          float dLand = landSDF(p);
          if (dLand < -0.02) discard;

          // 1. Wave normal perturbation (gentle harbor swell + gust ripple front + wake rings)
          float proj = dot(p, uGustDir);
          float gDist = proj - uGustFront;
          float gustBand = exp(-(gDist * gDist) / 22.0) * uGustStrength;

          float wx = cos(p.x * 0.6 + uTime * 1.15) * 0.08 + sin((p.x + p.y) * 1.3 + uTime * 1.6) * 0.05;
          float wz = -sin(p.y * 0.65 - uTime * 0.95) * 0.08 + cos((p.x - p.y) * 1.1 + uTime * 1.3) * 0.05;
          // Fine wind-gust capillary ripples advancing toward quay!
          float gustRipple = sin(proj * 6.5 - uTime * 13.0 + sin(p.y * 2.2) * 1.4) * gustBand;
          wx += uGustDir.x * gustRipple * 0.14;
          wz += uGustDir.y * gustRipple * 0.14;

          // Wake wave boost along shoreline & tetrapods
          float wakeBoost = 0.0;
          for (int i = 0; i < 6; i++) {
            vec4 wk = uWakes[i];
            if (wk.w > 0.01) {
              float d = length(p - wk.xy);
              float rd = d - wk.z;
              float env = exp(-(rd * rd) / 1.1) * wk.w;
              wakeBoost += env;
              vec2 rDir = normalize(p - wk.xy + vec2(0.0001));
              float slope = cos(rd * 5.2) * env * 0.16;
              wx += rDir.x * slope;
              wz += rDir.y * slope;
            }
          }

          vec3 N = normalize(vec3(-wx, 1.0, -wz));
          vec3 V = normalize(cameraPosition - vWorldPos);
          float ndv = clamp(dot(N, V), 0.0, 1.0);
          float fresnel = pow(1.0 - ndv, 2.5);

          // 2. Moving Cloud Shadow factor
          vec2 cd = p - uCloudPos;
          float cRad = max(uCloudParams.x, 1.0);
          float sunFac = clamp(1.0 - exp(-dot(cd, cd) / (cRad * cRad) * 1.35) * uCloudParams.y, 0.34, 1.0);

          // 3. True Planar Reflection with Smooth Fluid Anime Brushstroke Waves & CRISP POSTERIZED COLOR SHARDS! (Section 9.4)
          vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
          // Smooth fluid horizontal anime brushstroke slicing (ZERO blocky floor() stair-stepping!)
          float sliceWave = sin(p.y * 3.1 + uTime * 1.85 + sin(p.x * 1.15 - uTime * 0.95) * 1.55);
          float sliceWave2 = cos(p.x * 1.9 - p.y * 2.2 + uTime * 1.35) * 0.55;
          vec2 refUV = vec2(screenUV.x, 1.0 - screenUV.y);
          refUV.x += (sliceWave * 0.015 + sliceWave2 * 0.008 + gustRipple * 0.013);
          refUV.y += (wx * 0.055 + wz * 0.048);
          refUV = clamp(refUV, vec2(0.006), vec2(0.994));

          // Clean 5-tap mini-smoothing before posterization -> silky anime hand-painted flat color shards (zero jagged noise!)
          vec2 blurOff = vec2(0.0028, 0.0022);
          vec3 rawRef = texture2D(uReflectTex, refUV).rgb * 0.36
                      + texture2D(uReflectTex, clamp(refUV + vec2(blurOff.x, 0.0), vec2(0.004), vec2(0.996))).rgb * 0.16
                      + texture2D(uReflectTex, clamp(refUV - vec2(blurOff.x, 0.0), vec2(0.004), vec2(0.996))).rgb * 0.16
                      + texture2D(uReflectTex, clamp(refUV + vec2(0.0, blurOff.y), vec2(0.004), vec2(0.996))).rgb * 0.16
                      + texture2D(uReflectTex, clamp(refUV - vec2(0.0, blurOff.y), vec2(0.004), vec2(0.996))).rgb * 0.16;

          float refLum = dot(rawRef, vec3(0.299, 0.587, 0.114));
          // Sharp flat-edged posterization (crisp cel shard thresholds!)
          float skyCyanDiff = (rawRef.b + rawRef.g * 0.5) - rawRef.r * 1.45;
          float isSkyRef = smoothstep(0.66, 0.73, refLum) * smoothstep(0.06, 0.12, skyCyanDiff);
          float isBoatWhite = smoothstep(0.63, 0.69, refLum) * (1.0 - isSkyRef * 0.90);
          float isDarkObj = 1.0 - smoothstep(0.30, 0.36, refLum);
          float isMidObj = clamp((1.0 - isBoatWhite) * (1.0 - isDarkObj) * (1.0 - isSkyRef), 0.0, 1.0);
          // Crisp posterized coral-red & orange accents (lighthouse, buoys, life rings!)
          float redness = clamp(rawRef.r - max(rawRef.g, rawRef.b), 0.0, 1.0);
          float isRedAccent = smoothstep(0.10, 0.14, redness);

          // Pure flat-shaded anime reflection shard palette (青绿、深蓝、白色碎块 + 珊瑚红点缀):
          vec3 colSkyAqua  = vec3(0.22, 0.64, 0.70);
          vec3 colDeepBlue = vec3(0.04, 0.19, 0.29);
          vec3 colSeaTeal  = vec3(0.15, 0.51, 0.56);
          vec3 colCrispWht = vec3(0.91, 0.97, 0.98);
          vec3 colRedBlock = vec3(0.76, 0.26, 0.21);

          vec3 postRef = colSkyAqua * isSkyRef
                       + colSeaTeal * isMidObj
                       + colDeepBlue * isDarkObj
                       + colCrispWht * isBoatWhite;
          postRef = mix(postRef, colRedBlock, isRedAccent * 0.88);
          postRef = mix(postRef, rawRef * vec3(0.66, 0.83, 0.87), 0.08);

          // 4. Base Clear Sea-Glass Aqua Water Color (shallow near quay -> richer sea-teal deeper out)
          float shallowMask = 1.0 - smoothstep(0.0, 9.0, dLand);
          vec3 baseWater = mix(vec3(0.10, 0.44, 0.54), vec3(0.26, 0.68, 0.68), shallowMask);
          // Mix posterized reflection cleanly over base water
          float objBlock = clamp(isDarkObj + isBoatWhite + isRedAccent + isMidObj * 0.7, 0.0, 1.0);
          float refMix = clamp(0.32 + fresnel * 0.42 + objBlock * 0.34, 0.28, 0.92);
          vec3 waterCol = mix(baseWater, postRef, refMix);

          // Dim gently under passing cloud shadow
          waterCol *= mix(vec3(0.62, 0.78, 0.84), vec3(1.0), sunFac);

          // 5. Crisp Advancing Sea-Gust Capillary Ripple Band sweeping across bay toward quay!
          float gustGlint = smoothstep(0.28, 0.72, gustRipple * 0.5 + 0.5) * gustBand * 0.58;
          waterCol = mix(waterCol, vec3(0.90, 0.99, 0.99), gustGlint * (0.42 + 0.58 * sunFac));

          // 6. Concentric Raindrop Ripples on Harbor Water!
          float rip = rainRipples(p, uTime, uRainIntensity);
          waterCol = mix(waterCol, vec3(0.88, 0.98, 0.98), rip * 0.55);

          // 7. Intermittent Crisp Brassy Warm-Gold Water Sparkles (细碎粼光与黄铜般暖金闪光!)
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 42.0);
          float spCell = sin(p.x * 4.8 + uTime * 2.6) * cos(p.y * 4.4 - uTime * 2.1);
          float spCell2 = sin((p.x - p.y) * 6.5 - uTime * 3.3);
          float sparkleCel = smoothstep(0.46, 0.56, spec * 3.5 + spCell * 0.34 + spCell2 * 0.18) * smoothstep(0.02, 0.16, spec);
          // Subtle ambient diamond glints on sunlit wave crests across open harbor
          float crestGlint = smoothstep(0.86, 0.94, spCell * 0.5 + 0.5) * smoothstep(0.75, 0.92, spCell2 * 0.5 + 0.5) * smoothstep(0.015, 0.045, vWaveH);
          waterCol += vec3(1.0, 0.91, 0.62) * (sparkleCel * 1.25 + crestGlint * 0.95) * pow(sunFac, 1.4);

          // 8. Delicate, Restrained Lacy Cel-Shaded White Foam along Seawalls & Between Tetrapods!
          float tetraDist = 99.0;
          for (int i = 0; i < 14; i++) {
            float td = length(p - uTetras[i]) - 0.64;
            tetraDist = min(tetraDist, td);
          }
          float surge = sin(uTime * 2.1 + p.x * 1.1 + p.y * 0.85) * 0.11 + wakeBoost * 0.34;
          // Shoreline restrained thin lacy foam line
          float wallLace = sin(p.x * 5.8 + p.y * 4.2 + uTime * 2.4) * 0.5 + 0.5;
          float wallFoamRaw = (0.24 + surge * 0.42) - dLand - wallLace * 0.09;
          float wallFoam = smoothstep(0.01, 0.05, wallFoamRaw);
          // Tetrapod surging foam: crisp restrained lacy collar & inner lacy eddy rings (NOT a big solid white blob!)
          float tetRing1 = smoothstep(0.11, 0.02, abs(tetraDist - (0.14 + surge * 0.35)));
          float tetInner = smoothstep(0.04, -0.02, tetraDist - (0.08 + surge * 0.25));
          float lacyCut = sin(p.x * 5.2 - uTime * 2.3) * cos(p.y * 4.9 + uTime * 1.9);
          float lacyCut2 = sin((p.x + p.y) * 7.5 + uTime * 2.8);
          float tetLaceMask = smoothstep(-0.18, 0.22, lacyCut * 0.65 + lacyCut2 * 0.35);
          float tetFoam = max(tetRing1 * (0.55 + 0.45 * tetLaceMask), tetInner * tetLaceMask * 0.92);
          float foamMask = clamp(max(wallFoam * 0.68, tetFoam * 0.92), 0.0, 1.0);
          // Posterize foam edge crisply like anime water foam!
          foamMask = smoothstep(0.38, 0.46, foamMask);
          waterCol = mix(waterCol, vec3(0.96, 0.995, 1.0), foamMask * 0.88);

          // 9. Clear Translucent Alpha (steep view = crystal clear to seabed/fish; grazing & reflection blocks = crisp!)
          float alpha = clamp(0.46 + fresnel * 0.38 + foamMask * 0.45 + rip * 0.18 + objBlock * 0.24, 0.42, 0.94);

          gl_FragColor = vec4(waterCol, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    waterMat.userData.isWater = true;

    const waterSurface = new THREE.Mesh(waterGeo, waterMat);
    waterSurface.position.y = WATER_Y;
    waterSurface.renderOrder = 2;
    group.add(waterSurface);

    // =========================================================================
    // 2. TRANSLUCENT SEA-GLASS TEAL WATER CUTAWAY SIDE WALLS (底座半透明水体剖面)
    // =========================================================================
    const cutawayWaterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GLOBAL_UNIFORMS.uTime,
        uCloudPos: GLOBAL_UNIFORMS.uCloudPos,
        uCloudParams: GLOBAL_UNIFORMS.uCloudParams
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vDepthFrac; // 0 = water surface, 1 = seabed
        attribute float aTopFlag;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          if (aTopFlag > 0.5) {
            float w = sin(wp.x * 0.55 + uTime * 1.15) * 0.028
                    + cos(wp.z * 0.62 - uTime * 0.95) * 0.024
                    + sin((wp.x + wp.z) * 0.92 + uTime * 1.45) * 0.014;
            wp.y += w;
          }
          vWorldPos = wp.xyz;
          vDepthFrac = 1.0 - aTopFlag;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uCloudPos;
        uniform vec2 uCloudParams;
        varying vec3 vWorldPos;
        varying float vDepthFrac;

        void main() {
          // Rich translucent sea-glass cyan-teal cutaway depth gradient (linear values!)
          vec3 topCol = vec3(0.24, 0.72, 0.73);
          vec3 botCol = vec3(0.06, 0.32, 0.43);
          vec3 col = mix(topCol, botCol, smoothstep(0.0, 1.0, vDepthFrac));

          // Delicate animated underwater light shafts streaming down inside cross-section!
          float shaftCoord = (vWorldPos.x + vWorldPos.z) * 0.65 - vWorldPos.y * 0.45;
          float ray = sin(shaftCoord * 2.8 + uTime * 0.85) * 0.5 + 0.5;
          ray *= sin(shaftCoord * 1.7 - uTime * 0.55) * 0.5 + 0.5;
          float rayFade = (1.0 - vDepthFrac * 0.72);
          col += vec3(0.18, 0.32, 0.30) * smoothstep(0.45, 0.85, ray) * rayFade * 0.55;

          // Crisp luminous surface meniscus highlight right along top edge!
          float meniscus = smoothstep(0.055, 0.0, vDepthFrac);
          col = mix(col, vec3(0.88, 0.99, 0.99), meniscus * 0.85);

          // Crisp sea-glass corner refraction edge along vertical cutaway seams!
          float cornerProx = smoothstep(0.35, 0.0, min(abs(abs(vWorldPos.x) - 16.99), abs(abs(vWorldPos.z) - 16.99)));
          col += vec3(0.22, 0.36, 0.38) * cornerProx;

          // Cloud shadow dimming
          vec2 cd = vWorldPos.xz - uCloudPos;
          float cRad = max(uCloudParams.x, 1.0);
          float sunFac = clamp(1.0 - exp(-dot(cd, cd) / (cRad * cRad) * 1.35) * uCloudParams.y, 0.45, 1.0);
          col *= mix(vec3(0.72, 0.84, 0.88), vec3(1.0), sunFac);

          // Crystal-clear aquarium transparency in mid-wall so seabed, sunken tires, anchor chain & fish shine vividly!
          float alpha = mix(0.26, 0.42, vDepthFrac) + meniscus * 0.42 + cornerProx * 0.22;
          gl_FragColor = vec4(col, clamp(alpha, 0.24, 0.82));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    cutawayWaterMat.userData.isWater = true;

    function addWaterCutawayWall(isX, fixedCoord, minC, maxC, flipWinding) {
      const segs = 40;
      const positions = [];
      const topFlags = [];
      const indices = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const c = lerp(minC, maxC, u);
        const x = isX ? fixedCoord : c;
        const z = isX ? c : fixedCoord;
        const bedY = getSeabedY(x, z);
        // Top vertex at WATER_Y
        positions.push(x, WATER_Y, z);
        topFlags.push(1.0);
        // Bottom vertex at seabed
        positions.push(x, bedY, z);
        topFlags.push(0.0);
      }
      for (let i = 0; i < segs; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (flipWinding) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('aTopFlag', new THREE.Float32BufferAttribute(topFlags, 1));
      g.setIndex(indices);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, cutawayWaterMat);
      mesh.renderOrder = 3;
      group.add(mesh);
    }

    // +X Right Cutaway Wall (z from -16.99 to +16.99)
    addWaterCutawayWall(true, HALF - 0.01, -HALF + 0.01, HALF - 0.01, true);
    // +Z Front Cutaway Wall (x from +2.01 to +16.99)
    addWaterCutawayWall(false, HALF - 0.01, 2.01, HALF - 0.01, false);
    // -Z Far Cutaway Wall (x from -5.49 to +16.99)
    addWaterCutawayWall(false, -HALF + 0.01, -5.49, HALF - 0.01, true);

    // =========================================================================
    // 3. FOREGROUND QUAY RAIN PUDDLE WITH TRUE PLANAR REFLECTION! (小水洼倒映船只、灯柱和海鸥)
    //    Located at foreground dip (-1.65, DECK_Y + 0.014, +11.65), right next to instrument cases & umbrella!
    // =========================================================================
    const puddleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GLOBAL_UNIFORMS.uTime,
        uCloudPos: GLOBAL_UNIFORMS.uCloudPos,
        uCloudParams: GLOBAL_UNIFORMS.uCloudParams,
        uRainIntensity: GLOBAL_UNIFORMS.uRainIntensity,
        uPuddleTex: { value: dummyTex }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec4 vClipPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vClipPos = projectionMatrix * viewMatrix * wp;
          gl_Position = vClipPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uCloudPos;
        uniform vec2 uCloudParams;
        uniform float uRainIntensity;
        uniform sampler2D uPuddleTex;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec4 vClipPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }

        void main() {
          // Organic scalloped puddle contour mask!
          vec2 q = (vUv - 0.5) * 2.0;
          float ang = atan(q.y, q.x);
          float edgeR = 0.80 + 0.12 * sin(ang * 3.0 + 0.6) + 0.08 * cos(ang * 5.0 - 1.1);
          float r = length(q);
          if (r > edgeR) discard;

          float mask = smoothstep(edgeR, edgeR - 0.14, r);

          // Concentric tiny puddle raindrop ripples!
          float rip = 0.0;
          vec2 rp = vWorldPos.xz * 1.4;
          vec2 id = floor(rp);
          vec2 gv = fract(rp) - 0.5;
          float rnd = hash21(id + 4.2);
          float ph = fract(uTime / (1.3 + rnd * 0.8) + rnd);
          vec2 cen = (vec2(hash21(id + 1.3), hash21(id + 8.7)) - 0.5) * 0.5;
          float d = length(gv - cen);
          rip = smoothstep(0.028, 0.0, abs(d - ph * 0.42)) * (1.0 - ph) * step(1.0 - uRainIntensity * 0.9, rnd);

          // Sample true planar reflection mirrored across y = DECK_Y!
          vec2 screenUV = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
          vec2 refUV = vec2(screenUV.x, 1.0 - screenUV.y);
          refUV += vec2(sin(vWorldPos.z * 8.0 + uTime * 3.0), cos(vWorldPos.x * 7.0 - uTime * 2.6)) * (0.0025 + rip * 0.012);
          refUV = clamp(refUV, vec2(0.004), vec2(0.996));

          vec3 refCol = texture2D(uPuddleTex, refUV).rgb;
          // Crisp slight anime sky-tint + reflection blend
          vec2 cd = vWorldPos.xz - uCloudPos;
          float sunFac = clamp(1.0 - exp(-dot(cd, cd) / (max(uCloudParams.x, 1.0) * max(uCloudParams.x, 1.0)) * 1.35) * uCloudParams.y, 0.4, 1.0);
          vec3 puddleCol = mix(vec3(0.62, 0.78, 0.82), refCol, 0.84);
          puddleCol *= mix(vec3(0.75, 0.84, 0.88), vec3(1.0), sunFac);
          puddleCol = mix(puddleCol, vec3(0.96, 0.995, 1.0), rip * 0.65);

          // Damp darker ring right around puddle boundary
          float dampRim = smoothstep(edgeR - 0.18, edgeR - 0.02, r);
          puddleCol = mix(puddleCol, vec3(0.58, 0.69, 0.73), dampRim * 0.45);

          gl_FragColor = vec4(puddleCol, mask * 0.90);
        }
      `,
      transparent: true,
      depthWrite: false
    });
    puddleMat.userData.isWater = true;

    const puddleMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.7), puddleMat);
    puddleMesh.rotation.x = -Math.PI / 2;
    puddleMesh.rotation.z = 0.22;
    puddleMesh.position.set(-1.65, DECK_Y + 0.014, 11.75);
    puddleMesh.renderOrder = 2;
    group.add(puddleMesh);

    // =========================================================================
    // 4. HIGH-KEY BRIGHT PALE-CYAN-WHITE ANIME SKY DOME + THIN SUNLIT CLOUDS
    // =========================================================================
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GLOBAL_UNIFORMS.uTime,
        uSunDir: GLOBAL_UNIFORMS.uSunDir,
        uCloudDarkness: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform float uCloudDarkness;
        varying vec3 vDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) {
            s += a * vnoise(p);
            p = p * 2.04 + vec2(17.3, 9.1);
            a *= 0.5;
          }
          return s;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.35, 1.0);

          // High-key airy anime sunlit-rain sky palette (luminous pale sea-glass cyan-white!)
          vec3 zenithCol = vec3(0.42, 0.74, 0.84);
          vec3 midCol    = vec3(0.65, 0.88, 0.92);
          vec3 horizCol  = vec3(0.86, 0.95, 0.94);
          vec3 belowCol  = vec3(0.58, 0.82, 0.88);

          vec3 col = h >= 0.0
            ? mix(horizCol, mix(midCol, zenithCol, smoothstep(0.14, 0.72, h)), smoothstep(0.0, 0.32, h))
            : mix(horizCol, belowCol, smoothstep(0.0, -0.35, h));

          // Soft warm-gold sunlit atmospheric solar glow!
          float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
          float sunHalo = pow(sunDot, 10.0) * 0.24 + pow(sunDot, 72.0) * 0.48;
          col += vec3(1.0, 0.92, 0.68) * sunHalo * (1.0 - uCloudDarkness * 0.65);

          // Thin drifting painterly cel clouds (visible airy wisps in pale cyan sky!)
          if (d.y > 0.01) {
            vec2 cloudUV = d.xz / (d.y + 0.24) * 1.15 + vec2(uTime * 0.012, -uTime * 0.006);
            float n = fbm(cloudUV);
            float cMask = smoothstep(0.45, 0.65, n) * smoothstep(0.01, 0.14, d.y);
            float cCore = smoothstep(0.56, 0.76, n);
            vec3 cloudLit = mix(vec3(0.88, 0.95, 0.96), vec3(1.0, 0.97, 0.88), pow(sunDot, 2.0));
            vec3 cloudShade = vec3(0.55, 0.74, 0.82);
            vec3 cloudCol = mix(cloudShade, cloudLit, 0.48 + 0.52 * cCore);
            col = mix(col, cloudCol, cMask * 0.78);
          }

          // Subtle sky softening when darker cloud veil passes over sun
          col = mix(col, col * vec3(0.84, 0.90, 0.94), uCloudDarkness * 0.55);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });
    skyMat.userData.isSky = true;
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), skyMat);
    skyDome.renderOrder = -10;
    group.add(skyDome);

    // =========================================================================
    // 5. DIAGONAL WARM-GOLD SUNSHOWER RAIN STREAKS (GPU Instanced Shader!)
    //    Tilts steeper during sea gusts, density responds to rain ebb & flow!
    // =========================================================================
    const rainCount = 1400;
    const streakGeo = new THREE.PlaneGeometry(0.022, 1.15);
    const rainInstGeo = new THREE.InstancedBufferGeometry();
    rainInstGeo.index = streakGeo.index;
    rainInstGeo.attributes.position = streakGeo.attributes.position;
    rainInstGeo.attributes.uv = streakGeo.attributes.uv;

    const rOffsets = new Float32Array(rainCount * 3);
    const rSeeds = new Float32Array(rainCount * 2); // (phase, speed/threshold)
    for (let i = 0; i < rainCount; i++) {
      rOffsets[i * 3 + 0] = (rng() - 0.5) * 44.0;
      rOffsets[i * 3 + 1] = rng() * 24.0;
      rOffsets[i * 3 + 2] = (rng() - 0.5) * 44.0;
      rSeeds[i * 2 + 0] = rng();
      rSeeds[i * 2 + 1] = i / rainCount; // normalized density rank [0..1]
    }
    rainInstGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(rOffsets, 3));
    rainInstGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rSeeds, 2));

    const rainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GLOBAL_UNIFORMS.uTime,
        uRainIntensity: GLOBAL_UNIFORMS.uRainIntensity,
        uGustStrength: { value: 0.0 },
        uGustFront: { value: -40.0 },
        uGustDir: { value: new THREE.Vector2(-0.78, -0.625) },
        uCloudPos: GLOBAL_UNIFORMS.uCloudPos,
        uCloudParams: GLOBAL_UNIFORMS.uCloudParams
      },
      vertexShader: `
        attribute vec3 aOffset;
        attribute vec2 aSeed;
        uniform float uTime;
        uniform float uRainIntensity;
        uniform float uGustStrength;
        uniform float uGustFront;
        uniform vec2 uGustDir;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          float isActive = step(aSeed.y, clamp(uRainIntensity * 1.05, 0.25, 1.0));
          // Causal spatial gust propagation: rain streaks tilt steeper IN A WAVE as the sea gust reaches their (x, z)!
          float approxX = mod(aOffset.x + 22.0, 44.0) - 22.0;
          float approxZ = mod(aOffset.z + 22.0, 44.0) - 22.0;
          float gDist = dot(vec2(approxX, approxZ), uGustDir) - uGustFront;
          float localGust = uGustStrength * exp(-(gDist * gDist) / (gDist > 0.0 ? 22.0 : 68.0));

          float slantX = -0.22 - localGust * 0.40;
          float slantZ = -0.16 - localGust * 0.30;
          float speed = 13.5 + aSeed.x * 5.0 + localGust * 4.0;
          float fallH = 24.0;
          float cycleY = mod(aOffset.y - uTime * speed, fallH);
          float y = cycleY - 1.0;
          float x = aOffset.x + (fallH - cycleY) * slantX;
          float z = aOffset.z + (fallH - cycleY) * slantZ;
          x = mod(x + 22.0, 44.0) - 22.0;
          z = mod(z + 22.0, 44.0) - 22.0;

          vec3 center = vec3(x, y, z);
          vec3 streakDir = normalize(vec3(slantX, -1.0, slantZ));
          vec3 toCam = normalize(cameraPosition - center);
          vec3 sideDir = normalize(cross(toCam, streakDir));

          float streakLen = 0.85 + aSeed.x * 0.55 + localGust * 0.28;
          vec3 wp = center + sideDir * position.x + streakDir * (position.y * streakLen);
          vWorldPos = wp;

          // Fade cleanly near top, ground floor & camera lens (prevents oversized near-lens streak photobomb!)
          float camDist = length(cameraPosition - center);
          float camFade = smoothstep(2.6, 6.2, camDist);
          float yFade = smoothstep(-0.4, 1.4, y) * smoothstep(23.0, 17.5, y);
          vAlpha = isActive * yFade * camFade * (0.42 + 0.35 * aSeed.x);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec2 uCloudPos;
        uniform vec2 uCloudParams;
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vWorldPos;

        void main() {
          if (vAlpha < 0.01) discard;
          // Tapered glowing needle silhouette
          float edgeX = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float edgeY = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
          float shape = smoothstep(0.0, 0.6, edgeX) * edgeY;

          // Warm golden sunlit glint in sunbeams vs cool pale cyan inside cloud shadow!
          vec2 cd = vWorldPos.xz - uCloudPos;
          float cRad = max(uCloudParams.x, 1.0);
          float sunFac = clamp(1.0 - exp(-dot(cd, cd) / (cRad * cRad) * 1.35) * uCloudParams.y, 0.25, 1.0);
          vec3 rainCol = mix(vec3(0.76, 0.92, 0.96), vec3(1.0, 0.92, 0.62), 0.82 * sunFac);
          gl_FragColor = vec4(rainCol, shape * vAlpha * (0.62 + 0.45 * sunFac));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    rainMat.userData.isFX = true;

    const rainMesh = new THREE.Mesh(rainInstGeo, rainMat);
    rainMesh.frustumCulled = false;
    rainMesh.renderOrder = 8;
    group.add(rainMesh);

    // =========================================================================
    // 6. EDGE DRIPPING WATER BEADS (伞沿、灯罩、船舷偶尔滴水!)
    // =========================================================================
    const dripPoints = (propsRef && propsRef.dripPoints) ? propsRef.dripPoints : [];
    const dripBeadMat = new THREE.MeshBasicMaterial({ color: 0xfff8dc, transparent: true, opacity: 0.9 });
    dripBeadMat.userData.isFX = true;
    const dripRingMat = new THREE.MeshBasicMaterial({ color: 0xf4fbfc, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    dripRingMat.userData.isFX = true;

    const dripBeadGeo = new THREE.SphereGeometry(0.026, 7, 6);
    dripBeadGeo.scale(0.8, 1.35, 0.8);
    const dripRingGeo = new THREE.RingGeometry(0.05, 0.08, 16);
    dripRingGeo.rotateX(-Math.PI / 2);

    const dripActors = dripPoints.map((dp) => {
      const bead = new THREE.Mesh(dripBeadGeo, dripBeadMat);
      const ring = new THREE.Mesh(dripRingGeo, dripRingMat.clone());
      ring.position.set(dp.pos.x, dp.floorY, dp.pos.z);
      group.add(bead, ring);
      return { dp, bead, ring, period: 2.8 + (dp.phase % 1.9) };
    });

    // =========================================================================
    // 7. FAINT CEL-SHADED RAINBOW ARC OVER DISTANT SEA (雨势转弱时浮现的极淡彩虹!)
    // =========================================================================
    const rainbowMat = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vWorldY;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec2 vUv;
        varying float vWorldY;
        void main() {
          if (uAlpha < 0.005 || vWorldY < 0.45) discard;
          // Radial bands across ring height (vUv.y = 0 inner violet -> 1 outer rose-red)
          float r = vUv.y;
          // Delicate pastel anime cel-stepped 6-color rainbow palette!
          vec3 col = vec3(0.70, 0.64, 0.98);
          col = mix(col, vec3(0.54, 0.82, 0.98), smoothstep(0.14, 0.21, r));
          col = mix(col, vec3(0.58, 0.94, 0.78), smoothstep(0.32, 0.39, r));
          col = mix(col, vec3(0.98, 0.94, 0.56), smoothstep(0.50, 0.57, r));
          col = mix(col, vec3(0.98, 0.76, 0.52), smoothstep(0.68, 0.75, r));
          col = mix(col, vec3(0.96, 0.58, 0.60), smoothstep(0.84, 0.91, r));

          float radialFade = smoothstep(0.0, 0.16, r) * smoothstep(1.0, 0.84, r);
          float arcFade = smoothstep(0.0, 0.20, vUv.x) * smoothstep(1.0, 0.80, vUv.x);
          // Fade out cleanly above the sea horizon so rainbow NEVER bleeds through underwater cutaway glass!
          float horizonMask = smoothstep(0.45, 5.6, vWorldY);
          gl_FragColor = vec4(col, radialFade * arcFade * horizonMask * uAlpha * 0.72);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    rainbowMat.userData.isFX = true;

    // Build wide curved rainbow ribbon arcing high behind the breakwater & lighthouse (z = -68!)
    const rbSegs = 40;
    const rbInnerR = 38.0, rbOuterR = 44.0;
    const rbPos = [], rbUv = [], rbIdx = [];
    for (let i = 0; i <= rbSegs; i++) {
      const u = i / rbSegs;
      const ang = lerp(0.14, Math.PI - 0.14, u);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      rbPos.push(ca * rbInnerR, sa * rbInnerR, 0);
      rbUv.push(u, 0);
      rbPos.push(ca * rbOuterR, sa * rbOuterR, 0);
      rbUv.push(u, 1);
      if (i < rbSegs) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        rbIdx.push(a, b, c, b, d, c);
      }
    }
    const rbGeo = new THREE.BufferGeometry();
    rbGeo.setAttribute('position', new THREE.Float32BufferAttribute(rbPos, 3));
    rbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rbUv, 2));
    rbGeo.setIndex(rbIdx);
    const rainbowMesh = new THREE.Mesh(rbGeo, rainbowMat);
    rainbowMesh.position.set(10, -10, -72); // arches gracefully over the open sea & lighthouse!
    rainbowMesh.rotation.y = 0.18;
    rainbowMesh.renderOrder = -2;
    group.add(rainbowMesh);

    // =========================================================================
    // 8. DISTANT CEL-STYLED SEA MIST RIBBONS (远处海面极淡的雾气缓慢流动)
    // =========================================================================
    const mistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: GLOBAL_UNIFORMS.uTime },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float x = vUv.x + uTime * 0.014;
          float w = sin(x * 12.0) * 0.5 + 0.5;
          float w2 = cos(x * 7.5 - vUv.y * 4.0) * 0.5 + 0.5;
          float celMist = smoothstep(0.32, 0.58, w * 0.6 + w2 * 0.4);
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x)
                     * smoothstep(0.0, 0.30, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
          gl_FragColor = vec4(0.92, 0.98, 0.98, celMist * edge * 0.34);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    mistMat.userData.isFX = true;

    const mistRibbons = [];
    [
      { x: 10, y: 2.2, z: -46, w: 72, h: 6.5 },
      { x: 24, y: 3.4, z: -60, w: 86, h: 8.5 },
      { x: -8, y: 1.8, z: -53, w: 58, h: 5.5 }
    ].forEach((ms) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ms.w, ms.h), mistMat);
      m.position.set(ms.x, ms.y, ms.z);
      m.renderOrder = -1;
      group.add(m);
      mistRibbons.push(m);
    });

    // =========================================================================
    // Frame Update
    // =========================================================================
    function update(t, wakeSources) {
      const gust = evaluateGust(t);
      const cloud = evaluateCloud(t);
      const rain = evaluateRain(t);

      waterMat.uniforms.uGustStrength.value = gust.strength;
      waterMat.uniforms.uGustFront.value = gust.frontPos;
      rainMat.uniforms.uGustStrength.value = gust.strength;
      rainMat.uniforms.uGustFront.value = gust.frontPos;
      skyMat.uniforms.uCloudDarkness.value = cloud.darkness;
      rainbowMat.uniforms.uAlpha.value = rain.rainbowAlpha;
      rainbowMesh.visible = rain.rainbowAlpha > 0.005;

      // Update Boat 4 wake ring uniforms on water surface
      for (let i = 0; i < maxWakes; i++) {
        if (wakeSources && i < wakeSources.length) {
          const ws = wakeSources[i];
          wakeUniformArr[i].set(ws.x, ws.z, ws.radius, ws.strength);
        } else {
          wakeUniformArr[i].set(999, 999, 0, 0);
        }
      }

      // Update glistening edge drip beads & impact ripple rings (staggered rhythms!)
      for (let i = 0; i < dripActors.length; i++) {
        const da = dripActors[i];
        const phase = ((t + da.dp.phase) % da.period) / da.period;
        const dropH = Math.max(0.2, da.dp.pos.y - da.dp.floorY);
        if (phase < 0.55) {
          // Swelling bead hanging at edge
          const swell = phase / 0.55;
          da.bead.visible = true;
          da.bead.position.copy(da.dp.pos);
          da.bead.position.y -= swell * 0.02;
          da.bead.scale.setScalar(0.35 + swell * 0.75);
          da.ring.visible = false;
        } else if (phase < 0.74) {
          // Free-fall under gravity!
          const fallU = (phase - 0.55) / 0.19;
          da.bead.visible = true;
          da.bead.position.set(da.dp.pos.x, da.dp.pos.y - fallU * fallU * dropH, da.dp.pos.z);
          da.bead.scale.set(0.75, 1.55, 0.75);
          da.ring.visible = false;
        } else {
          // Tiny expanding concentric impact splash ring!
          const ripU = (phase - 0.74) / 0.26;
          da.bead.visible = false;
          da.ring.visible = true;
          da.ring.scale.setScalar(0.5 + ripU * 4.5);
          da.ring.material.opacity = (1.0 - ripU) * 0.65;
        }
      }
    }

    function setReflectionTextures(waterRefTex, puddleRefTex) {
      waterMat.uniforms.uReflectTex.value = waterRefTex;
      puddleMat.uniforms.uPuddleTex.value = puddleRefTex;
    }

    return {
      group,
      waterSurface,
      puddleMesh,
      setReflectionTextures,
      update
    };
  }

  window.HARBOR_WATER = { buildWaterAndWeather };
})();
