/* =====================================================================
   materials.js — 三渲二材质体系（分段光照 + 硬高光 + 描边）
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;

  /* ---------------- 共享 uniform ---------------- */
  const shared = {
    uSunDirView: { value: new THREE.Vector3(0.4, 0.8, 0.45) },
    uCloudTex: { value: null },
    uCloudOffset: { value: new THREE.Vector2(0, 0) },
    uCloudScale: { value: 0.011 },
    uCloudAmt: { value: 0.34 },
    uTime: { value: 0 },
    uSkyTint: { value: new THREE.Color(0xcfe6ee) },
  };
  TY.shared = shared;

  /* 描边（倒挂外壳）共享 uniform */
  const outlineU = {
    uPx: { value: 1.25 },
    uScale: { value: 0.002 },
    uColor: { value: new THREE.Color(0x2c4149) },
    uOpacity: { value: 1.0 },
  };
  TY.outlineU = outlineU;

  /* ---------------- 阶梯色带 ---------------- */
  const gradCache = new Map();
  function gradient(steps, contrast) {
    const key = steps + '_' + (contrast || 0);
    if (gradCache.has(key)) return gradCache.get(key);
    const data = new Uint8Array(steps * 4);
    for (let i = 0; i < steps; i++) {
      let v = i / (steps - 1);
      v = Math.pow(v, contrast || 0.85);
      const c = Math.round(62 + v * 193);
      data[i * 4] = c; data[i * 4 + 1] = c; data[i * 4 + 2] = c; data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    gradCache.set(key, t);
    return t;
  }

  /* ---------------- toon 材质 ---------------- */
  const toonFragHead = [
    'uniform vec3 uSunDirView;',
    'uniform vec3 uSpecColor;',
    'uniform float uSpecStrength;',
    'uniform float uSpecPower;',
    'uniform float uSpecThresh;',
    'uniform vec3 uRimColor;',
    'uniform float uRimStrength;',
    'uniform float uRimPower;',
    'uniform sampler2D uCloudTex;',
    'uniform vec2 uCloudOffset;',
    'uniform float uCloudScale;',
    'uniform float uCloudAmt;',
    'uniform float uTime;',
    'varying vec3 vVPos;',
    'varying vec3 vWPos;',
  ].join('\n');

  function toon(o) {
    o = o || {};
    const mat = new THREE.MeshToonMaterial({
      color: o.color !== undefined ? o.color : 0xffffff,
      map: o.map || null,
      gradientMap: o.gradientMap || gradient(o.steps || 3, o.contrast),
      transparent: !!o.transparent,
      opacity: o.opacity === undefined ? 1 : o.opacity,
      side: o.side === undefined ? THREE.FrontSide : o.side,
      emissive: o.emissive === undefined ? 0x000000 : o.emissive,
      emissiveIntensity: o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity,
      vertexColors: !!o.vertexColors,
      alphaTest: o.alphaTest || 0,
      depthWrite: o.depthWrite === undefined ? true : o.depthWrite,
      alphaMap: o.alphaMap || null,
    });
    const spec = o.spec || {};
    const rim = o.rim || {};
    const key = 'toon|' + (o.spec ? 1 : 0) + (o.rim ? 1 : 0) + (o.cloud === false ? 0 : 1) +
      (o.worldPos ? 1 : 0);

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDirView = shared.uSunDirView;
      shader.uniforms.uSpecColor = { value: new THREE.Color(spec.color === undefined ? 0xffffff : spec.color) };
      shader.uniforms.uSpecStrength = { value: spec.strength === undefined ? 0.0 : spec.strength };
      shader.uniforms.uSpecPower = { value: spec.power === undefined ? 48 : spec.power };
      shader.uniforms.uSpecThresh = { value: spec.thresh === undefined ? 0.45 : spec.thresh };
      shader.uniforms.uRimColor = { value: new THREE.Color(rim.color === undefined ? 0xdff2ff : rim.color) };
      shader.uniforms.uRimStrength = { value: rim.strength === undefined ? 0.0 : rim.strength };
      shader.uniforms.uRimPower = { value: rim.power === undefined ? 3.0 : rim.power };
      shader.uniforms.uCloudTex = shared.uCloudTex;
      shader.uniforms.uCloudOffset = shared.uCloudOffset;
      shader.uniforms.uCloudScale = shared.uCloudScale;
      shader.uniforms.uCloudAmt = shared.uCloudAmt;
      shader.uniforms.uTime = shared.uTime;

      shader.vertexShader = 'varying vec3 vVPos;\nvarying vec3 vWPos;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vVPos = mvPosition.xyz;\n  vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;'
      );

      shader.fragmentShader = toonFragHead + '\n' + shader.fragmentShader;

      if (o.cloud !== false) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
           float _cf = texture2D(uCloudTex, (vWPos.xz + uCloudOffset) * uCloudScale).r;
           _cf = mix(1.0 - uCloudAmt, 1.0, smoothstep(0.18, 0.78, _cf));
           reflectedLight.directDiffuse *= _cf;
           reflectedLight.indirectDiffuse *= mix(1.0, _cf, 0.4);`
        );
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
           vec3 _V = normalize(-vVPos);
           vec3 _N = normalize(normal);
           float _sp = 0.0;
           if (uSpecStrength > 0.001) {
             vec3 _H = normalize(_V + uSunDirView);
             _sp = pow(max(dot(_N, _H), 0.0), uSpecPower);
             _sp = smoothstep(uSpecThresh, uSpecThresh + 0.02, _sp) * uSpecStrength;
           }
           float _rim = 0.0;
           if (uRimStrength > 0.001) {
             _rim = pow(1.0 - max(dot(_N, _V), 0.0), uRimPower) * uRimStrength;
           }
           outgoingLight += uSpecColor * _sp + uRimColor * _rim;
         }
         #include <opaque_fragment>`
      );
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }

  /* ---------------- 描边 ---------------- */
  const outlineMatCache = new Map();
  function outlineMaterial(px, color) {
    const w = Math.round(px * 20) / 20;
    const k = w + '|' + (color || 0);
    if (outlineMatCache.has(k)) return outlineMatCache.get(k);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uPx: { value: w },
        uScale: outlineU.uScale,
        uColor: { value: new THREE.Color(color === undefined ? 0x2c4149 : color) },
        uOpacity: { value: 1 },
      },
      vertexShader: [
        'attribute vec3 smoothNormal;',
        'uniform float uPx;',
        'uniform float uScale;',
        'varying float vD;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  vec3 n = normalize(normalMatrix * smoothNormal);',
        '  float d = max(-mv.z, 0.05);',
        '  mv.xyz += n * (uPx * uScale * d);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uOpacity;',
        'void main(){ gl_FragColor = vec4(uColor, uOpacity); }'
      ].join('\n'),
      side: THREE.BackSide,
      transparent: false,
      depthWrite: true,
    });
    outlineMatCache.set(k, m);
    return m;
  }

  const outline = {
    material: outlineMaterial,
    attach(mesh, px, color) {
      if (!mesh.geometry) return null;
      if (!mesh.geometry.__smoothGeo) {
        try { mesh.geometry.__smoothGeo = U.smoothNormals(mesh.geometry); }
        catch (e) { return null; }
      }
      const om = new THREE.Mesh(mesh.geometry.__smoothGeo, outlineMaterial(px === undefined ? 1.25 : px, color));
      om.renderOrder = -1;
      om.castShadow = false;
      om.receiveShadow = false;
      om.frustumCulled = mesh.frustumCulled;
      om.name = 'outline';
      mesh.add(om);
      return om;
    },
  };
  TY.outline = outline;

  /* ---------------- 材质库 ---------------- */
  const TX = TY.tex;
  const T = {};

  function build() {
    const cWet = TX.tex(TX.wetConcreteCanvas(512), 1, 1);
    const cSide = TX.tex(TX.blockWallCanvas(256), 1, 1);
    const cWall = TX.tex(TX.seawallCanvas(256), 1, 1);
    const cHull = TX.tex(TX.hullCanvas(256), 1, 1);
    const cWood = TX.tex(TX.woodCanvas(256), 1, 1);
    const cWoodD = TX.tex(TX.woodCanvas(256, [126, 96, 68]), 1, 1);
    const cRoof = TX.tex(TX.roofCanvas(256), 1, 1);
    const cRust = TX.tex(TX.rustCanvas(256), 1, 1);
    const cHazard = TX.tex(TX.hazardCanvas(), 1, 1);
    const cNet = TX.tex(TX.netCanvas(256), 1, 1, false);
    const cRope = TX.tex(TX.ropeCanvas(), 1, 1);
    const cSeabed = TX.tex(TX.seabedCanvas(256), 1, 1);
    const cGrass = TX.tex(TX.grassCanvas(256), 1, 1);
    const cIce = TX.tex(TX.iceCanvas(), 1, 1);
    const cFish = TX.tex(TX.fishPhotoCanvas(), 1, 1);
    const cCharm = TX.tex(TX.charmCanvas(), 1, 1);

    T.concrete = toon({
      color: 0xffffff, map: cWet, steps: 4, contrast: 0.72,
      spec: { color: 0xfff6e2, strength: 0.30, power: 26, thresh: 0.34 },
      rim: { color: 0xd8eef6, strength: 0.16, power: 3.4 },
    });
    T.concrete.map.repeat.set(1, 1);

    T.concreteSide = toon({
      color: 0xffffff, map: cSide, steps: 3, contrast: 0.8,
      spec: { color: 0xf2f6f4, strength: 0.10, power: 20, thresh: 0.5 },
    });
    T.seawall = toon({
      color: 0xffffff, map: cWall, steps: 4, contrast: 0.75,
      spec: { color: 0xdff2ea, strength: 0.14, power: 16, thresh: 0.46 },
    });
    T.hull = toon({
      color: 0xffffff, map: cHull, steps: 3, contrast: 0.9,
      spec: { color: 0xffffff, strength: 0.42, power: 64, thresh: 0.40 },
      rim: { color: 0xeaf7ff, strength: 0.20, power: 3.0 },
    });
    T.hullPlain = toon({
      color: 0xf2f4f0, steps: 3, contrast: 0.9,
      spec: { color: 0xffffff, strength: 0.38, power: 64, thresh: 0.40 },
      rim: { color: 0xeaf7ff, strength: 0.18, power: 3.0 },
    });
    T.hullGreen = toon({
      color: 0x3f8f86, steps: 3, contrast: 0.9,
      spec: { color: 0xdfffff, strength: 0.4, power: 60, thresh: 0.42 },
    });
    T.hullBlue = toon({
      color: 0x2f6f9c, steps: 3, contrast: 0.9,
      spec: { color: 0xe6f6ff, strength: 0.4, power: 60, thresh: 0.42 },
    });
    T.rust = toon({ color: 0xffffff, map: cRust, transparent: true, steps: 3 });
    T.metalRoof = toon({
      color: 0x8fa3aa, steps: 3, contrast: 0.8,
      spec: { color: 0xeaf6fa, strength: 0.30, power: 34, thresh: 0.46 },
      rim: { color: 0xdcf0f8, strength: 0.18, power: 3.0 },
    });
    T.shutter = toon({
      color: 0xa9b0ae, steps: 3, contrast: 0.85,
      spec: { color: 0xf2f8f6, strength: 0.26, power: 30, thresh: 0.48 },
    });
    T.rustSolid = toon({ color: 0x8d5a38, steps: 3, spec: { color: 0xffd9a8, strength: 0.16, power: 22, thresh: 0.5 } });
    T.hazard = toon({ color: 0xffffff, map: cHazard, steps: 2, contrast: 1.0 });
    T.iron = toon({
      color: 0x23282b, steps: 3, contrast: 1.05,
      spec: { color: 0xa8bcc4, strength: 0.30, power: 40, thresh: 0.52 },
      rim: { color: 0xbcd6e0, strength: 0.28, power: 3.2 },
    });
    T.ironMatte = toon({ color: 0x1d2225, steps: 2, contrast: 1.1, spec: { color: 0x7d8f96, strength: 0.10, power: 26, thresh: 0.6 } });
    T.steel = toon({
      color: 0x9aa7ab, steps: 4, contrast: 0.9,
      spec: { color: 0xffffff, strength: 0.55, power: 80, thresh: 0.36 },
      rim: { color: 0xe6f6ff, strength: 0.26, power: 3.0 },
    });
    T.brass = toon({
      color: 0xc79a4a, steps: 4, contrast: 0.85,
      spec: { color: 0xffeec2, strength: 0.62, power: 70, thresh: 0.32 },
      rim: { color: 0xffe6b0, strength: 0.30, power: 2.6 },
    });
    T.rope = toon({ color: 0xffffff, map: cRope, steps: 3, spec: { color: 0xffe9c0, strength: 0.10, power: 18, thresh: 0.55 } });
    T.ropeWet = toon({ color: 0x8a6a45, steps: 3, spec: { color: 0xfff0d2, strength: 0.22, power: 30, thresh: 0.46 } });
    T.wood = toon({ color: 0xffffff, map: cWood, steps: 3, spec: { color: 0xfff0d4, strength: 0.10, power: 18, thresh: 0.55 } });
    T.woodDark = toon({ color: 0xffffff, map: cWoodD, steps: 3 });
    T.roof = toon({ color: 0xffffff, map: cRoof, steps: 3, spec: { color: 0xffd9b0, strength: 0.12, power: 20, thresh: 0.55 } });
    T.wall = toon({ color: 0xd9dcd4, steps: 3, spec: { color: 0xf6fbff, strength: 0.08, power: 14, thresh: 0.6 } });
    T.wallWarm = toon({ color: 0xe4e0d2, steps: 3 });
    T.plaster = toon({ color: 0xe8e6dc, steps: 3 });
    T.seabed = toon({ color: 0x93a09a, map: cSeabed, steps: 4, contrast: 0.8 });
    T.grass = toon({ color: 0xffffff, map: cGrass, steps: 4, contrast: 0.72, rim: { color: 0xd8f0c4, strength: 0.14, power: 3 } });
    T.tree = toon({ color: 0x4f8c53, steps: 3, contrast: 0.7, rim: { color: 0xe6ffd8, strength: 0.18, power: 2.8 } });
    T.treeLight = toon({ color: 0x67a35a, steps: 3, contrast: 0.7 });
    T.white = toon({ color: 0xf4f4ef, steps: 3, spec: { color: 0xffffff, strength: 0.26, power: 50, thresh: 0.44 } });
    T.whitePlastic = toon({ color: 0xf6f7f4, steps: 3, spec: { color: 0xffffff, strength: 0.3, power: 46, thresh: 0.45 } });
    T.bluePlastic = toon({ color: 0x2f6fb5, steps: 3, spec: { color: 0xdff0ff, strength: 0.30, power: 46, thresh: 0.45 } });
    T.orange = toon({ color: 0xf07a2c, steps: 3, spec: { color: 0xfff0d8, strength: 0.24, power: 40, thresh: 0.48 } });
    T.orangeWhite = toon({ color: 0xffffff, steps: 2, contrast: 1.0 });
    T.red = toon({ color: 0xc8402f, steps: 3 });
    T.yellow = toon({ color: 0xf2c53a, steps: 3, spec: { color: 0xfff6d0, strength: 0.2, power: 34, thresh: 0.5 } });
    T.yellowRain = toon({ color: 0xf5cf3a, steps: 3, spec: { color: 0xfffce8, strength: 0.28, power: 42, thresh: 0.44 } });
    T.teal = toon({ color: 0x2f8e86, steps: 3 });
    T.darkTeal = toon({ color: 0x1d5f63, steps: 3 });
    T.green = toon({ color: 0x54934e, steps: 3 });
    T.beige = toon({ color: 0xd9c9a8, steps: 3 });
    T.paper = toon({ color: 0xeee8d6, steps: 2 });
    T.glass = new THREE.MeshPhysicalMaterial({
      color: 0xdff2f4, transparent: true, opacity: 0.24, roughness: 0.06, metalness: 0,
      transmission: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    T.glassClear = new THREE.MeshPhysicalMaterial({
      color: 0xeaf7fa, transparent: true, opacity: 0.10, roughness: 0.04, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.35,
    });
    T.glassDark = new THREE.MeshPhysicalMaterial({
      color: 0x3f5a63, transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    T.net = toon({
      color: 0xe8e2cc, map: cNet, alphaMap: cNet, transparent: true, alphaTest: 0.32,
      side: THREE.DoubleSide, steps: 2, depthWrite: true,
    });
    T.ice = toon({
      color: 0xffffff, map: cIce, transparent: true, opacity: 0.85, steps: 2,
      spec: { color: 0xffffff, strength: 0.5, power: 60, thresh: 0.34 },
    });
    T.fishPhoto = toon({ color: 0xffffff, map: cFish, steps: 2 });
    T.charm = toon({ color: 0xffffff, map: cCharm, steps: 2 });
    T.lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
    T.lampGlass = new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.85 });
    T.screenGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, map: TX.tex(TX.radarCanvas(), 1, 1) });
    T.lighthouseRed = toon({ color: 0xd8453a, steps: 3, spec: { color: 0xffffff, strength: 0.3, power: 44, thresh: 0.46 } });
    T.lighthouseWhite = toon({ color: 0xf5f3ec, steps: 3, spec: { color: 0xffffff, strength: 0.3, power: 44, thresh: 0.46 } });
    T.ventGlass = toon({ color: 0xfff3cf, steps: 2, emissive: 0xffd98a, emissiveIntensity: 0.7 });

    /* 贴图类材质（独立 map） */
    T.sign = toon({ color: 0xffffff, map: TX.tex(TX.portSignCanvas(), 1, 1), steps: 3 });
    T.warnSign = toon({ color: 0xffffff, map: TX.tex(TX.warnSignCanvas(), 1, 1), steps: 3 });
    T.schedule = toon({ color: 0xffffff, map: TX.tex(TX.scheduleCanvas(), 1, 1), steps: 2 });
    T.blackboard = toon({ color: 0xffffff, map: TX.tex(TX.blackboardCanvas(), 1, 1), steps: 2 });
    T.chart = toon({ color: 0xffffff, map: TX.tex(TX.chartCanvas(), 1, 1), steps: 2 });
    T.tide = toon({ color: 0xffffff, map: TX.tex(TX.tideCanvas(), 1, 1), steps: 2 });
    T.vending = toon({
      color: 0xffffff, map: TX.tex(TX.vendingCanvas(), 1, 1), steps: 3,
      spec: { color: 0xffffff, strength: 0.34, power: 52, thresh: 0.42 },
    });
    T.clock = toon({ color: 0xffffff, map: TX.tex(TX.clockCanvas(), 1, 1), steps: 2 });
    T.radio = toon({
      color: 0xffffff, map: TX.tex(TX.radioCanvas(), 1, 1), steps: 3,
      spec: { color: 0xffffff, strength: 0.2, power: 34, thresh: 0.5 },
    });
    T.crateWhite = toon({ color: 0xffffff, map: TX.tex(TX.crateCanvas('#eef0ea', '#d6dbd2'), 1, 1), steps: 3 });
    T.crateBlue = toon({ color: 0xffffff, map: TX.tex(TX.crateCanvas('#3a72b8', '#2c5c96'), 1, 1), steps: 3 });

    /* 发光屏（雷达 / 鱼探 / 贩卖机灯箱） */
    T.radarScreen = new THREE.MeshBasicMaterial({ map: TX.tex(TX.radarCanvas(), 1, 1) });
    T.finderScreen = new THREE.MeshBasicMaterial({ map: TX.tex(TX.finderCanvas(), 1, 1) });
    T.vendingGlow = new THREE.MeshBasicMaterial({ map: TX.tex(TX.vendingCanvas(), 1, 1) });

    /* 云影噪声 */
    shared.uCloudTex.value = TX.tex(TX.cloudCanvas(256), 1, 1, false);
  }

  TY.M = T;
  TY.toon = toon;
  TY.gradient = gradient;
  TY.buildMaterials = build;
})();
