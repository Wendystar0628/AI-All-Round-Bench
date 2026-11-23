/* 太阳雨中的小渔港堤岸 — core: namespace, layout constants, rng, shared uniforms, GLSL chunks */
(function () {
  'use strict';
  var H = window.H = {};

  H.DT = 1 / 60;

  // ---------------------------------------------------------------- layout
  H.L = {
    HALF: 32,          // base half size
    WATER_Y: 0,
    QUAY_Y: 1.6,
    SEABED_Y: -5.0,
    SLAB_Y: -6.4,      // bottom of the base slab
    FRONT_Z: 12,       // front quay: z in [12, 32]
    ARM_X: 14,         // arm quay: x in [14, 32], z in [-14, 12]
    ARM_Z: -14,
    HILL_X: 12,        // hill: x in [12, 32], z in [-32, -14]
    BW: { x0: -8, x1: 14, z0: -14, z1: -11, top: 1.9 },       // short breakwater
    LH: { x: -9.4, z: -12.5 },                                   // lighthouse
    FBW: { x0: -29.5, x1: 1.5, z0: -29.7, z1: -27.9, top: 1.35 }, // far long breakwater
    SLIP: { x0: -31, x1: -24.6, zTop: 18.5, zEdge: 12, zEnd: 5.5 },
    STEPS: { x0: -21, x1: -17.6 },
    PLAT: { x0: -17.6, x1: -12.4, z0: 9.3, z1: 12, y: 0.5 }
  };

  // sun direction (pointing towards the sun) and wind / cloud travel directions
  H.SUN = new THREE.Vector3(-0.38, 0.74, 0.55).normalize();
  H.WIND = { x: 0.6, z: 0.8 };       // gusts come from the open sea (north-west) to the quay
  H.CLOUD_DIR = { x: 0.88, z: 0.475 };
  H.GUST_SPEED = 8.0;

  // ---------------------------------------------------------------- rng
  H.mulberry = function (seed) {
    var a = seed >>> 0;
    var f = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    f.range = function (lo, hi) { return lo + (hi - lo) * f(); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; };
    f.int = function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); };
    return f;
  };
  // build-time rng (static scene content): fixed seed -> identical model every load
  H.brand = H.mulberry(20240611);

  H.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  H.lerp = function (a, b, t) { return a + (b - a) * t; };
  H.smooth = function (a, b, x) { var t = H.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  H.ease = function (t) { t = H.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  H.easeIO = function (t) { t = H.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  // value noise (JS mirror of the GLSL one is not required to match; used for CPU side motion)
  function hash1(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  H.noise1 = function (x) {
    var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f);
    return H.lerp(hash1(i), hash1(i + 1), f);
  };
  H.hash1 = hash1;

  // ---------------------------------------------------------------- shared uniforms
  var V2 = THREE.Vector2, V3 = THREE.Vector3, V4 = THREE.Vector4;
  H.U = {
    uTime: { value: 0 },
    uSunDirW: { value: H.SUN.clone() },
    uSunK: { value: 1 },                                  // global sun strength (dark sky event)
    uCloud: { value: new V4(-999, -1000, H.CLOUD_DIR.x, H.CLOUD_DIR.z) }, // lead, trail, dir
    uGust: { value: new V4(-1000, 0, H.WIND.x, H.WIND.z) },                 // front, strength, dir
    uBreeze: { value: 0.22 },
    uRain: { value: 0.5 },
    uClipY: { value: -1e5 },
    uMistCol: { value: new THREE.Color().setRGB(0.80, 0.90, 0.905) },
    uDeepCol: { value: new THREE.Color().setRGB(0.045, 0.30, 0.37) },
    uReflW: { value: null }, uReflWMat: { value: new THREE.Matrix4() },
    uReflQ: { value: null }, uReflQMat: { value: new THREE.Matrix4() },
    uDist: { value: null },      // dynamic disturbance map (wake / gust / rings)
    uShore: { value: null },     // static shore / puddle mask
    uRes: { value: new V2(1, 1) }
  };

  // ---------------------------------------------------------------- GLSL shared chunks
  H.GLSL = {};
  H.GLSL.common = [
    'uniform float uTime;',
    'uniform vec4 uCloud;',
    'uniform float uSunK;',
    'uniform vec4 uGust;',
    'uniform float uBreeze;',
    'float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'vec2 hash22(vec2 p){ float n = hash21(p); return vec2(n, hash21(p + n + 17.17)); }',
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float fbm2(vec2 p){ return vnoise(p) * 0.57 + vnoise(p * 2.13 + 7.1) * 0.29 + vnoise(p * 4.37 + 3.3) * 0.14; }',
    // sun factor under the travelling cloud shadow: 1 = full sun
    'float cloudSun(vec2 p){',
    '  float s = dot(p, uCloud.zw) + (vnoise(p * 0.075 + 3.0) - 0.5) * 16.0;',
    '  float band = smoothstep(uCloud.y - 6.0, uCloud.y + 6.0, s) * (1.0 - smoothstep(uCloud.x - 6.0, uCloud.x + 6.0, s));',
    '  return (1.0 - 0.86 * band) * uSunK;',
    '}',
    // wind strength at a world position: steady breeze + the travelling gust front
    'float gustAt(vec2 p){',
    '  float tau = (uGust.x - dot(p, uGust.zw)) / ' + H.GUST_SPEED.toFixed(1) + ';',
    '  return uGust.y * smoothstep(0.0, 0.7, tau) * exp(-max(tau - 0.7, 0.0) / 3.2);',
    '}',
    'float windAt(vec2 p){ return uBreeze * (0.75 + 0.5 * vnoise(p * 0.11 + uTime * 0.13)) + gustAt(p); }'
  ].join('\n');

  // animated caustic net (used on sea bed, cabin ceilings, warehouse ceiling)
  H.GLSL.caustic = [
    'float causticNet(vec2 p, float t){',
    '  vec2 q = p;',
    '  q += 0.35 * vec2(sin(q.y * 1.7 + t * 0.6), cos(q.x * 1.5 - t * 0.5));',
    '  float a = sin(q.x * 3.1 + sin(q.y * 2.3 + t * 0.7) * 1.6);',
    '  float b = sin(q.y * 3.3 + sin(q.x * 2.1 - t * 0.55) * 1.6 + 1.3);',
    '  float c = sin((q.x + q.y) * 2.2 + sin((q.x - q.y) * 1.9 + t * 0.45) * 1.4);',
    '  float v = abs(a) * abs(b) + abs(c) * 0.35;',
    '  return 1.0 - smoothstep(0.02, 0.22, v);',
    '}'
  ].join('\n');

  // vertex sway (shared by toon materials and the outline normal pass so lines stay glued)
  // aSway.x = weight (0 = rigid), aSway.y = phase ; fx id selects the kind
  H.GLSL.sway = [
    'vec3 swayOffset(vec3 wpos, vec2 sw, float fx, vec3 nrmW){',
    '  vec3 o = vec3(0.0);',
    '  if (sw.x <= 0.0) return o;',
    '  float ph = sw.y;',
    '  if (fx > 3.5 && fx < 4.5) {',                // underwater plants
    '    o.x = sin(uTime * 1.25 + ph + wpos.y * 1.3) * 0.22 * sw.x + sin(uTime * 0.53 + ph * 0.7) * 0.12 * sw.x;',
    '    o.z = cos(uTime * 0.97 + ph * 1.7 + wpos.y * 1.1) * 0.16 * sw.x;',
    '  } else if (fx > 4.5 && fx < 5.5) {',         // foliage in the wind
    '    float w = windAt(wpos.xz);',
    '    float fl = sin(uTime * (2.2 + w * 3.0) + ph + wpos.x * 0.8 + wpos.y * 0.6);',
    '    o.xz = uGust.zw * (w * 0.55 + fl * (0.035 + w * 0.12)) * sw.x;',
    '    o.y = fl * 0.03 * sw.x * (1.0 + w * 2.0) - w * 0.12 * sw.x;',
    '  } else if (fx > 5.5 && fx < 6.5) {',         // cloth / flags : travelling wave along the fly
    '    float w = windAt(wpos.xz);',
    '    float wave = sin(uTime * (5.0 + w * 7.0) - sw.x * 5.5 + ph);',
    '    float wave2 = sin(uTime * (3.1 + w * 4.0) - sw.x * 2.7 + ph * 1.9);',
    '    o = nrmW * (wave * 0.6 + wave2 * 0.4) * sw.x * (0.05 + 0.13 * min(w, 1.6));',
    '    o.xz += uGust.zw * sw.x * min(w, 1.5) * 0.24;',
    '    o.y += sw.x * (min(w, 1.5) * 0.10 - 0.05) + wave2 * 0.02 * sw.x;',
    '  } else if (fx > 6.5 && fx < 7.5) {',         // hanging things (raincoat, charms) : small pendulum
    '    o.x = sin(uTime * 1.6 + ph) * 0.02 * sw.x; o.z = cos(uTime * 1.3 + ph * 2.1) * 0.02 * sw.x;',
    '  }',
    '  return o;',
    '}'
  ].join('\n');

  // CPU mirror of the gust / wind (for rain slant, wind-sock, float strings ...)
  H.windState = { front: -1000, strength: 0, breeze: 0.22, time: 0 };
  H.gustAtCPU = function (x, z) {
    var ws = H.windState;
    var tau = (ws.front - (x * H.WIND.x + z * H.WIND.z)) / H.GUST_SPEED;
    if (tau <= 0) return 0;
    var r = H.smooth(0, 0.7, tau);
    return ws.strength * r * Math.exp(-Math.max(tau - 0.7, 0) / 3.2);
  };
  H.windAtCPU = function (x, z) {
    var ws = H.windState;
    return ws.breeze * (0.75 + 0.5 * H.noise1(x * 0.11 + z * 0.07 + ws.time * 0.13)) + H.gustAtCPU(x, z);
  };
  H.cloudState = { lead: -999, trail: -1000, sunK: 1 };
  H.cloudSunCPU = function (x, z) {
    var cs = H.cloudState;
    var s = x * H.CLOUD_DIR.x + z * H.CLOUD_DIR.z;
    var band = H.smooth(cs.trail - 6, cs.trail + 6, s) * (1 - H.smooth(cs.lead - 6, cs.lead + 6, s));
    return (1 - 0.86 * band) * cs.sunK;
  };

  // registry of per-step systems
  H.systems = [];
  H.addSystem = function (s) { H.systems.push(s); return s; };
})();
