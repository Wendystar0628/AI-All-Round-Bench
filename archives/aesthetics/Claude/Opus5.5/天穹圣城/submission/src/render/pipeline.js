import * as THREE from 'three';
import { U, sharedUniforms } from '../core/uniforms.js';
import { ATMO_FRAG, FS_VERT } from './atmosphere.js';

const SSAO_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uRes;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
vec3 vpos(vec2 uv) {
  float d = texture(tDepth, uv).x;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float d = texture(tDepth, vUv).x;
  if (d >= 0.99999994) { outColor = vec4(1.0); return; }
  vec3 P = vpos(vUv);
  vec2 px = 1.0 / uRes;
  vec3 Pr = vpos(vUv + vec2(px.x, 0.0)), Pl = vpos(vUv - vec2(px.x, 0.0));
  vec3 Pu = vpos(vUv + vec2(0.0, px.y)), Pd = vpos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  float dist = -P.z;
  float radius = clamp(dist * 0.010, 0.45, 9.0);
  float rnd = ign(gl_FragCoord.xy) * 6.2831;
  float occ = 0.0;
  const int K = 14;
  vec3 up = abs(N.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, N)); vec3 B = cross(N, T);
  for (int i = 0; i < K; i++) {
    float fi = (float(i) + 0.5) / float(K);
    float a = fi * 23.0 + rnd;
    float r = sqrt(fi);
    float z = sqrt(max(1.0 - r * r, 0.0));
    vec3 s = (T * cos(a) * r + B * sin(a) * r + N * z) * radius * mix(0.2, 1.0, fi * fi);
    vec3 Q = P + s;
    vec4 c = uProj * vec4(Q, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
    vec3 S = vpos(suv);
    float diff = S.z - Q.z;
    float rangeOk = smoothstep(0.0, 1.0, radius / max(abs(P.z - S.z), 1e-3));
    occ += step(0.02 * radius + 0.02, diff) * rangeOk;
  }
  float ao = 1.0 - occ / float(K);
  ao = pow(clamp(ao, 0.0, 1.0), 1.3);
  outColor = vec4(ao, -P.z, 0.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tAO;
uniform vec2 uDir;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 c = texture(tAO, vUv);
  float z0 = c.g;
  float sum = c.r, w = 1.0;
  for (int i = 1; i <= 4; i++) {
    for (int s = -1; s <= 1; s += 2) {
      vec2 o = uDir * float(i * s);
      vec4 q = texture(tAO, vUv + o);
      float wz = exp(-abs(q.g - z0) / max(z0 * 0.02, 0.05));
      float wk = exp(-float(i * i) * 0.12) * wz;
      sum += q.r * wk; w += wk;
    }
  }
  outColor = vec4(sum / w, z0, 0.0, 1.0);
}
`;

const DOWN_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uPrefilter;
uniform float uThreshold;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
vec3 S(vec2 o) { return texture(tSrc, vUv + o * uTexel).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 a = S(vec2(-2, 2)), b = S(vec2(0, 2)), c = S(vec2(2, 2));
  vec3 d = S(vec2(-2, 0)), e = S(vec2(0, 0)), f = S(vec2(2, 0));
  vec3 g = S(vec2(-2, -2)), h = S(vec2(0, -2)), i = S(vec2(2, -2));
  vec3 j = S(vec2(-1, 1)), k = S(vec2(1, 1)), l = S(vec2(-1, -1)), m = S(vec2(1, -1));
  vec3 col;
  if (uPrefilter > 0.5) {
    // Karis average to tame fireflies
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = 1.0 / (1.0 + lum(g0)), w1 = 1.0 / (1.0 + lum(g1)), w2 = 1.0 / (1.0 + lum(g2)), w3 = 1.0 / (1.0 + lum(g3)), w4 = 1.0 / (1.0 + lum(g4));
    col = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
    float br = lum(col);
    float soft = clamp(br - uThreshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;
    float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
    col *= contrib;
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  outColor = vec4(col, 1.0);
}
`;

const UP_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;
uniform float uRadius;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 s = texture(tLow, vUv).rgb * 4.0;
  s += (texture(tLow, vUv + vec2(-o.x, 0)).rgb + texture(tLow, vUv + vec2(o.x, 0)).rgb + texture(tLow, vUv + vec2(0, o.y)).rgb + texture(tLow, vUv + vec2(0, -o.y)).rgb) * 2.0;
  s += texture(tLow, vUv + o).rgb + texture(tLow, vUv - o).rgb + texture(tLow, vUv + vec2(o.x, -o.y)).rgb + texture(tLow, vUv + vec2(-o.x, o.y)).rgb;
  outColor = vec4(s / 16.0 + texture(tHigh, vUv).rgb, 1.0);
}
`;

const FINAL_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tHDR;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform vec2 uRes;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
// ACES fitted (Stephen Hill)
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 ACESFitted(vec3 c) {
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 c = texture(tHDR, vUv).rgb;
  vec3 b = texture(tBloom, vUv).rgb;
  c += b * uBloom;
  c *= uExposure;
  // gentle split toning before the curve: warm lights, cool-violet shadows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.93, 0.95, 1.07), vec3(1.035, 1.0, 0.955), smoothstep(0.02, 0.6, l));
  c = ACESFitted(c * 1.05);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l2), c, 1.13);
  // vignette
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  float v = 1.0 - smoothstep(0.55, 1.25, length(q));
  c *= mix(0.82, 1.0, v);
  c = toSRGB(clamp(c, 0.0, 1.0));
  c += (ign(gl_FragCoord.xy + fract(uFrame * 0.618) * 97.0) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}
`;

export class Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri, null); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.frame = 0;
    this.samples = 4;
    this.aoStrength = 0.75;
    this.exposure = 0.74;
    this.bloom = 0.075;
    this.bloomThreshold = 1.7;
    this.atmoExtra = {
      uSeaTop: { value: -330 },
      uIslA: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uIslB: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBeamA: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBeamB: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uLH: { value: new THREE.Vector4(0, 0, 0, 0) },
      uLHDir: { value: new THREE.Vector3(1, 0, 0) },
      uAmbTop: { value: new THREE.Color(0.25, 0.30, 0.48) },
      uAmbBot: { value: new THREE.Color(0.07, 0.07, 0.16) },
    };
    this._makeMaterials();
    this.setSize(2, 2, 1);
  }

  _mat(frag, uniforms, extra = {}) {
    return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, ...extra });
  }

  _makeMaterials() {
    this.mSSAO = this._mat(SSAO_FRAG, { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uFrame: { value: 0 } });
    this.mBlur = this._mat(BLUR_FRAG, { tAO: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mAtmo = this._mat(ATMO_FRAG, {
      ...sharedUniforms(), ...this.atmoExtra,
      tScene: { value: null }, tDepth: { value: null }, tAO: { value: null },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2() }, uAOStrength: { value: this.aoStrength }, uFrame: { value: 0 },
    }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    this.mDown = this._mat(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 }, uThreshold: { value: 1 } });
    this.mUp = this._mat(UP_FRAG, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.mFinal = this._mat(FINAL_FRAG, { tHDR: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.05 }, uRes: { value: new THREE.Vector2() }, uFrame: { value: 0 } });
  }

  setSize(w, h, pr) {
    w = Math.max(2, Math.floor(w * pr)); h = Math.max(2, Math.floor(h * pr));
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    const dispose = (rt) => rt && rt.dispose();
    [this.rtScene, this.rtAO, this.rtAO2, this.rtAtmo, this.rtResolve].forEach(dispose);
    (this.down || []).forEach(dispose); (this.up || []).forEach(dispose);
    const big = w * h > 9.0e6;
    const samples = big ? 2 : this.samples;
    const depthTex = new THREE.DepthTexture(w, h); depthTex.type = THREE.FloatType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true, depthTexture: depthTex });
    this.rtScene.texture.minFilter = this.rtScene.texture.magFilter = THREE.LinearFilter;
    const aw = Math.max(1, w >> 1), ah = Math.max(1, h >> 1);
    this.rtAO = new THREE.WebGLRenderTarget(aw, ah, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtAO2 = new THREE.WebGLRenderTarget(aw, ah, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtAtmo = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    // bloom chain
    this.down = []; this.up = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < 6; i++) {
      const rt = new THREE.WebGLRenderTarget(Math.max(1, bw), Math.max(1, bh), { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      this.down.push(rt);
      const ru = new THREE.WebGLRenderTarget(Math.max(1, bw), Math.max(1, bh), { type: THREE.HalfFloatType, depthBuffer: false });
      ru.texture.minFilter = ru.texture.magFilter = THREE.LinearFilter;
      this.up.push(ru);
      bw >>= 1; bh >>= 1;
    }
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene, camera, opts = {}) {
    const r = this.renderer;
    this.frame++;
    camera.updateMatrixWorld();
    // 1. opaque scene (layer 0) into HDR MSAA target with depth texture
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true;
    camera.layers.set(0);
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1); r.clear(true, true, true);
    r.render(scene, camera);
    // 2. SSAO at half res
    const aw = this.rtAO.width, ah = this.rtAO.height;
    this.mSSAO.uniforms.tDepth.value = this.rtScene.depthTexture;
    this.mSSAO.uniforms.uProj.value.copy(camera.projectionMatrix);
    this.mSSAO.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    this.mSSAO.uniforms.uRes.value.set(aw, ah);
    this._pass(this.mSSAO, this.rtAO);
    this.mBlur.uniforms.tAO.value = this.rtAO.texture; this.mBlur.uniforms.uDir.value.set(1 / aw, 0);
    this._pass(this.mBlur, this.rtAO2);
    this.mBlur.uniforms.tAO.value = this.rtAO2.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / ah);
    this._pass(this.mBlur, this.rtAO);
    // 3. atmosphere (sky, cloud sea, fog, shafts) -> rtAtmo (+ depth)
    const A = this.mAtmo.uniforms;
    A.tScene.value = this.rtScene.texture; A.tDepth.value = this.rtScene.depthTexture; A.tAO.value = this.rtAO.texture;
    A.uInvProj.value.copy(camera.projectionMatrixInverse); A.uCamWorld.value.copy(camera.matrixWorld);
    A.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    A.uRes.value.set(this.w, this.h); A.uAOStrength.value = this.aoStrength; A.uFrame.value = opts.frameSeed !== undefined ? opts.frameSeed : this.frame;
    r.setRenderTarget(this.rtAtmo);
    r.clear(true, true, true);
    this.quad.material = this.mAtmo;
    r.render(this.quadScene, this.quadCam);
    // 4. transparent layer (water, mist, glow, beams) into rtAtmo with depth test
    camera.layers.set(1);
    const ac = r.autoClear; r.autoClear = false;
    r.setRenderTarget(this.rtAtmo);
    r.render(scene, camera);
    r.autoClear = ac;
    camera.layers.set(0);
    // 5. bloom
    let src = this.rtAtmo.texture;
    for (let i = 0; i < this.down.length; i++) {
      const D = this.mDown.uniforms; D.tSrc.value = src;
      D.uTexel.value.set(1 / (i === 0 ? this.w : this.down[i - 1].width), 1 / (i === 0 ? this.h : this.down[i - 1].height));
      D.uPrefilter.value = i === 0 ? 1 : 0; D.uThreshold.value = this.bloomThreshold;
      this._pass(this.mDown, this.down[i]);
      src = this.down[i].texture;
    }
    let low = this.down[this.down.length - 1].texture;
    for (let i = this.down.length - 2; i >= 0; i--) {
      const P = this.mUp.uniforms; P.tLow.value = low; P.tHigh.value = this.down[i].texture;
      P.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height); P.uRadius.value = 1.0;
      this._pass(this.mUp, this.up[i]);
      low = this.up[i].texture;
    }
    // 6. final
    const F = this.mFinal.uniforms;
    F.tHDR.value = this.rtAtmo.texture; F.tBloom.value = this.up[0].texture;
    F.uExposure.value = this.exposure; F.uBloom.value = this.bloom; F.uRes.value.set(this.w, this.h); F.uFrame.value = A.uFrame.value;
    this._pass(this.mFinal, null);
  }
}
