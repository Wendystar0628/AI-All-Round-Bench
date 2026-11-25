// Post: HDR render -> volumetric cones -> bloom -> grade/tonemap.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GU } from '../core/globals.js';

export const MAX_CONES = 28;

class VolumePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: null },
      uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uN: { value: 0 },
      uP: { value: Array.from({ length: MAX_CONES }, () => new THREE.Vector4()) },
      uD: { value: Array.from({ length: MAX_CONES }, () => new THREE.Vector4(0, -1, 0, 0.9)) },
      uC: { value: Array.from({ length: MAX_CONES }, () => new THREE.Vector4()) },
      uTime: GU.uTime, uNoise: GU.uNoise, uGust: GU.uGust, uFlash: GU.uFlash,
      uOrb: { value: [new THREE.Vector4(0, -999, 0, 1), new THREE.Vector4(0, -999, 0, 1), new THREE.Vector4(0, -999, 0, 1)] },
      uOrbC: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uStrength: { value: 1.0 },
      uProj: { value: new THREE.Matrix4() },
      uAO: { value: 0.62 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tDepth;
        uniform mat4 uInvProj; uniform mat4 uInvView; uniform vec3 uCamPos;
        uniform int uN; uniform vec4 uP[${MAX_CONES}]; uniform vec4 uD[${MAX_CONES}]; uniform vec4 uC[${MAX_CONES}];
        uniform vec4 uOrb[3]; uniform vec3 uOrbC[3];
        uniform float uTime; uniform sampler3D uNoise; uniform float uGust; uniform float uFlash; uniform float uStrength;
        uniform mat4 uProj; uniform float uAO;
        varying vec2 vUv;
        vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uInvProj * ndc; return v.xyz / v.w; }
        float ssao(vec3 P, vec3 N, float jit) {
          float R = clamp(-P.z * 0.035, 0.7, 3.2);
          vec3 T = normalize(abs(N.y) < 0.99 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0)));
          vec3 Bt = cross(N, T);
          float occ = 0.0;
          for (int i = 0; i < 12; i++) {
            float fi = float(i);
            float a = (fi + jit) * 2.399963;
            float z = (fi + 0.5) / 12.0;
            float r = sqrt(1.0 - z * z);
            float sc = mix(0.18, 1.0, (fi + 1.0) / 12.0); sc *= sc;
            vec3 S = P + (T * cos(a) * r + Bt * sin(a) * r + N * (z * 0.85 + 0.15)) * R * sc;
            vec4 c = uProj * vec4(S, 1.0); vec2 suv = c.xy / c.w * 0.5 + 0.5;
            if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
            float sz = vpos(suv).z;
            float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-3));
            occ += step(S.z + 0.06, sz) * range;
          }
          return 1.0 - occ / 12.0;
        }
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        vec3 wFromD(vec2 uv, float d) { vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uInvProj * ndc; v /= v.w; return (uInvView * v).xyz; }
        float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          if (any(isnan(base.rgb)) || any(isinf(base.rgb))) base.rgb = vec3(0.0);
          { float lum = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722)); float lim = 36.0; if (lum > lim) base.rgb *= (lim + log(1.0 + lum - lim)) / lum; }
          float d = texture2D(tDepth, vUv).x;
          vec3 wp = wFromD(vUv, d);
          vec3 ro = uCamPos; vec3 rd = normalize(wp - ro);
          if (d < 0.99999 && uAO > 0.0) {
            vec3 Pv = vpos(vUv);
            vec3 Nv = normalize(cross(dFdx(Pv), dFdy(Pv)));
            if (dot(Nv, Pv) > 0.0) Nv = -Nv;
            float aoFade = 1.0 - smoothstep(90.0, 260.0, -Pv.z);
            if (aoFade > 0.0) {
              float ao = ssao(Pv, Nv, ign(gl_FragCoord.xy));
              base.rgb *= mix(1.0, ao, uAO * aoFade);
            }
          }
          float tMax = d >= 0.99999 ? 4000.0 : length(wp - ro);
          vec3 acc = vec3(0.0);
          float jit = ign(gl_FragCoord.xy + fract(uTime * 7.0) * 17.0);
          for (int i = 0; i < ${MAX_CONES}; i++) {
            if (i >= uN) break;
            vec3 P = uP[i].xyz; float range = uP[i].w;
            vec3 D = uD[i].xyz; float cs = uD[i].w;
            float c2 = cs * cs;
            vec3 CO = ro - P;
            float vd = dot(rd, D), cod = dot(CO, D);
            float a = vd * vd - c2;
            float b = 2.0 * (vd * cod - dot(rd, CO) * c2);
            float c = cod * cod - dot(CO, CO) * c2;
            float t0 = 0.0, t1 = -1.0;
            bool inside = (cod > 0.0) && (cod * cod > dot(CO, CO) * c2);
            if (abs(a) < 1e-6) { if (abs(b) > 1e-6) { float t = -c / b; if (inside) { t0 = 0.0; t1 = t > 0.0 ? t : tMax; } else { t0 = t; t1 = tMax; } } }
            else {
              float disc = b * b - 4.0 * a * c;
              if (disc < 0.0) { if (inside) { t0 = 0.0; t1 = tMax; } else continue; }
              else {
                float sq = sqrt(disc);
                float r0 = (-b - sq) / (2.0 * a), r1 = (-b + sq) / (2.0 * a);
                if (r0 > r1) { float tt = r0; r0 = r1; r1 = tt; }
                if (inside) { t0 = 0.0; t1 = r0 > 0.0 ? r0 : r1; if (t1 < 0.0) t1 = tMax; if (a > 0.0) t1 = tMax; }
                else {
                  // ray outside: segment between roots where dot>0 side
                  vec3 m0 = ro + rd * r0 - P, m1 = ro + rd * r1 - P;
                  bool ok0 = dot(m0, D) > 0.0, ok1 = dot(m1, D) > 0.0;
                  if (a < 0.0) { t0 = r0; t1 = r1; if (!ok0 || !ok1) { if (ok1) { t0 = r1; t1 = tMax; } else if (ok0) { t0 = -1e9; t1 = r0; } else continue; } }
                  else { if (ok0 && ok1) { t0 = r0; t1 = r1; } else if (ok1) { t0 = r1; t1 = tMax; } else if (ok0) { t0 = 0.0; t1 = r0; } else continue; }
                }
              }
            }
            // clip by range along axis
            float tr0 = (dot(P - ro, D)) / (abs(vd) > 1e-5 ? vd : 1e-5);
            float tr1 = (dot(P + D * range - ro, D)) / (abs(vd) > 1e-5 ? vd : 1e-5);
            if (abs(vd) > 1e-5) { float lo = min(tr0, tr1), hi = max(tr0, tr1); t0 = max(t0, lo); t1 = min(t1, hi); }
            t0 = max(t0, 0.0); t1 = min(t1, tMax);
            if (t1 <= t0) continue;
            float seg = t1 - t0;
            const int NS = 10;
            float dt = seg / float(NS);
            vec3 sum = vec3(0.0);
            for (int k = 0; k < NS; k++) {
              float t = t0 + (float(k) + jit) * dt;
              vec3 X = ro + rd * t;
              vec3 L = X - P; float dl = length(L); vec3 Ln = L / max(dl, 1e-3);
              float ca = dot(Ln, D);
              float edge = smoothstep(cs, 1.0, ca); edge *= edge;
              float along = dot(L, D) / range;
              float fade = (1.0 - smoothstep(0.7, 1.0, along)) * smoothstep(0.0, 0.03, along);
              float att = 1.0 / (1.0 + dl * dl * uC[i].w * 0.0006);
              vec3 nq = vec3(X.x * 0.05, X.y * 0.012 + uTime * 0.35, X.z * 0.05);
              float streak = texture(uNoise, vec3(X.x * 0.55, X.y * 0.018 + uTime * 0.42, X.z * 0.55)).a;
              float dens = (0.35 + 0.9 * texture(uNoise, nq).a * texture(uNoise, nq * 2.3 + 0.37).r) * (0.55 + 0.9 * smoothstep(0.35, 0.8, streak));
              float ph = hg(dot(rd, Ln), 0.45) * 12.566;
              sum += vec3(edge * fade * att * dens * (0.4 + ph));
            }
            acc += uC[i].rgb * sum * dt * 0.012 * uStrength;
          }
          // soft orbs (reactor / visor glow in mist)
          for (int i = 0; i < 3; i++) {
            vec3 P = uOrb[i].xyz; float R = uOrb[i].w;
            float tc = clamp(dot(P - ro, rd), 0.0, tMax);
            float dd = length(ro + rd * tc - P);
            acc += uOrbC[i] * exp(-dd * dd / (R * R)) * 0.6;
          }
          gl_FragColor = vec4(base.rgb + acc, base.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    this.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    this.uniforms.uProj.value.copy(cam.projectionMatrix);
    this.uniforms.uInvView.value.copy(cam.matrixWorld);
    this.uniforms.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, uExposure: { value: 1.18 }, uTime: GU.uTime, uFlash: GU.uFlash,
      uVignette: { value: 0.28 }, uGrain: { value: 0.035 }, uRes: { value: new THREE.Vector2(1920, 1080) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uExposure; uniform float uTime; uniform float uFlash; uniform float uVignette; uniform float uGrain; uniform vec2 uRes;
        varying vec2 vUv;
        vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c) {
          const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
          const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
          c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0);
        }
        float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() {
          vec2 uv = vUv;
          vec2 dc = uv - 0.5;
          // slight chromatic aberration at edges
          float ca = dot(dc, dc) * 0.0035;
          vec3 col;
          col.r = texture2D(tDiffuse, uv - dc * ca).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv + dc * ca).b;
          col *= uExposure * (1.0 + uFlash * 0.35);
          // split toning: cool shadows, warm highlights (pre-tonemap)
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, col * vec3(0.88, 0.98, 1.12), 1.0 - smoothstep(0.0, 0.25, lum));
          col = aces(col);
          // vignette
          float v = 1.0 - uVignette * smoothstep(0.25, 1.0, length(dc * vec2(1.25, 1.0)) * 1.25);
          col *= v;
          col = toSRGB(col);
          // grain
          float g = h12(gl_FragCoord.xy + fract(uTime * 13.0) * 100.0) - 0.5;
          col += g * uGrain * (0.6 + 0.4 * (1.0 - col.g));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

export function createPost(renderer, scene, camera, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(w, h);
  rt.depthTexture.type = THREE.UnsignedIntType;
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  const renderPass = new RenderPass(scene, camera);
  const volume = new VolumePass(camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.5, 1.2);
  const grade = new GradePass();
  composer.addPass(renderPass);
  composer.addPass(volume);
  composer.addPass(bloom);
  composer.addPass(grade);
  return {
    composer, volume, bloom, grade, renderPass,
    setSize(W, H) {
      composer.setSize(W, H);
      grade.uniforms.uRes.value.set(W, H);
    },
    render() { composer.render(); },
  };
}
