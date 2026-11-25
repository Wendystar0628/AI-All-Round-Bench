import * as THREE from 'three';
import { Batch, mat, mul } from '../core/batch.js';
import * as G from '../core/geo.js';
import { RNG, perlin3 } from '../core/noise.js';
import { U, sharedUniforms } from '../core/uniforms.js';
import { patchMaterial } from '../core/materials.js';
import { GLSL_UNIFORMS, GLSL_HELPERS, GLSL_FOG, GLSL_CLOUDSHADOW } from '../core/shaderlib.js';
import { makeRock, makeCap } from './rock.js';
import { SATS, CLK, P, dirOf, MAIN } from './layout.js';
import { eventPhase, sinceLast, EVENT_DUR } from '../events.js';
import { makeParticles } from './water.js';
import { cypress, oliveTree } from './vegetation.js';
import { addCrystal } from './mainIsland.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ flags (all animated in one draw)
function buildFlags(ctx) {
  const list = ctx.flags; if (!list.length) return;
  const NU = 10, NV = 4;
  const pos = [], fl = [], pole = [], size = [], idx = [], col = [];
  const kindCol = [0xf4efe4, 0x2b4f8f, 0xb33a3a, 0xf0e8d6, 0x2f6a4f];
  list.forEach((f, k) => {
    const base = pos.length / 3;
    const c = new THREE.Color(f.pennant ? [0xc0392b, 0xe6b422, 0x2a5aa8, 0xf2efe6, 0x27855a][f.kind % 5] : kindCol[f.kind % kindCol.length]);
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      pos.push(f.pos.x, f.pos.y, f.pos.z);
      fl.push(i / NU, j / NV, (k * 0.618) % 1, f.pennant ? 1 : 0);
      pole.push(f.pos.x, f.pos.y, f.pos.z);
      size.push(f.w, f.h, f.kind, 0);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = base + j * (NU + 1) + i, b = a + 1, c2 = a + NU + 1, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  g.setAttribute('aFlag', new THREE.Float32BufferAttribute(fl, 4));
  g.setAttribute('aPole', new THREE.Float32BufferAttribute(pole, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aux', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx);
  const m = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, envMap: ctx.M.stone.envMap }), 'plain', {
    key: 'flag',
    extraVert: (vs) => vs.replace('#include <common>', `#include <common>
      attribute vec4 aFlag; attribute vec3 aPole; attribute vec4 aSize; varying vec2 vFlagUv; varying float vKind;`)
      .replace('#include <beginnormal_vertex>', `
      float fu = aFlag.x, fv = aFlag.y, fph = aFlag.z;
      vec2 wd = uWindDir;
      float along = dot(aPole.xz, wd);
      float gst = uGust.z * exp(-pow((along - uGust.x) / uGust.y, 2.0));
      float strength = clamp(0.55 + 0.18 * sin(uTime * 0.31 + fph * 6.28) + gst * 0.9, 0.0, 1.3);
      float yaw = atan(wd.x, wd.y) + (0.22 * sin(uTime * 0.37 + fph * 3.0) + 0.1 * sin(uTime * 0.9 + fph * 7.0)) * (1.0 - min(gst, 1.0) * 0.8);
      vec3 dirH = vec3(sin(yaw), 0.0, cos(yaw));
      vec3 side = vec3(dirH.z, 0.0, -dirH.x);
      float L = aSize.x, H = aSize.y;
      vec3 fp;
      float wv = sin(fu * 7.0 - uTime * (4.2 + gst * 5.0) + fph * 10.0) * (0.10 + 0.10 * gst) * fu * L;
      if (aFlag.w > 0.5) {
        // pennant hanging from a line: triangle hanging down, pushed by wind
        float hang = fu * L;
        float push = 0.35 + 0.25 * strength;
        fp = aPole + vec3(0.0, -hang * (1.0 - push * 0.6), 0.0) + dirH * hang * push + side * (fv - 0.5) * H * (1.0 - fu) + side * wv * 0.6;
      } else {
        float droop = mix(1.05, 0.12, clamp(strength, 0.0, 1.0));
        float x = fu * L;
        fp = aPole + dirH * (x * cos(droop * fu * 0.9)) + vec3(0.0, -fv * H - x * sin(droop * fu) * 0.85, 0.0) + side * wv;
        fp.y -= fv * fu * 0.15 * H * (1.0 - strength);
      }
      vFlagUv = aFlag.xy; vKind = aSize.z;
      vec3 objectNormal = normalize(side + dirH * (-cos(fu * 7.0 - uTime * 4.2 + fph * 10.0) * 0.4));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = fp;\n vAux = aux;`),
    extraFrag: (fs) => fs.replace('#include <common>', '#include <common>\nvarying vec2 vFlagUv; varying float vKind;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 q = vFlagUv;
        float k = floor(vKind + 0.5);
        if (k < 9.5) {
          // emblem: gold sun disc + border band
          vec2 c = (q - vec2(0.42, 0.5)) * vec2(2.0, 1.0);
          float r = length(c);
          float sun = 1.0 - smoothstep(0.2, 0.23, r);
          float rays = step(0.25, r) * (1.0 - step(0.34, r)) * step(0.5, fract(atan(c.y, c.x) * 2.0));
          float border = step(q.y, 0.1) + step(0.9, q.y);
          vec3 gold = vec3(0.86, 0.62, 0.22);
          diffuseColor.rgb = mix(diffuseColor.rgb, gold, clamp(sun + rays + border * 0.85, 0.0, 1.0));
          if (k > 1.5 && k < 2.5) diffuseColor.rgb = mix(vec3(0.75, 0.16, 0.14), vec3(0.95, 0.8, 0.35), step(0.5, fract(q.y * 3.0)));
          // swallow tail cut
          if (q.x > 0.82 && abs(q.y - 0.5) < (q.x - 0.82) * 2.2) discard;
        } else {
          if (abs(q.y - 0.5) > 0.5 * (1.0 - q.x)) discard;
        }
      }`),
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  ctx.scene.add(mesh);
}

// ------------------------------------------------------------------ birds
function buildBirds(ctx) {
  // simple gull: body + two wings (wing vertices tagged in aux.x as ±1 for flapping)
  const pos = [], aux = [], idx = [];
  const tri = (a, b, c, wa = 0, wb = 0, wc = 0) => { const n = pos.length / 3; pos.push(...a, ...b, ...c); aux.push(wa, 0, wb, 0, wc, 0); idx.push(n, n + 1, n + 2); };
  // body (diamond)
  const nose = [0, 0, 0.55], tail = [0, 0.02, -0.6], top = [0, 0.12, 0], bot = [0, -0.1, 0.05], l = [-0.09, 0, 0], r = [0.09, 0, 0];
  tri(nose, top, l); tri(nose, r, top); tri(nose, l, bot); tri(nose, bot, r); tri(tail, l, top); tri(tail, top, r); tri(tail, bot, l); tri(tail, r, bot);
  // wings (two segments each)
  for (const s of [-1, 1]) {
    const root0 = [s * 0.08, 0.02, 0.18], root1 = [s * 0.08, 0.02, -0.15], mid0 = [s * 0.55, 0.02, 0.12], mid1 = [s * 0.55, 0.02, -0.12], tip = [s * 1.05, 0.0, -0.18];
    tri(root0, mid0, root1, 0, s * 0.5, 0); tri(root1, mid0, mid1, 0, s * 0.5, s * 0.5); tri(mid0, tip, mid1, s * 0.5, s, s * 0.5);
    tri(root0, root1, mid0, 0, 0, s * 0.5); tri(root1, mid1, mid0, 0, s * 0.5, s * 0.5); tri(mid0, mid1, tip, s * 0.5, s * 0.5, s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 2));
  const cols = new Float32Array(pos.length).fill(0.92); g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const flocks = [];
  const L = ctx.landmarks;
  const rng = new RNG(1001);
  const tc = V3(0, 0, -14);
  flocks.push({ c: tc, n: 22, r: [55, 95], y: [115, 150], w: 0.09, kind: 'circle' });
  flocks.push({ c: tc, n: 14, r: [80, 120], y: [95, 125], w: -0.07, kind: 'circle' });
  flocks.push({ c: L.bellTower ? L.bellTower.clone().setY(0) : V3(-80, 0, 40), n: 12, r: [18, 34], y: [70, 92], w: 0.13, kind: 'circle' });
  flocks.push({ c: SATS.harbor.pos.clone().setY(0), n: 8, r: [30, 55], y: [40, 60], w: -0.1, kind: 'circle' });
  const clockBirds = 16;
  const birds = [];
  for (const f of flocks) for (let i = 0; i < f.n; i++) birds.push({ f, r: rng.range(f.r[0], f.r[1]), y: rng.range(f.y[0], f.y[1]), ph: rng.next() * Math.PI * 2, wv: f.w * rng.range(0.85, 1.15), bob: rng.range(1, 4), s: rng.range(0.9, 1.25), flap: rng.range(5.5, 8) });
  // clock tower perched flock
  const T = ctx.clockTowerFrame;
  const perches = [];
  for (let i = 0; i < clockBirds; i++) {
    const side = i % 4; const off = (Math.floor(i / 4) - 1.5) * 1.5;
    const lp = [V3(off, 22.3, 4.2), V3(4.2, 22.3, off), V3(off, 22.3, -4.2), V3(-4.2, 22.3, off)][side];
    if (i >= 12) lp.set(off * 0.6, 29.9 + (i - 12) * 0.25, (i % 2 ? 1 : -1) * 0.5);
    perches.push(lp.applyMatrix4(T));
  }
  const clockC = V3(0, 0, 0).applyMatrix4(T);
  const N = birds.length + clockBirds;
  const m = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, envMap: ctx.M.stone.envMap }), 'plain', {
    key: 'bird',
    extraVert: (vs) => vs.replace('#include <common>', '#include <common>\nattribute vec2 iFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float w = aux.x; float a = sin(uTime * iFlap.x + iFlap.y) * 0.75 * iFlap.x / 7.0;
          transformed.y += abs(w) * a * 0.9 * (abs(w) > 0.7 ? 1.25 : 1.0);
          transformed.x *= 1.0 - abs(w) * abs(a) * 0.12; }`),
  });
  const im = new THREE.InstancedMesh(g, m, N);
  const flap = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { flap[i * 2] = i < birds.length ? birds[i].flap : 7.0; flap[i * 2 + 1] = rng.next() * 6.28; }
  g.setAttribute('iFlap', new THREE.InstancedBufferAttribute(flap, 2));
  im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false;
  ctx.scene.add(im);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), p2 = new THREE.Vector3();
  const flapAttr = g.attributes.iFlap;
  ctx.updaters.push((t) => {
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const a = b.ph + t * b.wv;
      const rr = b.r * (1 + 0.12 * Math.sin(t * 0.13 + b.ph * 3));
      p.set(b.f.c.x + Math.sin(a) * rr, b.y + Math.sin(t * 0.4 + b.ph) * b.bob, b.f.c.z + Math.cos(a) * rr);
      const a2 = a + 0.02 * Math.sign(b.wv);
      p2.set(b.f.c.x + Math.sin(a2) * rr, b.y + Math.sin((t + 0.2) * 0.4 + b.ph) * b.bob, b.f.c.z + Math.cos(a2) * rr);
      const dx = p2.x - p.x, dz = p2.z - p.z;
      e.set(-(p2.y - p.y) * 0.5, Math.atan2(dx, dz), -Math.sign(b.wv) * 0.35, 'YXZ'); q.setFromEuler(e);
      sc.setScalar(b.s); mm.compose(p, q, sc); im.setMatrixAt(i, mm);
    }
    // clock tower flock: perched, or startled by the bell
    const since = sinceLast('bell', t);
    for (let k = 0; k < clockBirds; k++) {
      const i = birds.length + k;
      const per = perches[k];
      const delay = 0.6 + (k % 5) * 0.25;
      const tau = since - delay;
      let flying = tau > 0 && tau < 24;
      if (flying) {
        const up = Math.min(1, tau / 2.5), land = Math.max(0, (tau - 19) / 5);
        const ang = k * 0.39 + tau * (0.32 + (k % 3) * 0.05);
        const rad = 8 + 26 * Math.min(1, tau / 4) * (1 - land);
        const hh = 12 + 10 * Math.sin(k) ;
        const target = V3(clockC.x + Math.sin(ang) * rad, per.y + hh * (1 - land) * up + 4 * Math.sin(tau * 0.7 + k), clockC.z + Math.cos(ang) * rad);
        p.copy(per).lerp(target, Math.min(1, up * (1 - land) * 1.0 + (land > 0 ? 0 : 0)));
        if (land > 0) p.copy(target).lerp(per, land);
        const ang2 = ang + 0.05;
        e.set(0, Math.atan2(Math.cos(ang2) * 1, -Math.sin(ang2) * 1), -0.3, 'YXZ'); q.setFromEuler(e);
        flapAttr.array[i * 2] = 9.0;
      } else {
        p.copy(per); p.y += 0.12 + Math.max(0, Math.sin(t * 0.7 + k * 1.7)) * 0.03;
        e.set(0.25, k * 1.1 + Math.sin(t * 0.2 + k) * 0.6, 0, 'YXZ'); q.setFromEuler(e);
        flapAttr.array[i * 2] = 0.0;
      }
      sc.setScalar(flying ? 0.9 : 0.55); mm.compose(p, q, sc); im.setMatrixAt(i, mm);
    }
    flapAttr.needsUpdate = true;
    im.instanceMatrix.needsUpdate = true;
  });
  ctx.birdsMesh = im;
}

// ------------------------------------------------------------------ crystal ball with interlocking chain rings
const BALL_VS = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vLocal;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vLocal = position; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const BALL_FS = /* glsl */`
${GLSL_UNIFORMS}
uniform float uGlow; uniform vec3 uCenter; uniform float uR;
varying vec3 vN; varying vec3 vW; varying vec3 vLocal;
${GLSL_HELPERS}
${GLSL_FOG}
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float NV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NV, 3.0);
  // refracted ray through the sphere: distance of chord to center -> inner glow
  vec3 rd = refract(-V, N, 1.0 / 1.45);
  vec3 o = vW - uCenter;
  float tc = -dot(o, rd);
  float dmin = length(o + rd * tc) / uR;
  float core = exp(-dmin * dmin * 4.0);
  float swirl = texture(tNoise2D, vec2(atan(o.z, o.x) * 0.3 + uTime * 0.02, o.y / uR * 0.4 - uTime * 0.015)).b;
  vec3 inner = mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.95, 0.82), core) * (0.6 + 2.6 * core) * uGlow * (0.85 + 0.3 * swirl);
  vec3 R = reflect(-V, N);
  vec3 refl = skyBase(R) * 1.1;
  vec3 spec = uSunColor * pow(max(dot(R, uSunDir), 0.0), 400.0) * 3.0;
  vec3 col = mix(inner, refl, fres * 0.75) + spec;
  col += vec3(0.6, 0.85, 1.0) * fres * 0.8 * uGlow;
  gl_FragColor = vec4(col, 1.0);
}
`;
const HALO_FS = /* glsl */`
uniform float uGlow; uniform vec3 uColor;
varying vec2 vQ;
void main() { float r = length(vQ); float a = exp(-r * r * 3.2) * 0.55 + exp(-r * r * 12.0) * 0.6; gl_FragColor = vec4(uColor * a * uGlow, 1.0); }
`;
function haloSprite(pos, size, color, glowUniform, layer = 1) {
  const g = new THREE.PlaneGeometry(2, 2);
  const m = new THREE.ShaderMaterial({
    vertexShader: `uniform float uSize; varying vec2 vQ; void main(){ vQ = position.xy; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: HALO_FS, uniforms: { uSize: { value: size }, uGlow: glowUniform, uColor: { value: color } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m); mesh.position.copy(pos); mesh.layers.set(layer); mesh.frustumCulled = false; mesh.renderOrder = 8;
  return mesh;
}

function buildCrystalBall(ctx) {
  const c = ctx.ballCenter; const R = 5.4;
  const glow = { value: 1.0 };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), new THREE.ShaderMaterial({ vertexShader: BALL_VS, fragmentShader: BALL_FS, uniforms: { ...sharedUniforms(), uGlow: glow, uCenter: { value: c.clone() }, uR: { value: R } } }));
  ball.position.copy(c); ball.castShadow = true; ctx.scene.add(ball);
  ctx.scene.add(haloSprite(c, 22, new THREE.Color(0.55, 0.8, 1.0), glow));
  // rings
  const rings = [];
  const defs = [[8.2, 0.42, 0.0, 0.11], [9.5, -0.75, 1.2, -0.085], [10.8, 1.15, 2.3, 0.065], [12.1, -0.3, 3.6, -0.05]];
  defs.forEach(([rad, tilt, az, spd], i) => {
    const b = new Batch('ring' + i);
    const n = Math.round(2 * Math.PI * rad / 1.32);
    const link = G.chainLink(1.9, 1.08, 0.16, 6, 14);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      const p = V3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      const tangent = V3(-Math.sin(a), 0, Math.cos(a));
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), tangent);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), (k % 2) * Math.PI / 2));
      b.add('gold', link, new THREE.Matrix4().compose(p, q, V3(1, 1, 1)), 0xeac46c);
    }
    const pivot = new THREE.Group(); pivot.position.copy(c); ctx.scene.add(pivot);
    const tiltG = new THREE.Group(); pivot.add(tiltG);
    const spin = new THREE.Group(); tiltG.add(spin);
    b.build(spin, ctx.M, { gold: { cast: true } });
    rings.push({ pivot, tiltG, spin, tilt, az, spd });
  });
  ctx.updaters.push((t) => {
    let align = 0;
    rings.forEach((r, i) => {
      r.pivot.rotation.y = r.az + t * 0.03 * (i % 2 ? -1 : 1);
      r.tiltG.rotation.x = r.tilt + Math.sin(t * 0.05 + i) * 0.12;
      r.spin.rotation.y = t * r.spd;
      align += Math.cos(r.tiltG.rotation.x * 2.0 + r.pivot.rotation.y);
    });
    glow.value = 1.0 + 0.18 * Math.sin(t * 0.6) + 0.08 * align;
  });
}

// ------------------------------------------------------------------ lighthouse beam
const BEAM_FS = /* glsl */`
${GLSL_UNIFORMS}
uniform float uIntensity;
varying vec3 vL; varying vec3 vW; varying vec3 vN; varying vec3 vVP;
${GLSL_HELPERS}
${GLSL_FOG}
void main() {
  float along = clamp(vL.y, 0.0, 1.0);
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), normalize(-vVP)));
  float core = pow(facing, 2.2);
  float a = core * pow(1.0 - along, 1.6) * smoothstep(0.0, 0.03, along) * uIntensity;
  a *= smoothstep(-345.0, -255.0, vW.y);
  float n = texture(tNoise2D, vec2(along * 4.0 - uTime * 0.04, atan(vL.x, vL.z) * 0.3)).b;
  a *= 0.7 + 0.6 * n;
  vec3 col = vec3(1.0, 0.88, 0.66) * a;
  float f = fogAmount(cameraPosition, -V, length(vW - cameraPosition));
  gl_FragColor = vec4(col * (1.0 - f * 0.85), 1.0);
}
`;
function buildLighthouseBeam(ctx) {
  const lamp = ctx.lighthouseLamp;
  const len = 520;
  const g = new THREE.ConeGeometry(1, 1, 32, 8, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI); // apex at origin, opening toward +y
  const pos = g.attributes.position; const local = [];
  for (let i = 0; i < pos.count; i++) local.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  g.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: `attribute vec3 aLocal; varying vec3 vL; varying vec3 vW; varying vec3 vN; varying vec3 vVP; void main(){ vL = aLocal; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vVP = mv.xyz; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: BEAM_FS, uniforms: { ...sharedUniforms(), uIntensity: { value: 0.75 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beams = [];
  const pivot = new THREE.Group(); pivot.position.copy(lamp); ctx.scene.add(pivot);
  for (const s of [0, Math.PI]) {
    const arm = new THREE.Group(); arm.rotation.y = s; pivot.add(arm);
    const mesh = new THREE.Mesh(g, m); mesh.scale.set(len * 0.085, len, len * 0.085);
    mesh.rotation.z = -Math.PI / 2 - 0.13; // point outward (+x), tilted down
    mesh.layers.set(1); mesh.frustumCulled = false; mesh.renderOrder = 9;
    arm.add(mesh); beams.push(mesh);
  }
  const glowU = { value: 1.0 };
  ctx.scene.add(haloSprite(lamp, 9, new THREE.Color(1.0, 0.85, 0.6), glowU));
  const A = ctx.pipeline.atmoExtra;
  const dir = new THREE.Vector3();
  ctx.updaters.push((t) => {
    pivot.rotation.y = t * (Math.PI * 2 / 20);
    dir.set(Math.cos(0.13), -Math.sin(0.13), 0).applyAxisAngle(V3(0, 1, 0), pivot.rotation.y);
    A.uLH.value.set(lamp.x, lamp.y, lamp.z, 1.0);
    A.uLHDir.value.copy(dir);
    glowU.value = 1.0 + 0.15 * Math.sin(t * 2.0);
  });
  ctx.landmarks.lighthouseBeamDir = (t) => V3(Math.cos(0.13), -Math.sin(0.13), 0).applyAxisAngle(V3(0, 1, 0), t * Math.PI * 2 / 20);
}

// ------------------------------------------------------------------ smoke, clock hands
function buildSmokeAndClocks(ctx) {
  if (ctx.smoke && ctx.smoke.length) {
    const origins = []; for (const p of ctx.smoke) for (let k = 0; k < 18; k++) origins.push(p.clone());
    ctx.scene.add(makeParticles(origins, { life: 9, drift: new THREE.Vector3(U.uWindDir.value.x * 1.4, 2.4, U.uWindDir.value.y * 1.4), size: 1.1, grow: 3.5, spread: new THREE.Vector3(0.4, 0.3, 0.4), color: new THREE.Color(0.55, 0.53, 0.52), opacity: 0.42, seed: 77 }));
    ctx.landmarks.smithSmoke = ctx.smoke[0].clone();
  }
  const hands = ctx.clockHands || [];
  if (!hands.length) return;
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const cols = new Float32Array(g.attributes.position.count * 3).fill(0.06); g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const im = new THREE.InstancedMesh(g, ctx.M.iron, hands.length * 2);
  ctx.scene.add(im); im.frustumCulled = false;
  const m = new THREE.Matrix4(), rz = new THREE.Matrix4(), s = new THREE.Matrix4();
  ctx.updaters.push((t) => {
    const hours = 16 + 20 / 60 + t / 3600 * 6; // a bit faster than real time
    hands.forEach((h, i) => {
      const aH = -(hours % 12) / 12 * Math.PI * 2, aM = -(hours % 1) * Math.PI * 2;
      m.copy(h.frame).multiply(rz.makeRotationZ(aH)).multiply(s.makeScale(0.22, h.r * 0.55, 0.08)); im.setMatrixAt(i * 2, m);
      m.copy(h.frame).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.06)).multiply(rz.makeRotationZ(aM)).multiply(s.makeScale(0.14, h.r * 0.82, 0.08)); im.setMatrixAt(i * 2 + 1, m);
    });
    im.instanceMatrix.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ small islets and distant islands
function buildIslets(ctx) {
  const defs = [
    { pos: V3(-640, 48, -60), R: 11, kind: 'tree' },
    { pos: V3(250, 98, -600), R: 9, kind: 'pavilion' },
    { pos: V3(-420, -10, -720), R: 12, kind: 'tree' },
    { pos: V3(-80, -96, 880), R: 10, kind: 'pavilion' },
  ];
  const rng = new RNG(1201);
  defs.forEach((d, i) => {
    const g = new THREE.Group(); g.position.copy(d.pos); ctx.scene.add(g);
    const b = new Batch('islet' + i);
    const rock = makeRock({ R0: d.R, depth: d.R * 1.9, seg: 48, rings: 24, seed: 90 + i, p: 1.25, q: 0.9, lobes: 0.14, strata: 0.08, layerH: 2.5, cracks: 0.1, facets: 0.08, mossDepth: 0.5 });
    b.add('rock', rock.geo, null, null, { aux: (x, y, z, k) => [rock.geo.attributes.aux.getX(k), rock.geo.attributes.aux.getY(k)] });
    b.add('grass', makeCap(rock, 32, 4), mat(0, 0.1, 0), 0x6c8c3a);
    for (let k = 0; k < 4; k++) addCrystal(b, V3(rng.range(-1, 1), -d.R * 1.6, rng.range(-1, 1)), V3(rng.range(-0.4, 0.4), -1, rng.range(-0.4, 0.4)), 2 + rng.next() * 3, 0.4, rng);
    if (d.kind === 'tree') {
      oliveTree(b, 0, 0, 0, 1.4, rng, 'foliageStatic');
    } else {
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.add('marble', G.column(4.2, 0.22, 8), mat(Math.sin(a) * 2.6, 0.4, Math.cos(a) * 2.6), 0xeee6d6); }
      b.add('stone', G.cyl(3.4, 3.6, 0.4, 18), mat(0, 0, 0), 0xe2d8c4);
      b.add('stone', G.cyl(3.2, 3.2, 0.5, 18), mat(0, 4.6, 0), 0xeee6d4);
      b.add('copper', G.lathe(G.domeProfile(3.3, 2.6, 8, 'round'), 20), mat(0, 5.1, 0), 0x5f9f8d);
      b.add('gold', new THREE.SphereGeometry(0.3, 8, 6), mat(0, 7.9, 0), 0xe8bd62);
      b.add('stone', G.box(1.8, 0.45, 0.6), mat(0, 0.4, 1.0), 0xe2d8c4);
    }
    b.build(g, ctx.M);
    const ph = rng.next() * 6.28, rs = rng.range(0.008, 0.02) * (i % 2 ? 1 : -1);
    ctx.updaters.push((t) => { g.position.y = d.pos.y + Math.sin(t * 0.22 + ph) * 1.8; g.rotation.y = ph + t * rs; g.rotation.z = Math.sin(t * 0.15 + ph) * 0.02; });
    ctx.landmarks['islet' + i] = d.pos.clone();
  });
  // distant floating island silhouettes (fogged by distance)
  const far = [
    { pos: V3(-4700, 90, -6100), R: 420, h: 520 },
    { pos: V3(2400, 160, -6800), R: 560, h: 640 },
    { pos: V3(6200, -20, -3600), R: 340, h: 420 },
  ];
  far.forEach((d, i) => {
    const b = new Batch('far' + i);
    const rock = makeRock({ R0: d.R, depth: d.h, seg: 96, rings: 40, seed: 200 + i, p: 1.25, q: 0.9, lobes: 0.14, strata: 0.06, layerH: 30, cracks: 0.08, facets: 0.06, mossDepth: 0.35 });
    b.add('rock', rock.geo, mat(d.pos.x, d.pos.y, d.pos.z), null, { aux: (x, y, z, k) => [rock.geo.attributes.aux.getX(k), 0] });
    b.add('grass', makeCap(rock, 64, 6), mat(d.pos.x, d.pos.y + 0.5, d.pos.z), 0x6c8c3a);
    // a few tower silhouettes and forest blobs
    for (let k = 0; k < 7; k++) {
      const a = rng.next() * 6.28, r = rng.next() * d.R * 0.6;
      const x = d.pos.x + Math.sin(a) * r, z = d.pos.z + Math.cos(a) * r;
      if (k < 3) { const h = 60 + rng.next() * 120; b.add('stone', G.cyl(10, 14, h, 8), mat(x, d.pos.y, z), 0xd8cfbd); b.add('copper', G.cone(16, 40, 8), mat(x, d.pos.y + h, z), 0x5f9f8d); }
      else b.add('foliageStatic', new THREE.IcosahedronGeometry(40 + rng.next() * 40, 1), mat(x, d.pos.y + 25, z), 0x4f6f34);
    }
    b.build(ctx.scene, ctx.M, { rock: { cast: false, receive: false }, grass: { cast: false }, stone: { cast: false }, copper: { cast: false }, foliageStatic: { cast: false } });
    ctx.pipeline.atmoExtra.uIslA.value[7 + i].set(d.pos.x, d.pos.y, d.pos.z, d.R);
    ctx.pipeline.atmoExtra.uIslB.value[7 + i].set(d.pos.y - d.h, 1.25, 30, 1);
  });
}

export function buildLife(ctx) {
  buildFlags(ctx);
  buildBirds(ctx);
  buildCrystalBall(ctx);
  buildLighthouseBeam(ctx);
  buildSmokeAndClocks(ctx);
  buildIslets(ctx);
}
