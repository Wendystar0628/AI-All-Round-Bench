// Anime Cel-Shading (三渲二) Material Factory with global Cloud Shadow, Wet Sheen, Rim Light & Swaying Water Caustics
(function () {
  const { PALETTE, SUN_DIR } = window.HARBOR;

  // Shared global uniforms updated once per frame for all cel materials
  const GLOBAL_UNIFORMS = {
    uTime: { value: 0.0 },
    uSunDir: { value: SUN_DIR.clone() },
    uCloudPos: { value: new THREE.Vector2(50, 50) },
    uCloudParams: { value: new THREE.Vector2(16.0, 0.0) }, // (radius, darkness)
    uSunColor: { value: new THREE.Color(0xfff4d4) },
    uSkyColor: { value: new THREE.Color(0xdaf4f8) },
    uShadowTint: { value: new THREE.Color(0x285c70) },
    uRainIntensity: { value: 0.65 }
  };

  // Crisp anime 4-band cel gradient map (soft-edged high-key steps, never harsh black)
  function createToonGradientMap() {
    const width = 64;
    const data = new Uint8Array(width * 4);
    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      // High-key anime ramp: shadow floor lifted to 0.56 (cool tinted later), midtone 0.80, lit 1.0
      let v;
      if (t < 0.34) {
        v = 0.56;
      } else if (t < 0.42) {
        const u = (t - 0.34) / 0.08;
        v = 0.56 + (0.83 - 0.56) * (u * u * (3 - 2 * u));
      } else if (t < 0.72) {
        v = 0.83;
      } else if (t < 0.80) {
        const u = (t - 0.72) / 0.08;
        v = 0.83 + (1.0 - 0.83) * (u * u * (3 - 2 * u));
      } else {
        v = 1.0;
      }
      const b = Math.round(v * 255);
      data[i * 4 + 0] = b;
      data[i * 4 + 1] = b;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  const TOON_GRADIENT = createToonGradientMap();

  /**
   * Create an anime cel-shaded material with optional:
   * - wetness (0..1): rain-slicked sky reflection & warm sun specular glint
   * - rim (0..1): sunlit/sky Fresnel rim edge
   * - caustics (0..1): swaying water-surface caustic light pattern (for cabin roofs, warehouse ceiling, seabed)
   * - causticsMode: 0 = upward ceiling bounce (interior/cabin), 1 = underwater seabed caustics
   * - shadowStrength (0..1): deep sea-teal shadow tint intensity
   * - windSway (0..1): optional foliage/fabric gentle gust sway in vertex shader
   */
  function createCelMaterial(opts) {
    const o = opts || {};
    const mat = new THREE.MeshToonMaterial({
      color: o.color !== undefined ? o.color : 0xffffff,
      map: o.map || null,
      alphaMap: o.alphaMap || null,
      emissive: o.emissive !== undefined ? new THREE.Color(o.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: o.emissiveIntensity !== undefined ? o.emissiveIntensity : 1.0,
      emissiveMap: o.emissiveMap || null,
      gradientMap: TOON_GRADIENT,
      transparent: !!o.transparent,
      opacity: o.opacity !== undefined ? o.opacity : 1.0,
      alphaTest: o.alphaTest !== undefined ? o.alphaTest : 0.0,
      side: o.side !== undefined ? o.side : THREE.FrontSide,
      vertexColors: !!o.vertexColors,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : !o.transparent
    });

    const wetness = o.wetness !== undefined ? o.wetness : 0.22;
    const rim = o.rim !== undefined ? o.rim : 0.24;
    const caustics = o.caustics !== undefined ? o.caustics : 0.0;
    const causticsMode = o.causticsMode !== undefined ? o.causticsMode : 0.0;
    const shadowStrength = o.shadowStrength !== undefined ? o.shadowStrength : 0.42;
    const noCloudShadow = o.noCloudShadow ? 1.0 : 0.0;
    const wetMap = o.wetnessMap || null;

    mat.userData.celOpts = { wetness, rim, caustics, causticsMode, shadowStrength };

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = GLOBAL_UNIFORMS.uTime;
      shader.uniforms.uSunDir = GLOBAL_UNIFORMS.uSunDir;
      shader.uniforms.uCloudPos = GLOBAL_UNIFORMS.uCloudPos;
      shader.uniforms.uCloudParams = GLOBAL_UNIFORMS.uCloudParams;
      shader.uniforms.uSunColor = GLOBAL_UNIFORMS.uSunColor;
      shader.uniforms.uSkyColor = GLOBAL_UNIFORMS.uSkyColor;
      shader.uniforms.uShadowTint = GLOBAL_UNIFORMS.uShadowTint;
      shader.uniforms.uWetness = { value: wetness };
      shader.uniforms.uRim = { value: rim };
      shader.uniforms.uCaustics = { value: caustics };
      shader.uniforms.uCausticsMode = { value: causticsMode };
      shader.uniforms.uShadowStrength = { value: shadowStrength };
      shader.uniforms.uNoCloudShadow = { value: noCloudShadow };
      if (wetMap) {
        shader.uniforms.uWetMap = { value: wetMap };
      }

      // Inject world position & world normal varyings into vertex shader safely (works with InstancedMesh too)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vCelWorldPos;
           varying vec3 vCelWorldNormal;
           varying vec2 vCelWetUv;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec4 celWp = vec4(transformed, 1.0);
           vec3 celWn = objectNormal;
           #ifdef USE_INSTANCING
             celWp = instanceMatrix * celWp;
             celWn = mat3(instanceMatrix) * celWn;
           #endif
           celWp = modelMatrix * celWp;
           vCelWorldPos = celWp.xyz;
           vCelWorldNormal = normalize(mat3(modelMatrix) * celWn);
           #ifdef USE_UV
             vCelWetUv = uv;
           #else
             vCelWetUv = celWp.xz * 0.1;
           #endif`
        );

      const wetDecl = wetMap
        ? 'uniform sampler2D uWetMap;'
        : '';
      const wetSample = wetMap
        ? 'float wetMask = texture2D(uWetMap, vCelWetUv * 3.2).r;'
        : 'float wetMask = 1.0;';

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform vec3 uSunDir;
           uniform vec2 uCloudPos;
           uniform vec2 uCloudParams;
           uniform vec3 uSunColor;
           uniform vec3 uSkyColor;
           uniform vec3 uShadowTint;
           uniform float uWetness;
           uniform float uRim;
           uniform float uCaustics;
           uniform float uCausticsMode;
           uniform float uShadowStrength;
           uniform float uNoCloudShadow;
           ${wetDecl}
           varying vec3 vCelWorldPos;
           varying vec3 vCelWorldNormal;
           varying vec2 vCelWetUv;

           // Lightweight anime stylized water-caustic wave lattice
           float celCausticPattern(vec2 p, float t) {
             vec2 p1 = p * 1.45 + vec2(t * 0.42, t * 0.28);
             vec2 p2 = p * 1.95 - vec2(t * 0.34, -t * 0.48);
             float w1 = sin(p1.x + sin(p1.y * 1.2 + t * 0.7)) * 0.5 + 0.5;
             float w2 = sin(p2.y + cos(p2.x * 1.3 - t * 0.6)) * 0.5 + 0.5;
             float net = pow(abs(w1 - w2), 0.65);
             // Crisp cel-like caustic ridges
             return smoothstep(0.42, 0.76, 1.0 - net);
           }`
        )
        .replace(
          '#include <dithering_fragment>',
          `{
             vec3 wn = normalize(vCelWorldNormal);
             vec3 viewDirW = normalize(cameraPosition - vCelWorldPos);
             float ndl = dot(wn, uSunDir);

             // 1. Moving Cloud Shadow across diorama base
             vec2 cd = vCelWorldPos.xz - uCloudPos;
             float cRad = max(uCloudParams.x, 1.0);
             float cloudMask = exp(-dot(cd, cd) / (cRad * cRad) * 1.35) * uCloudParams.y * (1.0 - uNoCloudShadow);
             float sunFac = clamp(1.0 - cloudMask, 0.34, 1.0);

             // Apply gentle cloud shadow dimming (tinted slightly cool sea-teal)
             vec3 shadowedCol = gl_FragColor.rgb * mix(vec3(0.68, 0.80, 0.86), vec3(1.0), sunFac);
             gl_FragColor.rgb = shadowedCol;

             // 2. Deep Sea-Glass Teal Shadow Tint on faces turned away from sun
             float coolShade = 1.0 - smoothstep(-0.18, 0.28, ndl);
             vec3 tealLifted = mix(gl_FragColor.rgb, gl_FragColor.rgb * mix(vec3(1.0), uShadowTint * 2.15, 0.55), coolShade * uShadowStrength);
             // Slight warm-gold kiss on bright sun-facing surfaces
             float sunKiss = smoothstep(0.25, 0.75, ndl) * sunFac;
             gl_FragColor.rgb = mix(tealLifted, tealLifted * vec3(1.03, 1.01, 0.96), sunKiss * 0.45);

             // 3. Wet Rain-Slicked Sky Reflection & Warm-Gold Cel Specular Patch
             if (uWetness > 0.01) {
               ${wetSample}
               float effWet = uWetness * (0.40 + 0.60 * wetMask);
               vec3 halfV = normalize(uSunDir + viewDirW);
               float ndh = max(dot(wn, halfV), 0.0);
               // Crisp anime-stepped warm-gold sun glint (clear yet never harsh!)
               float specRaw = pow(ndh, 30.0);
               float specCel = smoothstep(0.14, 0.42, specRaw) * effWet * sunFac;
               // Soft luminous cyan-white sky reflection across rain-wet surfaces!
               float fresnel = pow(1.0 - max(dot(wn, viewDirW), 0.0), 2.7);
               float upFac = smoothstep(0.35, 0.95, wn.y);
               vec3 skySheen = uSkyColor * (0.16 * upFac + 0.28 * fresnel * upFac) * effWet * (0.52 + 0.48 * sunFac);
               gl_FragColor.rgb += skySheen + uSunColor * specCel * 0.44;
             }

             // 4. Delicate Anime Fresnel Rim Light
             if (uRim > 0.01) {
               float rimRaw = pow(1.0 - max(dot(wn, viewDirW), 0.0), 3.4);
               float rimStep = smoothstep(0.38, 0.72, rimRaw);
               float sunAlign = smoothstep(-0.2, 0.65, ndl) * sunFac;
               vec3 rimCol = mix(uSkyColor * 0.45, uSunColor * 0.85, sunAlign);
               gl_FragColor.rgb += rimCol * rimStep * uRim * 0.42;
             }

             // 5. Swaying Water-Surface Caustic Reflections (ceiling bounce & underwater seabed)
             if (uCaustics > 0.01) {
               float caust = celCausticPattern(vCelWorldPos.xz * 0.85 + vec2(vCelWorldPos.y * 0.3), uTime * 1.15);
               if (uCausticsMode < 0.5) {
                 // Upward bounce onto ceilings, roof undersides & upper interior walls (clearly visible swaying water shimmer!)
                 float downFace = smoothstep(0.25, -0.45, wn.y) * 0.65 + 0.35;
                 vec3 cCol = mix(vec3(0.50, 0.96, 0.94), vec3(1.0, 0.94, 0.68), 0.50);
                 gl_FragColor.rgb += cCol * caust * uCaustics * downFace * (0.42 + 0.58 * sunFac) * 0.78;
               } else {
                 // Underwater seabed caustics
                 float subFade = smoothstep(-0.05, -0.5, vCelWorldPos.y);
                 vec3 cCol = vec3(0.72, 0.98, 0.94);
                 gl_FragColor.rgb += cCol * caust * uCaustics * subFade * (0.3 + 0.7 * sunFac) * 0.42;
               }
             }
           }
           #include <dithering_fragment>`
        );
    };

    // Unique cache key per configuration combination
    mat.customProgramCacheKey = function () {
      return `cel_${wetMap ? 1 : 0}_${caustics > 0 ? 1 : 0}_${causticsMode}_${noCloudShadow}`;
    };

    return mat;
  }

  // Clear Anime Architectural / Cabin / Umbrella Glass Material (high visibility into interiors + delicate diagonal shine)
  function createAnimeGlassMaterial(opts) {
    const o = opts || {};
    const tint = new THREE.Color(o.color !== undefined ? o.color : 0xdff7fa);
    const opacity = o.opacity !== undefined ? o.opacity : 0.22;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: tint },
        uOpacity: { value: opacity },
        uTime: GLOBAL_UNIFORMS.uTime,
        uSunDir: GLOBAL_UNIFORMS.uSunDir,
        uSunColor: GLOBAL_UNIFORMS.uSunColor,
        uCloudPos: GLOBAL_UNIFORMS.uCloudPos,
        uCloudParams: GLOBAL_UNIFORMS.uCloudParams,
        uRainDrops: { value: o.rainDrops ? 1.0 : 0.0 }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vWorldNorm;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNorm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec2 uCloudPos;
        uniform vec2 uCloudParams;
        uniform float uRainDrops;
        varying vec3 vWorldPos;
        varying vec3 vWorldNorm;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 n = normalize(vWorldNorm);
          if (!gl_FrontFacing) n = -n;
          vec3 v = normalize(cameraPosition - vWorldPos);
          float ndv = abs(dot(n, v));
          float fresnel = pow(1.0 - ndv, 2.4);

          // Anime diagonal glass shine ribbons (subtle so interior stays crystal clear!)
          float diag = fract(vUv.x * 0.9 + vUv.y * 0.65);
          float streak1 = smoothstep(0.18, 0.20, diag) * (1.0 - smoothstep(0.24, 0.26, diag));
          float streak2 = smoothstep(0.29, 0.30, diag) * (1.0 - smoothstep(0.32, 0.33, diag));
          float sheen = (streak1 * 0.22 + streak2 * 0.14);

          // Cloud shadow factor
          vec2 cd = vWorldPos.xz - uCloudPos;
          float cRad = max(uCloudParams.x, 1.0);
          float sunFac = clamp(1.0 - exp(-dot(cd, cd) / (cRad * cRad) * 1.35) * uCloudParams.y, 0.35, 1.0);

          // Sparkling rain beads on umbrella / glass when enabled
          float drops = 0.0;
          if (uRainDrops > 0.5) {
            vec2 grid = vUv * vec2(14.0, 14.0);
            vec2 id = floor(grid);
            vec2 gv = fract(grid) - 0.5;
            float rnd = hash21(id);
            vec2 pos = vec2((rnd - 0.5) * 0.45, fract(rnd * 7.13 - uTime * (0.08 + rnd * 0.12)) - 0.5);
            float d = length((gv - pos) * vec2(1.0, 0.72));
            drops = smoothstep(0.13, 0.04, d) * step(0.45, rnd);
          }

          vec3 col = mix(uColor, vec3(0.97, 0.99, 1.0), fresnel * 0.65 + sheen);
          col += uSunColor * drops * (0.75 * sunFac);
          float alpha = clamp(uOpacity * 0.72 + fresnel * 0.30 + sheen * 0.42 + drops * 0.55, 0.08, 0.78);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: o.side !== undefined ? o.side : THREE.DoubleSide
    });
    mat.userData.isGlass = true;
    return mat;
  }

  // Pale-Golden Volumetric Sunlight Shaft Material (仓库高窗与船舱玻璃的淡金色光柱)
  function createGodRayMaterial(opacity) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: GLOBAL_UNIFORMS.uTime,
        uOpacity: { value: opacity !== undefined ? opacity : 0.26 },
        uCloudPos: GLOBAL_UNIFORMS.uCloudPos,
        uCloudParams: GLOBAL_UNIFORMS.uCloudParams
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec2 uCloudPos;
        uniform vec2 uCloudParams;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float edgeSoft = pow(abs(dot(normalize(vNormalW), viewDir)), 0.70);
          // Smooth horizontal feathering so volumetric beam never shows hard rectangular polygon edges!
          float sideFade = smoothstep(0.0, 0.30, vUv.x) * smoothstep(1.0, 0.70, vUv.x);
          // Fade softly along beam length (bright near clerestory window vUv.y=1, dissolving softly at floor vUv.y=0)
          float lenFade = smoothstep(0.0, 0.28, vUv.y) * smoothstep(1.0, 0.74, vUv.y);
          // Sparkling diagonal golden rain streaks slicing cleanly through the light shaft!
          float streakCoord = vUv.x * 16.0 - vUv.y * 9.0;
          float rainStreak = sin(streakCoord * 3.2 + uTime * 9.5) * 0.5 + 0.5;
          float sparkMask = sin(vUv.x * 37.0 + vUv.y * 19.0 - uTime * 11.0) * 0.5 + 0.5;
          float shimmer = smoothstep(0.74, 0.96, rainStreak * sparkMask) * 0.85;
          // Dim smoothly together with cloud shadow!
          vec2 cd = vWorldPos.xz - uCloudPos;
          float cRad = max(uCloudParams.x, 1.0);
          float sunFac = clamp(1.0 - exp(-dot(cd, cd) / (cRad * cRad) * 1.35) * uCloudParams.y, 0.10, 1.0);
          vec3 col = mix(vec3(1.0, 0.94, 0.74), vec3(1.0, 0.98, 0.86), shimmer);
          float a = uOpacity * sideFade * lenFade * (0.50 + 0.50 * edgeSoft) * (0.85 + shimmer * 1.25) * pow(sunFac, 1.5);
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    mat.userData.isFX = true;
    return mat;
  }

  function updateGlobalUniforms(t) {
    const cloud = window.HARBOR.evaluateCloud(t);
    const rain = window.HARBOR.evaluateRain(t);
    GLOBAL_UNIFORMS.uTime.value = t;
    GLOBAL_UNIFORMS.uCloudPos.value.set(cloud.cloudX, cloud.cloudZ);
    GLOBAL_UNIFORMS.uCloudParams.value.set(cloud.cloudRadius, cloud.darkness);
    GLOBAL_UNIFORMS.uRainIntensity.value = rain.intensity;
  }

  window.HARBOR_MATERIALS = {
    GLOBAL_UNIFORMS,
    TOON_GRADIENT,
    createCelMaterial,
    createAnimeGlassMaterial,
    createGodRayMaterial,
    updateGlobalUniforms
  };
})();
