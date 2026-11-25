import * as THREE from 'three';
import { GLSL_UNIFORMS, GLSL_HELPERS, GLSL_CLOUDSHADOW, GLSL_FOG } from '../core/shaderlib.js';

// Sky model shared by the atmosphere pass and the environment-map generator.
export const GLSL_SKY = /* glsl */`
vec3 upperCloudsSky(vec3 ro, vec3 rd, vec3 col) {
  if (rd.y <= 0.004) return col;
  float t = (UPPER_H - ro.y) / rd.y;
  vec2 q = ro.xz + rd.xz * t;
  float c = upperCoverage(q);
  float cs = upperCoverage(q + uSunDir.xz * 330.0);
  float mu = dot(rd, uSunDir);
  float lit = clamp(0.55 + (c - cs) * 2.4, 0.0, 1.0);
  float detail = texture(tNoise2D, q / 760.0 + uTime * 0.0006).b;
  vec3 shade = vec3(0.50, 0.53, 0.68);
  vec3 bright = vec3(1.08, 0.98, 0.86);
  vec3 cc = mix(shade, bright, lit * (0.75 + 0.35 * detail));
  cc += uSunColor * 0.16 * pow(max(mu, 0.0), 4.0) * (1.0 - c * 0.6);
  cc *= uSkyK;
  float fade = smoothstep(0.004, 0.16, rd.y) * exp(-t / 70000.0);
  // thin high cirrus streaks
  float t2 = (4200.0 - ro.y) / rd.y;
  vec2 q2 = ro.xz + rd.xz * t2;
  float ci = texture(tNoise2D, vec2(q2.x / 9000.0, q2.y / 2600.0) + uTime * 0.00008).b;
  float cir = smoothstep(0.55, 0.85, ci) * smoothstep(0.02, 0.3, rd.y) * 0.35;
  col = mix(col, vec3(1.0, 0.97, 0.94) * uSkyK * 1.05, cir);
  return mix(col, cc, clamp(c * 1.15, 0.0, 0.97) * fade);
}
// towering cumulus banks along the horizon (sky-only, painterly)
vec3 horizonCumulus(vec3 rd, vec3 col) {
  if (rd.y < -0.02 || rd.y > 0.3) return col;
  float a = atan(rd.z, rd.x);
  float sa = atan(uSunDir.z, uSunDir.x);
  float n1 = texture(tNoise2D, vec2(a * 0.35, 0.21)).r;
  float n2 = texture(tNoise2D, vec2(a * 1.1, 0.63)).g;
  float n3 = texture(tNoise2D, vec2(a * 3.3, 0.37)).a;
  float gapMask = smoothstep(0.32, 0.62, texture(tNoise2D, vec2(a * 0.55 + 0.4, 0.77)).r);
  float top = 0.004 + gapMask * (0.13 * pow(clamp(n1 * 1.3 - 0.2, 0.0, 1.0), 2.0) + 0.04 * n2 + 0.014 * n3);
  float puff = texture(tNoise2D, vec2(a * 2.6, rd.y * 9.0 + 0.3)).b;
  float edge = top + (puff - 0.5) * 0.02;
  float d = smoothstep(edge + 0.006, edge - 0.01, rd.y);
  if (d <= 0.0) return col;
  float facing = 0.5 + 0.5 * cos(a - sa);
  float hfrac = clamp(rd.y / max(top, 0.01), 0.0, 1.0);
  float lit = clamp(0.25 + 0.55 * facing + 0.35 * hfrac + (puff - 0.5) * 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.50, 0.53, 0.72), vec3(1.08, 0.95, 0.82), lit) * uSkyK;
  c += uSunColor * 0.08 * pow(facing, 6.0) * hfrac;
  // aerial haze: distant towers fade into the horizon colour near the base
  vec3 haze = skyBase(vec3(rd.x, 0.02, rd.z));
  c = mix(haze, c, 0.55 + 0.35 * hfrac);
  return mix(col, c, d * 0.92);
}
vec3 sunDisk(vec3 rd) {
  float mu = dot(rd, uSunDir);
  return uSunColor * 18.0 * smoothstep(0.99975, 0.99990, mu);
}
`;

export const ATMO_FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
${GLSL_UNIFORMS}
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec2 uRes;
uniform float uSeaTop;
uniform float uAOStrength;
uniform vec4 uIslA[10];
uniform vec4 uIslB[10];
uniform vec4 uBeamA[6];
uniform vec4 uBeamB[6];
uniform vec4 uLH;     // lighthouse lamp pos xyz, intensity
uniform vec3 uLHDir;  // beam direction
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform float uFrame;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${GLSL_HELPERS}
${GLSL_CLOUDSHADOW}
${GLSL_FOG}
${GLSL_SKY}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float seaH(vec2 xz) {
  vec2 w = uWindDir * uTime;
  float lo = texture(tNoise2D, (xz + w * 1.4) / 5200.0).r;
  float cu = texture(tNoise2D, (xz + w * 2.4) / 2900.0 + 0.17).g;
  float cu2 = texture(tNoise2D, (xz + w * 3.4) / 1500.0 + 0.61).a;
  float fi = texture(tNoise2D, (xz + w * 4.4) / 210.0 + 0.29).b;
  return uSeaTop + (lo - 0.5) * 130.0 + cu * 120.0 + cu2 * 26.0 + (fi - 0.5) * 7.0;
}
float seaHCheap(vec2 xz) {
  vec2 w = uWindDir * uTime;
  float lo = texture(tNoise2D, (xz + w * 1.4) / 5200.0).r;
  float cu = texture(tNoise2D, (xz + w * 2.4) / 2900.0 + 0.17).g;
  float cu2 = texture(tNoise2D, (xz + w * 3.4) / 1500.0 + 0.61).a;
  return uSeaTop + (lo - 0.5) * 130.0 + cu * 120.0 + cu2 * 26.0;
}
float seaDens(vec3 p, float h) {
  float dTop = h - p.y;
  vec3 q = p * (1.0 / 150.0) + vec3(uWindDir.x, 0.0, uWindDir.y) * uTime * 0.012 + vec3(0.0, uTime * 0.004, 0.0);
  float n = texture(tNoise3D, q).r;
  float n2 = texture(tNoise3D, q * 3.1 + 0.31).g;
  float e = dTop + (n - 0.5) * 26.0 + (n2 - 0.5) * 9.0;
  return smoothstep(0.0, 20.0, e);
}
float seaDensCheap(vec3 p) {
  float h = seaHCheap(p.xz);
  return smoothstep(0.0, 30.0, h - p.y + 6.0);
}

float islandShadow(vec3 p) {
  float sh = 1.0;
  float sy = max(uSunDir.y, 0.05);
  for (int i = 0; i < 10; i++) {
    vec4 A = uIslA[i]; vec4 B = uIslB[i];
    if (B.w < 0.5) continue;
    float yT = A.y + B.z, yB = B.x;
    for (int k = 0; k < 7; k++) {
      float y = mix(yB, yT, (float(k) + 0.5) / 7.0);
      if (y < p.y) continue;
      vec3 q = p + uSunDir * ((y - p.y) / sy);
      float s = clamp((A.y - y) / max(A.y - yB, 1.0), 0.0, 1.0);
      float r = y > A.y ? A.w * 0.82 : A.w * (1.0 - pow(max(s, 1e-4), B.y));
      float dd = length(q.xz - A.xz) - r;
      sh = min(sh, smoothstep(-6.0 - r * 0.08, 14.0 + r * 0.12, dd));
    }
  }
  return sh;
}

float HG(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }

vec4 cloudSea(vec3 ro, vec3 rd, float tScene, float jit, out float tHit) {
  tHit = -1.0;
  float yTop = uSeaTop + 175.0, yBot = uSeaTop - 220.0;
  float t0, t1;
  if (abs(rd.y) < 1e-5) { if (ro.y > yTop || ro.y < yBot) return vec4(0.0, 0.0, 0.0, 1.0); t0 = 0.0; t1 = 60000.0; }
  else {
    float ta = (yTop - ro.y) / rd.y, tb = (yBot - ro.y) / rd.y;
    t0 = max(min(ta, tb), 0.0); t1 = max(ta, tb);
  }
  t1 = min(t1, min(tScene, 60000.0));
  if (t0 >= t1) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 acc = vec3(0.0); float T = 1.0;
  float mu = dot(rd, uSunDir);
  float phase = mix(HG(mu, 0.62), HG(mu, -0.18), 0.55) * 12.566;
  float t = t0 + jit * clamp(t0 * 0.006, 2.0, 40.0);
  float shF = 1.0; float lhF = 0.0;
  vec3 sunC = uSunColor * vec3(1.0, 0.94, 0.84) * 1.22;
  for (int i = 0; i < 110; i++) {
    if (t >= t1 || T < 0.012) break;
    vec3 p = ro + rd * t;
    float h = seaH(p.xz);
    float gap = p.y - h;
    float stepBase = clamp(t * 0.0055, 2.2, 90.0);
    if (gap > 34.0) {
      float dt = rd.y < -0.004 ? (gap - 26.0) / -rd.y : stepBase * 3.0;
      t += clamp(dt, stepBase, max(320.0, t * 0.06));
      continue;
    }
    float dens = seaDens(p, h);
    float dt = stepBase;
    if (dens > 0.002) {
      if (tHit < 0.0) {
        tHit = t;
        shF = cloudShadow(p) * mix(0.16, 1.0, islandShadow(p));
        // spotlights where the light shafts land on the cloud tops
        float bm = 0.0;
        for (int k = 0; k < 6; k++) {
          if (uBeamB[k].x <= 0.0) continue;
          vec3 v = p - uBeamA[k].xyz; float al = dot(v, uSunDir); vec3 pp = v - uSunDir * al;
          bm += exp(-dot(pp, pp) / (uBeamA[k].w * uBeamA[k].w) * 1.3);
        }
        shF *= 0.86 + 0.5 * min(bm, 1.2);
        // lighthouse beam spill on the cloud tops
        vec3 lv = p - uLH.xyz; float ld = length(lv);
        float ca = dot(lv / ld, uLHDir);
        lhF = uLH.w * smoothstep(0.93, 0.995, ca) * 9000.0 / (ld * ld * 0.004 + 9000.0);
      }
      float sig = dens * 0.052;
      float od = (seaDensCheap(p + uSunDir * 10.0) * 10.0 + seaDensCheap(p + uSunDir * 30.0) * 20.0 + seaDensCheap(p + uSunDir * 75.0) * 45.0 + seaDensCheap(p + uSunDir * 170.0) * 95.0) * 0.045;
      float Tsun = exp(-od) * 0.7 + 0.36 * exp(-od * 0.25) + 0.12 * exp(-od * 0.06);
      float powder = 1.0 - 0.45 * exp(-sig * 30.0);
      float hf = clamp((p.y - (h - 70.0)) / 70.0, 0.0, 1.0);
      vec3 amb = mix(uAmbBot, uAmbTop, hf * hf);
      vec3 L = sunC * Tsun * phase * powder * shF * 0.42 + amb + vec3(1.0, 0.86, 0.6) * lhF * Tsun;
      float Ts = exp(-sig * dt);
      acc += T * L * (1.0 - Ts);
      T *= Ts;
    }
    t += dt;
  }
  return vec4(acc, T);
}

// art-directed light shafts falling through the upper cloud gaps (analytic line integral, noise free)
vec3 lightShafts(vec3 ro, vec3 rd, float tMax, float jit) {
  float acc = 0.0;
  vec3 Ls = uSunDir;
  vec3 side = normalize(cross(Ls, vec3(0.0, 1.0, 0.0)));
  for (int k = 0; k < 6; k++) {
    vec4 A = uBeamA[k]; vec4 B = uBeamB[k];
    if (B.x <= 0.0) continue;
    vec3 w0 = ro - A.xyz;
    float bb = dot(rd, Ls), d = dot(rd, w0), e = dot(Ls, w0);
    float den = max(1.0 - bb * bb, 0.02);
    float tr = (bb * e - d) / den;
    float sa = (e - bb * d) / den;
    vec3 pc = w0 + rd * tr - Ls * sa;
    float r = A.w;
    float dm2 = dot(pc, pc) / (r * r);
    if (dm2 > 6.0) continue;
    float prof = exp(-dm2 * 1.6);
    float sx = dot(pc, side) / r;
    float st = 0.45 + 0.75 * smoothstep(0.3, 0.75, texture(tNoise2D, vec2(sx * 0.42 + B.w, sa * 0.00018 + uTime * 0.0015)).b);
    float axial = smoothstep(-30.0, 140.0, sa) * (1.0 - smoothstep(B.y * 0.55, B.y, sa));
    float vis = smoothstep(0.0, 80.0, tr) * (1.0 - smoothstep(tMax - 60.0, tMax + 30.0, tr));
    float len = r * 1.6 / sqrt(den);
    acc += B.x * prof * st * axial * vis * len * exp(-max(tr, 0.0) * 0.00012);
  }
  float mu = dot(rd, uSunDir);
  float ph = 0.35 + 2.2 * pow(max(mu, 0.0), 3.0);
  return uSunColor * acc * 0.00016 * ph;
}

void main() {
  vec2 uv = vUv;
  float d = texture(tDepth, uv).x;
  vec3 col = texture(tScene, uv).rgb;
  vec4 ndcF = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec4 vf = uInvProj * ndcF; vf /= vf.w;
  vec3 rd = normalize((uCamWorld * vec4(vf.xyz, 0.0)).xyz);
  vec3 ro = uCamPos;
  bool sky = d >= 0.99999994;
  float sceneDist = 1e9;
  float jit = ign(gl_FragCoord.xy + uFrame * 5.588238);
  if (!sky) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 vp = uInvProj * ndc; vp /= vp.w;
    sceneDist = length(vp.xyz);
    float ao = texture(tAO, uv).r;
    col *= mix(1.0, ao, uAOStrength);
    col = mix(col, fogInscatter(rd), fogAmount(ro, rd, sceneDist));
  } else {
    col = skyBase(rd);
    col = horizonCumulus(rd, col);
    col = upperCloudsSky(ro, rd, col);
    col += sunDisk(rd) * step(0.0, rd.y);
  }
  float tHit;
  vec4 cs = cloudSea(ro, rd, sceneDist, jit, tHit);
  if (tHit > 0.0) {
    float f = fogAmount(ro, rd, tHit);
    cs.rgb = mix(cs.rgb, fogInscatter(rd) * (1.0 - cs.a), f);
  }
  col = col * cs.a + cs.rgb;
  float tShaft = tHit > 0.0 ? min(sceneDist, tHit) : sceneDist;
  col += lightShafts(ro, rd, tShaft, hash12(gl_FragCoord.xy * 1.37 + fract(uFrame * 0.3819) * 113.0));
  outColor = vec4(col, 1.0);
  gl_FragDepth = d;
}
`;

export const FS_VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// sky-only shader used to render the environment cube
export const ENV_FRAG = /* glsl */`
precision highp float;
precision highp sampler3D;
${GLSL_UNIFORMS}
in vec3 vDir;
layout(location = 0) out vec4 outColor;
${GLSL_HELPERS}
${GLSL_CLOUDSHADOW}
${GLSL_FOG}
${GLSL_SKY}
void main() {
  vec3 rd = normalize(vDir);
  vec3 col = skyBase(rd);
  col = upperCloudsSky(vec3(0.0, 100.0, 0.0), rd, col);
  if (rd.y < 0.0) {
    // bright cloud sea below
    float k = smoothstep(0.0, -0.25, rd.y);
    vec3 sea = mix(vec3(0.95, 0.90, 0.86), vec3(0.62, 0.64, 0.80), 0.35) * uSkyK * 1.05;
    col = mix(col, sea, k);
  }
  outColor = vec4(col, 1.0);
}
`;
export const ENV_VERT = /* glsl */`
out vec3 vDir;
void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
