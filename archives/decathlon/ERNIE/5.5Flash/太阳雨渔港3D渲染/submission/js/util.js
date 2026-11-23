// ---------- basic helpers ----------
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t * t; }
// smooth 0..1..0 pulse
function pulse(t, period, duty) {
  const p = ((t % period) + period) % period / period;
  if (p > duty) return 0;
  return Math.sin(p / duty * Math.PI);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTexture(w, h, draw, opts) {
  opts = opts || {};
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (opts.srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.needsUpdate = true;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  return t;
}

// add inverted-hull outline
const _outlineMats = {};
function outlineMaterial(thickness, color) {
  const key = thickness.toFixed(4) + '_' + (color || 0);
  if (_outlineMats[key]) return _outlineMats[key];
  const m = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
      fogColor: { value: new THREE.Color(0xdcecef) },
      fogDensity: { value: 0.0032 }
    },
    vertexShader: `
      uniform float thickness;
      varying float vFogDepth;
      void main(){
        vec3 p = position + normal * thickness;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying float vFogDepth;
      void main(){
        vec3 col = vec3(0.075, 0.115, 0.135);
        float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    fog: false
  });
  _outlineMats[key] = m;
  return m;
}

function addOutline(mesh, thickness, color) {
  thickness = thickness === undefined ? 0.022 : thickness;
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  o.castShadow = false; o.receiveShadow = false;
  o.renderOrder = -1;
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}

function shadowify(obj, cast, receive) {
  obj.traverse(o => {
    if (o.isMesh && !o.userData.isOutline) {
      if (cast !== undefined) o.castShadow = cast;
      if (receive !== undefined) o.receiveShadow = receive;
    }
  });
  return obj;
}

function setOutlineRecursive(obj, thickness) {
  obj.traverse(o => { if (o.isMesh && !o.userData.isOutline) addOutline(o, thickness); });
}

// simple geometry helpers
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}
function cyl(rt, rb, h, seg, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}
function sph(r, mat, x, y, z, ws, hs) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws || 14, hs || 10), mat);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}
function plane(w, h, mat, x, y, z, rx, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (rx) m.rotation.x = rx;
  if (ry) m.rotation.y = ry;
  return m;
}

// merge geometries (position/normal/uv) into one non-indexed BufferGeometry
function mergeGeos(geos) {
  const pos = [], norm = [], uv = [];
  geos.forEach(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    if (ng.attributes.normal) {
      const n = ng.attributes.normal.array;
      for (let i = 0; i < n.length; i++) norm.push(n[i]);
    }
    if (ng.attributes.uv) {
      const u = ng.attributes.uv.array;
      for (let i = 0; i < u.length; i++) uv.push(u[i]);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (norm.length === pos.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  if (uv.length === pos.length / 3 * 2) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function transformed(geo, x, y, z, rx, ry, rz, sx, sy, sz) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
  m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
  g.applyMatrix4(m);
  return g;
}

function canvasSpriteTexture(size, stops) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { clamp: true });
}

function makeGlow(color, size, opacity) {
  const tex = canvasSpriteTexture(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,250,225,0.55)'],
    [0.55, 'rgba(255,245,210,0.14)'],
    [1, 'rgba(255,245,210,0)']
  ]);
  const mat = new THREE.SpriteMaterial({
    map: tex, color: color || 0xfff3cf, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: opacity === undefined ? 0.9 : opacity,
    fog: false
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

// deterministic hash noise for shaders is inline; CPU value noise:
function makeNoise2D(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad(h, x, y) { const u = h < 4 ? x : y; const v = h < 4 ? y : x; return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v); }
  return function (x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v) * 0.7;
  };
}