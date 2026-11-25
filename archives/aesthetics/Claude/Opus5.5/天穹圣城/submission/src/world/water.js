import * as THREE from 'three';
import { Batch, mat, mul, matSeg } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { sharedUniforms } from '../core/uniforms.js';
import { GLSL_UNIFORMS, GLSL_HELPERS, GLSL_FOG, GLSL_CLOUDSHADOW } from '../core/shaderlib.js';
import { MAIN, SATS, CLK, P, angDist, outRot, dirOf } from './layout.js';
import { CANAL, CASCADE_TH } from './city.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TRIM = 0xeee6d4, CH = 0xd8ccb4;

// ------------------------------------------------------------------ shaders
const WATER_VS = /* glsl */`
attribute vec2 flow;
varying vec2 vUv; varying vec3 vW; varying vec2 vFlow;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = uv; vFlow = flow; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const WATER_FS = /* glsl */`
${GLSL_UNIFORMS}
uniform vec3 uDeep; uniform float uOpacity;
varying vec2 vUv; varying vec3 vW; varying vec2 vFlow;
${GLSL_HELPERS}
${GLSL_CLOUDSHADOW}
${GLSL_FOG}
void main() {
  vec2 uv = vUv;
  float sp = vFlow.x;
  vec2 q1 = vec2(uv.x * 0.22 - uTime * sp * 0.22, uv.y * 0.22);
  vec2 q2 = vec2(uv.x * 0.5 - uTime * sp * 0.5 + 0.37, uv.y * 0.5 + uTime * 0.03);
  float e = 0.03;
  float h1 = texture(tNoise2D, q1).b, h2 = texture(tNoise2D, q2).b;
  float hx = texture(tNoise2D, q1 + vec2(e, 0.0)).b - h1 + (texture(tNoise2D, q2 + vec2(e, 0.0)).b - h2) * 0.6;
  float hz = texture(tNoise2D, q1 + vec2(0.0, e)).b - h1 + (texture(tNoise2D, q2 + vec2(0.0, e)).b - h2) * 0.6;
  vec3 n = normalize(vec3(-hx * 3.0, 1.0, -hz * 3.0));
  vec3 V = normalize(cameraPosition - vW);
  float NV = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  vec3 sky = skyBase(R) * 0.9;
  float sh = cloudShadow(vW);
  vec3 body = uDeep * (0.35 + 0.65 * sh) * (0.8 + 0.4 * h1);
  vec3 col = mix(body, sky, clamp(fres * 1.2, 0.0, 1.0));
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(n, H), 0.0), 260.0) * 2.5 * sh;
  // foam streaks along fast flow
  float foam = smoothstep(0.62, 0.9, texture(tNoise2D, vec2(uv.x * 0.6 - uTime * sp * 0.9, uv.y * 1.3)).g) * vFlow.y;
  col = mix(col, vec3(0.92, 0.95, 0.97) * (0.5 + 0.5 * sh) * 1.2, foam * 0.6);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, uOpacity + fres * 0.15);
}
`;

const FALL_VS = /* glsl */`
attribute vec3 fallInfo; // x: across 0..1, y: meters along fall, z: fraction down 0..1
varying vec3 vInfo; varying vec3 vW; varying vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vInfo = fallInfo; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }
`;
const FALL_FS = /* glsl */`
${GLSL_UNIFORMS}
uniform float uSpeed; uniform float uOpacity; uniform float uSeaTop; uniform float uFoam; uniform float uSeed;
varying vec3 vInfo; varying vec3 vW; varying vec3 vN;
${GLSL_HELPERS}
${GLSL_CLOUDSHADOW}
${GLSL_FOG}
void main() {
  float u = vInfo.x, m = vInfo.y, f = vInfo.z;
  float edge = smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.82, u);
  float s1 = texture(tNoise2D, vec2(u * 2.3 + uSeed, (m - uTime * uSpeed) / 34.0)).b;
  float s2 = texture(tNoise2D, vec2(u * 5.1 + uSeed * 1.7, (m - uTime * uSpeed * 1.25) / 13.0)).r;
  float s3 = texture(tNoise2D, vec2(u * 9.0 - uSeed, (m - uTime * uSpeed * 1.5) / 6.0)).a;
  float dens = smoothstep(0.25, 0.75, s1 * 0.6 + s2 * 0.4) * 0.85 + s3 * 0.25;
  float breakup = mix(1.0, smoothstep(0.35, 0.8, s1 * 0.5 + s3 * 0.6), smoothstep(0.25, 0.9, f));
  float a = edge * dens * breakup * uOpacity;
  a *= smoothstep(0.0, 0.02, f);
  a *= smoothstep(uSeaTop - 10.0, uSeaTop + 70.0, vW.y);
  float sh = cloudShadow(vW);
  float lit = 0.55 + 0.45 * max(dot(normalize(vN), uSunDir), 0.0);
  vec3 foamC = vec3(1.0, 0.99, 0.97) * (0.45 + 0.75 * sh * lit) * uSunColor.r * 0.42;
  vec3 waterC = vec3(0.55, 0.72, 0.80) * (0.4 + 0.6 * sh);
  vec3 col = mix(waterC, foamC, clamp(uFoam + s2 * 0.5 + f * 0.6, 0.0, 1.0));
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

// camera-facing particles (mist / spray / smoke), fully time-driven
const PART_VS = /* glsl */`
uniform float uTime;
uniform float uLife; uniform vec3 uDrift; uniform float uGrow; uniform float uSize; uniform float uGravity; uniform vec3 uSpread;
attribute vec3 iOrigin; attribute vec4 iSeed;
varying float vA; varying vec2 vQ; varying vec3 vW; varying float vSeed;
void main() {
  float ph = fract(uTime / uLife + iSeed.x);
  vec3 drift = uDrift * (0.6 + 0.8 * iSeed.y) * ph * uLife;
  vec3 sp = (vec3(iSeed.z, iSeed.w, fract(iSeed.z * 7.13 + iSeed.w)) - 0.5) * 2.0 * uSpread;
  vec3 p = iOrigin + sp * (0.3 + ph) + drift;
  p.y -= 0.5 * uGravity * pow(ph * uLife, 2.0);
  float size = uSize * (0.5 + iSeed.y) * (1.0 + uGrow * ph);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * size;
  vW = p;
  vA = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.55, 1.0, ph));
  vQ = position.xy; vSeed = iSeed.z;
  gl_Position = projectionMatrix * mv;
}
`;
const PART_FS = /* glsl */`
${GLSL_UNIFORMS}
uniform vec3 uColor; uniform float uOpacity; uniform float uSeaFade;
varying float vA; varying vec2 vQ; varying vec3 vW; varying float vSeed;
${GLSL_HELPERS}
${GLSL_CLOUDSHADOW}
${GLSL_FOG}
void main() {
  float r = length(vQ);
  float n = texture(tNoise2D, vQ * 0.35 + vSeed * 3.0).r;
  float a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.5)) * vA * uOpacity;
  if (uSeaFade > 0.5) a *= smoothstep(-460.0, -300.0, vW.y);
  if (a < 0.003) discard;
  float sh = cloudShadow(vW);
  vec3 col = uColor * (0.55 + 0.45 * sh);
  col = applyFog(col, vW);
  gl_FragColor = vec4(col, a);
}
`;

const RAINBOW_FS = /* glsl */`
${GLSL_UNIFORMS}
uniform float uOpacity;
varying vec2 vUv2; varying vec3 vW2;
vec3 spectrum(float x) { // x 0 (inner, violet) .. 1 (outer, red)
  vec3 c = vec3(0.0);
  c += vec3(0.55, 0.25, 0.9) * exp(-pow((x - 0.08) / 0.12, 2.0));
  c += vec3(0.2, 0.35, 1.0) * exp(-pow((x - 0.25) / 0.12, 2.0));
  c += vec3(0.2, 0.9, 0.4) * exp(-pow((x - 0.48) / 0.12, 2.0));
  c += vec3(1.0, 0.95, 0.2) * exp(-pow((x - 0.66) / 0.1, 2.0));
  c += vec3(1.0, 0.45, 0.1) * exp(-pow((x - 0.8) / 0.1, 2.0));
  c += vec3(0.95, 0.12, 0.1) * exp(-pow((x - 0.94) / 0.1, 2.0));
  return c;
}
void main() {
  float x = vUv2.y; float along = vUv2.x;
  float a = smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x) * smoothstep(0.0, 0.25, along) * smoothstep(1.0, 0.75, along);
  a *= smoothstep(-330.0, -240.0, vW2.y) * uOpacity;
  gl_FragColor = vec4(spectrum(x) * a, 1.0);
}
`;

export function makeWaterMaterial(deep = new THREE.Color(0.06, 0.20, 0.24), opacity = 0.86) {
  return new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: { ...sharedUniforms(), uDeep: { value: deep }, uOpacity: { value: opacity } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}
function makeFallMaterial(speed = 14, opacity = 0.9, foam = 0.4, seed = 0) {
  return new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, uniforms: { ...sharedUniforms(), uSpeed: { value: speed }, uOpacity: { value: opacity }, uSeaTop: { value: -270 }, uFoam: { value: foam }, uSeed: { value: seed } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}
export function makeParticles(origins, opts) {
  const n = origins.length;
  const base = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position);
  const o = new Float32Array(n * 3), sd = new Float32Array(n * 4);
  const rng = new RNG(opts.seed || 5);
  origins.forEach((p, i) => { o[i * 3] = p.x; o[i * 3 + 1] = p.y; o[i * 3 + 2] = p.z; sd[i * 4] = rng.next(); sd[i * 4 + 1] = rng.next(); sd[i * 4 + 2] = rng.next(); sd[i * 4 + 3] = rng.next(); });
  g.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(o, 3));
  g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(sd, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    vertexShader: PART_VS, fragmentShader: PART_FS,
    uniforms: { ...sharedUniforms(), uLife: { value: opts.life || 6 }, uDrift: { value: opts.drift || V3(0, 2, 0) }, uGrow: { value: opts.grow ?? 1.5 }, uSize: { value: opts.size || 4 }, uGravity: { value: opts.gravity || 0 }, uSpread: { value: opts.spread || V3(2, 1, 2) }, uColor: { value: opts.color || new THREE.Color(1, 1, 1) }, uOpacity: { value: opts.opacity ?? 0.5 }, uSeaFade: { value: opts.seaFade ? 1 : 0 } },
    transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.layers.set(1); mesh.renderOrder = opts.order || 5;
  return mesh;
}

// ------------------------------------------------------------------ geometry builders
// water strip along a polyline of Vector3 (y = surface height). width w. flow speed sp, foam amount fm
function stripGeo(pts, w, sp = 0.6, fm = 0.0) {
  const pos = [], uv = [], fl = [], idx = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const d = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])); d.y = 0; d.normalize();
    const n = V3(d.z, 0, -d.x);
    if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
    const a = p.clone().addScaledVector(n, w / 2), b = p.clone().addScaledVector(n, -w / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uv.push(along, 0, along, w);
    fl.push(sp, fm, sp, fm);
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(fl, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function discGeo(c, r, y, seg = 32, sp = 0.05) {
  const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); g.translate(c.x, y, c.z);
  const n = g.attributes.position.count; const uv = g.attributes.uv; for (let i = 0; i < n; i++) uv.setXY(i, g.attributes.position.getX(i), g.attributes.position.getZ(i));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((v, i) => (i % 2 ? 0 : sp)), 2));
  return g;
}
// falling ribbon along a path of points with half-widths; facing perpendicular to 'side'
function fallGeo(pts, widths, side) {
  const pos = [], info = [], idx = [], nrm = [];
  let m = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) m += pts[i].distanceTo(pts[i - 1]);
    const p = pts[i]; const w = widths[i];
    const a = p.clone().addScaledVector(side, -w), b = p.clone().addScaledVector(side, w);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const f = i / (pts.length - 1);
    info.push(0, m, f, 1, m, f);
    const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3().crossVectors(side, t).normalize();
    nrm.push(n.x, n.y, n.z, n.x, n.y, n.z);
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('fallInfo', new THREE.Float32BufferAttribute(info, 3));
  g.setIndex(idx);
  return g;
}
// free-fall trajectory from lip with outward velocity
function fallPath(lip, out, v0, drop, n = 40, wiggle = 0) {
  const pts = []; const g = 9.8; const T = Math.sqrt(2 * drop / g);
  for (let i = 0; i <= n; i++) {
    const t = T * Math.pow(i / n, 0.8);
    const p = lip.clone().addScaledVector(out, v0 * t * (1 + wiggle * Math.sin(i * 0.4)));
    p.y -= 0.5 * g * t * t;
    pts.push(p);
  }
  return pts;
}

// ------------------------------------------------------------------ build
export function buildWater(ctx) {
  const { scene, M } = ctx;
  const sb = new Batch('waterStone');
  const rng = new RNG(909);
  const T1 = MAIN.T1, T2 = MAIN.T2, T3 = MAIN.T3, PL = MAIN.plat;
  const still = makeWaterMaterial(new THREE.Color(0.05, 0.18, 0.22), 0.88);
  const flowing = makeWaterMaterial(new THREE.Color(0.07, 0.22, 0.26), 0.84);
  const geos = { still: [], flowing: [] };
  const falls = [];
  const addFall = (pts, widths, side, speed, opacity, foam, layer = 1) => falls.push({ g: fallGeo(pts, widths, side), speed, opacity, foam });
  const mistOrigins = [], sprayOrigins = [];
  const channelWalls = (pts, w, h = 0.9, y0 = null) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const d = c.clone().sub(a); d.y = 0; d.normalize(); const n = V3(d.z, 0, -d.x);
      for (const sd of [-1, 1]) {
        const aa = a.clone().addScaledVector(n, sd * (w / 2 + 0.3)), cc = c.clone().addScaledVector(n, sd * (w / 2 + 0.3));
        aa.y -= 0.55; cc.y -= 0.55;
        sb.add('stone', G.box(1, h, 0.6).translate(0.5, 0, 0), matSeg(aa, cc), TRIM);
      }
      const ab = a.clone(), cb = c.clone(); ab.y -= 0.7; cb.y -= 0.7;
      sb.add('stone', G.box(1, 0.3, w + 0.4).translate(0.5, 0, 0), matSeg(ab, cb), 0x8f8676);
    }
  };
  const arcPts = (r, th0, th1, y, step = 3) => { const n = Math.max(2, Math.ceil(Math.abs(th1 - th0) * r / step)); const out = []; for (let i = 0; i <= n; i++) out.push(P(r, th0 + (th1 - th0) * i / n, y)); return out; };
  const radPts = (r0, r1, th, y, step = 3) => { const n = Math.max(2, Math.ceil(Math.abs(r1 - r0) / step)); const out = []; for (let i = 0; i <= n; i++) out.push(P(r0 + (r1 - r0) * i / n, th, y)); return out; };
  const smallBridge = (p, dir, w) => {
    const ry = Math.atan2(dir.x, dir.z);
    sb.add('stone', G.archSpan(w + 2.4, 1.8, 3.0, w + 0.4, -0.2, 'round', 10), mat(p.x, p.y - 1.1, p.z, ry + Math.PI / 2), 0xe2d8c4);
    for (const sd of [-1, 1]) sb.add('stone', G.box(w + 2.4, 0.7, 0.3), mul(mat(p.x, p.y + 0.6, p.z, ry + Math.PI / 2), mat(0, 0, sd * 1.4)), TRIM);
  };

  // ---------- cistern ----------
  const cis = ctx.cistern;
  { const g = new THREE.RingGeometry(cis.r0 + 0.6, cis.r1 - 0.6, 40, 1, Math.PI / 2 - cis.a1 + 0.012, (cis.a1 - cis.a0) - 0.024); g.rotateX(-Math.PI / 2); g.translate(0, cis.y - 0.15, 0); const n = g.attributes.position.count; const uv = g.attributes.uv; for (let i = 0; i < n; i++) uv.setXY(i, g.attributes.position.getX(i), g.attributes.position.getZ(i)); g.setAttribute('flow', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((v, i) => (i % 2 ? 0 : 0.04)), 2)); geos.still.push(g); }
  // aqueduct inflow: water strip in the channel + spout falling into the cistern
  {
    const A = ctx.aqueduct.A, B = ctx.aqueduct.B;
    const pts = []; for (let i = 0; i <= 60; i++) { const p = A.clone().lerp(B, i / 60); p.y += 0.55; pts.push(p); }
    geos.flowing.push(stripGeo(pts, ctx.aqueduct.w, 2.4, 0.35));
    const lip = B.clone().add(V3(0, 0.55, 0)); const out = V3(-B.x, 0, -B.z).normalize();
    const fp = fallPath(lip, out, 3.0, lip.y - cis.y + 0.3, 14);
    addFall(fp, fp.map((p, i) => 1.3 + i * 0.03), V3(out.z, 0, -out.x), 9, 0.95, 0.5);
    sprayOrigins.push(fp[fp.length - 1].clone());
    ctx.landmarks.aqueductSpout = lip.clone();
  }
  // platform overflow channels (water strips)
  for (const ch of ctx.channels) {
    const pts = arcPts(ch.r, ch.a0, ch.a1, PL.y + 0.55, 2.5);
    geos.flowing.push(stripGeo(pts, 2.0, 1.2, 0.15));
  }

  // ---------- route A: terrace cascades at CASCADE_TH ----------
  {
    const th = CASCADE_TH;
    // channel from platform channel end to podium edge
    const c1 = radPts(66.5, 72.6, th, PL.y + 0.55, 1.5); geos.flowing.push(stripGeo(c1, 2.0, 1.6, 0.3));
    const pools = [[T3.y, 74, 88], [T2.y, 105, 116], [T1.y, 137, 148]];
    const lips = [[72.6, PL.y + 0.5], [T3.r1 + 0.4, T3.y + 0.5], [T2.r1 + 0.4, T2.y + 0.5]];
    pools.forEach(([y, r0, r1], i) => {
      const [lr, ly] = lips[i];
      const lip = P(lr, th, ly); const out = dirOf(th);
      const fp = fallPath(lip, out, 1.6, ly - y - 0.2, 14);
      addFall(fp, fp.map((p, k) => 2.6 + k * 0.05), V3(out.z, 0, -out.x), 11, 0.95, 0.55);
      sprayOrigins.push(fp[fp.length - 1].clone().add(V3(0, 0.5, 0)), fp[fp.length - 1].clone().add(V3(0, 0.5, 0)));
      // pool basin (semicircle against the wall)
      const pc = P((r0 + r1) / 2, th, y);
      const pr = (r1 - r0) / 2;
      sb.add('stone', G.cyl(pr + 0.7, pr + 0.9, 1.1, 28), mat(pc.x, y - 0.3, pc.z), TRIM);
      sb.add('stone', G.cylC(pr + 0.1, pr + 0.1, 0.2, 28), mat(pc.x, y + 0.6, pc.z), 0x7f776a);
      geos.still.push(discGeo(pc, pr + 0.05, y + 0.72, 28, 0.15));
      // outflow channel to the next lip
      const nextR = i < 2 ? lips[i + 1][0] : MAIN.wallR - MAIN.wallT / 2;
      const ch = radPts(r1 - 0.5, nextR, th, y + 0.62, 1.5);
      channelWalls(ch, 2.0); geos.flowing.push(stripGeo(ch, 2.0, 1.8, 0.3));
      if (i === 1) smallBridge(P((r1 + nextR) / 2, th, y + 0.62), dirOf(th).cross(V3(0, 1, 0)), 2.0);
    });
    // culvert + big waterfall W1 off the rim
    const rimR = ctx.mainRock.rimAt(th);
    const c2 = radPts(MAIN.wallR - MAIN.wallT / 2, rimR - 0.3, th, 0.8, 1.5); geos.flowing.push(stripGeo(c2, 2.6, 2.2, 0.5));
    const cp = P(MAIN.wallR + MAIN.wallT / 2 + 0.1, th, 0);
    sb.add('dark', G.box(3.2, 2.6, 0.2), mat(cp.x, 0.2, cp.z, outRot(th)));
    sb.add('stone', G.archRing(3.2, 0.5, 0.8, 'round', 10, 0), mat(cp.x, 2.8, cp.z, outRot(th)), TRIM);
    const lip = P(rimR - 0.2, th, 0.75); const out = dirOf(th);
    const fp = fallPath(lip, out, 4.2, 290, 48, 0.0);
    addFall(fp, fp.map((p, k) => 2.2 + k * 0.17), V3(out.z, 0, -out.x), 16, 0.95, 0.45);
    const fp2 = fallPath(lip, out, 4.6, 290, 48, 0.0);
    addFall(fp2, fp2.map((p, k) => 4.0 + k * 0.38), V3(out.z, 0, -out.x), 12, 0.42, 0.85);
    for (let k = 0; k < 26; k++) mistOrigins.push(fp[fp.length - 1].clone().add(V3(rng.range(-20, 20), rng.range(10, 50), rng.range(-20, 20))));
    ctx.waterfallW1 = { lip, bottom: fp[fp.length - 1].clone(), mid: fp[24].clone() };
  }

  // ---------- route B: canal through the lower city ----------
  {
    const thS = CLK(1.25);
    // spillway from platform channel end down the podium wall into a T3 pool
    const c0 = radPts(66.5, 72.6, thS, PL.y + 0.55, 1.5); geos.flowing.push(stripGeo(c0, 2.0, 1.6, 0.3));
    const lip0 = P(72.6, thS, PL.y + 0.5); const out0 = dirOf(thS);
    const f0 = fallPath(lip0, out0, 1.3, PL.y - T3.y, 14);
    addFall(f0, f0.map((p, k) => 1.4 + k * 0.03), V3(out0.z, 0, -out0.x), 11, 0.95, 0.55);
    sprayOrigins.push(f0[f0.length - 1].clone().add(V3(0, 0.6, 0)));
    const pc = P(78.5, thS, T3.y); sb.add('stone', G.cyl(4.6, 4.8, 1.1, 24), mat(pc.x, T3.y - 0.3, pc.z), TRIM); geos.still.push(discGeo(pc, 4.0, T3.y + 0.72, 24, 0.1));
    // T3 canal: pool -> r=86 arc -> outer edge
    const t3 = [...radPts(82, 86, thS, T3.y + 0.62, 2), ...arcPts(86, thS + 0.02, CLK(2.3), T3.y + 0.62).slice(1), ...arcPts(88, CLK(2.3), CLK(2.95), T3.y + 0.62).slice(1), ...radPts(88, T3.r1 + 0.3, CLK(2.97), T3.y + 0.62, 2).slice(1)];
    channelWalls(t3, 2.6); geos.flowing.push(stripGeo(t3, 2.6, 0.9, 0.05));
    smallBridge(P(86, CLK(1.75), T3.y + 0.62), dirOf(CLK(1.75)), 2.6);
    smallBridge(P(87, CLK(2.4), T3.y + 0.62), dirOf(CLK(2.4)), 2.6);
    // drop T3 -> T2
    const lip1 = P(T3.r1 + 0.4, CLK(2.97), T3.y + 0.55); const out1 = dirOf(CLK(2.97));
    const f1 = fallPath(lip1, out1, 1.4, T3.y - T2.y, 12);
    addFall(f1, f1.map((p, k) => 1.6 + k * 0.03), V3(out1.z, 0, -out1.x), 11, 0.95, 0.55);
    sprayOrigins.push(f1[f1.length - 1].clone().add(V3(0, 0.6, 0)));
    // T2 canal along r=107.5
    const t2 = [...arcPts(107.5, CLK(3.0), CANAL.t2Drop, T2.y + 0.62).slice(0), ...radPts(107.5, T2.r1 + 0.3, CANAL.t2Drop, T2.y + 0.62, 2).slice(1)];
    channelWalls(t2, 2.6); geos.flowing.push(stripGeo(t2, 2.6, 0.9, 0.05));
    smallBridge(P(107.5, CLK(3.35), T2.y + 0.62), dirOf(CLK(3.35)), 2.6);
    smallBridge(P(120, CANAL.t2Drop, T2.y + 0.62), dirOf(CANAL.t2Drop).cross(V3(0, 1, 0)), 2.6);
    // drop T2 -> T1
    const lip2 = P(T2.r1 + 0.4, CANAL.t2Drop, T2.y + 0.55); const out2 = dirOf(CANAL.t2Drop);
    const f2 = fallPath(lip2, out2, 1.4, T2.y - T1.y, 12);
    addFall(f2, f2.map((p, k) => 1.6 + k * 0.03), V3(out2.z, 0, -out2.x), 11, 0.95, 0.55);
    sprayOrigins.push(f2[f2.length - 1].clone().add(V3(0, 0.6, 0)));
    // T1 canal along r=140.5 then outward through the wall
    const t1 = [...radPts(T1.r0 + 1.2, 140.5, CANAL.t2Drop, T1.y + 0.62, 2), ...arcPts(140.5, CANAL.t2Drop, CANAL.t1Out, T1.y + 0.62).slice(1), ...radPts(140.5, MAIN.wallR - MAIN.wallT / 2, CANAL.t1Out, T1.y + 0.62, 2).slice(1)];
    channelWalls(t1, 2.6); geos.flowing.push(stripGeo(t1, 2.6, 1.0, 0.05));
    smallBridge(P(140.5, CLK(4.25), T1.y + 0.62), dirOf(CLK(4.25)), 2.6);
    smallBridge(P(160, CANAL.t1Out, T1.y + 0.62), dirOf(CANAL.t1Out).cross(V3(0, 1, 0)), 2.6);
    // culvert through the wall, rim channel, waterfall W2
    const th = CANAL.t1Out; const rimR = ctx.mainRock.rimAt(th);
    const c2 = radPts(MAIN.wallR - MAIN.wallT / 2, rimR - 0.3, th, 0.8, 1.5); geos.flowing.push(stripGeo(c2, 2.6, 2.2, 0.5));
    const cp = P(MAIN.wallR + MAIN.wallT / 2 + 0.1, th, 0);
    sb.add('dark', G.box(3.2, 2.6, 0.2), mat(cp.x, 0.2, cp.z, outRot(th)));
    sb.add('stone', G.archRing(3.2, 0.5, 0.8, 'round', 10, 0), mat(cp.x, 2.8, cp.z, outRot(th)), TRIM);
    const lip = P(rimR - 0.2, th, 0.75); const out = dirOf(th);
    const fp = fallPath(lip, out, 4.0, 290, 48);
    addFall(fp, fp.map((p, k) => 2.2 + k * 0.17), V3(out.z, 0, -out.x), 16, 0.95, 0.45);
    const fpB = fallPath(lip, out, 4.5, 290, 48);
    addFall(fpB, fpB.map((p, k) => 4.0 + k * 0.38), V3(out.z, 0, -out.x), 12, 0.42, 0.85);
    for (let k = 0; k < 26; k++) mistOrigins.push(fp[fp.length - 1].clone().add(V3(rng.range(-20, 20), rng.range(10, 50), rng.range(-20, 20))));
    ctx.waterfallW2 = { lip, bottom: fp[fp.length - 1].clone(), mid: fp[24].clone() };
    ctx.landmarks.canal = P(107.5, CLK(3.4), T2.y + 3);
    ctx.landmarks.canalT3 = P(86, CLK(1.9), T3.y + 3);
  }

  // ---------- fountain in the market ----------
  if (ctx.fountainPos) {
    const c = ctx.fountainPos;
    geos.still.push(discGeo(c, 4.15, c.y + 0.78, 32, 0.08));
    geos.still.push(discGeo(c, 1.6, c.y + 2.72, 20, 0.12));
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const lip = c.clone().add(V3(Math.cos(a) * 1.7, 2.75, Math.sin(a) * 1.7)); const out = V3(Math.cos(a), 0, Math.sin(a)); const fp = fallPath(lip, out, 1.2, 1.95, 6); addFall(fp, fp.map(() => 0.38), V3(out.z, 0, -out.x), 4, 0.8, 0.5); }
    const top = c.clone().add(V3(0, 4.6, 0));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const fp = []; for (let i = 0; i <= 8; i++) { const t = i / 8; fp.push(top.clone().add(V3(Math.cos(a) * t * 0.9, 0.5 * Math.sin(t * Math.PI) - t * 1.85, Math.sin(a) * t * 0.9))); } addFall(fp, fp.map(() => 0.12), V3(-Math.sin(a), 0, Math.cos(a)), 3, 0.75, 0.6); }
  }

  // ---------- waterwheel island: pit water, trough flow, tank, spills ----------
  {
    const pit = ctx.wheelPit;
    const pts = []; for (let i = 0; i <= 20; i++) pts.push(pit.a.clone().lerp(pit.b, i / 20));
    geos.flowing.push(stripGeo(pts, pit.w, 1.2, 0.25));
    const tr = ctx.wheelTrough; const tp = []; for (let i = 0; i <= 12; i++) tp.push(tr.a.clone().lerp(tr.b, i / 12));
    geos.flowing.push(stripGeo(tp, 1.4, 2.0, 0.3));
    const tk = ctx.wheelTank; geos.still.push(discGeo(tk.c, tk.r, tk.y, 36, 0.06));
    // trough end falling into the tank
    const lip = tr.b.clone(); const out = tr.b.clone().sub(tr.a).setY(0).normalize();
    const fp = fallPath(lip, out, 1.2, 1.6, 6); addFall(fp, fp.map(() => 0.55), V3(out.z, 0, -out.x), 6, 0.9, 0.6);
    // spills from buckets (descending side) + into trough at the top
    const W = ctx.wheel; const q = W.group.quaternion;
    const spill = [];
    for (let k = 0; k < 420; k++) {
      const a = 0.25 + rng.next() * 2.6; // angle from top, on the descending side (local -x)
      const lp = V3(-Math.sin(a) * (W.R - 1.2), Math.cos(a) * (W.R - 1.2), rng.range(-W.W / 2, W.W / 2));
      spill.push(lp.applyQuaternion(q).add(W.center));
    }
    const sp = makeParticles(spill, { life: 1.3, drift: V3(0, -1.0, 0), gravity: 9.8, size: 0.5, grow: 0.6, spread: V3(0.4, 0.2, 0.4), color: new THREE.Color(0.9, 0.95, 1.0), opacity: 0.85, seed: 31 });
    scene.add(sp);
    const topSpill = []; for (let k = 0; k < 60; k++) { const lp = V3(rng.range(0.5, 2.6), W.R - 0.6, rng.range(-W.W / 2, W.W / 2)); topSpill.push(lp.applyQuaternion(q).add(W.center)); }
    scene.add(makeParticles(topSpill, { life: 0.7, gravity: 9.8, size: 0.42, grow: 0.5, spread: V3(0.3, 0.1, 0.3), color: new THREE.Color(0.9, 0.95, 1.0), opacity: 0.85, seed: 32 }));
    const pitMist = []; for (let k = 0; k < 24; k++) pitMist.push(W.center.clone().add(V3(rng.range(-4, 4), -W.R + 1.5, rng.range(-3, 3)).applyQuaternion(q)));
    scene.add(makeParticles(pitMist, { life: 3.5, drift: V3(0, 0.6, 0), size: 1.4, grow: 1.2, spread: V3(1.5, 0.3, 1.5), color: new THREE.Color(1, 1, 1), opacity: 0.25, seed: 33 }));
    ctx.landmarks.wheelSpill = W.center.clone();
  }

  // ---------- meshes ----------
  const addMeshes = (list, matl) => { for (const g of list) { const m = new THREE.Mesh(g, matl); m.layers.set(1); m.renderOrder = 1; scene.add(m); } };
  addMeshes(geos.still, still); addMeshes(geos.flowing, flowing);
  for (const f of falls) {
    const m = new THREE.Mesh(f.g, makeFallMaterial(f.speed, f.opacity, f.foam, rng.next() * 10));
    m.layers.set(1); m.renderOrder = 3; m.frustumCulled = false; scene.add(m);
  }
  // mist at big waterfall bottoms (inside the cloud tops) and spray at pools
  scene.add(makeParticles(mistOrigins, { life: 9, drift: V3(0, 3.5, 0), size: 16, grow: 2.2, spread: V3(18, 8, 18), color: new THREE.Color(1, 1, 1), opacity: 0.32, seed: 41, seaFade: true, order: 6 }));
  scene.add(makeParticles(sprayOrigins.flatMap((p) => Array.from({ length: 6 }, () => p.clone())), { life: 2.6, drift: V3(0, 1.2, 0), size: 1.3, grow: 1.6, spread: V3(1.2, 0.3, 1.2), color: new THREE.Color(1, 1, 1), opacity: 0.32, seed: 42 }));
  // rainbow in the spray of W2
  {
    const w = ctx.waterfallW2; const c = w.bottom.clone().add(V3(0, 40, 0));
    const toCam = V3(0.4, 0, 1).normalize();
    const g = new THREE.RingGeometry(46, 58, 64, 1, 0.15 * Math.PI, 0.7 * Math.PI);
    const uv2 = []; const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const r = Math.hypot(x, y); const a = Math.atan2(y, x); uv2.push((a - 0.15 * Math.PI) / (0.7 * Math.PI), (r - 46) / 12); }
    g.setAttribute('aRb', new THREE.Float32BufferAttribute(uv2, 2));
    const m = new THREE.ShaderMaterial({ vertexShader: `attribute vec2 aRb; varying vec2 vUv2; varying vec3 vW2; void main(){ vUv2 = aRb; vec4 w = modelMatrix * vec4(position,1.0); vW2 = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`, fragmentShader: RAINBOW_FS, uniforms: { ...sharedUniforms(), uOpacity: { value: 0.33 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.position.copy(c); mesh.lookAt(c.clone().add(toCam)); mesh.position.y -= 30;
    mesh.layers.set(1); mesh.renderOrder = 7; scene.add(mesh);
  }
  sb.build(scene, M, { dark: { cast: false } });
}
