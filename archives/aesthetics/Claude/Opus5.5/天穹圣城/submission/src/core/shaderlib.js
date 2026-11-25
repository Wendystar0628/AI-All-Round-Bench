// Shared GLSL snippets. Every shader that uses these must receive the uniforms in U (see uniforms.js).

export const GLSL_UNIFORMS = /* glsl */`
uniform sampler2D tNoise2D;
uniform highp sampler3D tNoise3D;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec2 uWindDir;
uniform vec4 uGust;      // x: front position along wind axis, y: width, z: strength, w: unused
uniform vec4 uCloudEvt;  // xy: shadow blob center (world xz), z: radius, w: strength
uniform vec3 uFogSun;
uniform vec3 uFogAway;
uniform vec4 uFogParams; // x: density at y0, y: height falloff, z: y0, w: max
uniform float uSkyK;
`;

export const GLSL_HELPERS = /* glsl */`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec4 triplanar(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return texture(t, p.zy * s) * w.x + texture(t, p.xz * s + 0.31) * w.y + texture(t, p.xy * s + 0.67) * w.z;
}
// Mikkelsen surface-gradient bump in view space
vec3 bumpPerturb(vec3 n, vec3 pos, float h, float scale) {
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - scale * g);
}
`;

// Upper broken cloud layer: casts drifting shadows on everything and defines the sky gaps.
export const GLSL_CLOUDSHADOW = /* glsl */`
const float UPPER_H = 1700.0;
float upperCoverage(vec2 q) {
  vec2 drift = uWindDir * uTime * 7.0;
  float n1 = texture(tNoise2D, (q - drift) / 9000.0).r;
  float n2 = texture(tNoise2D, (q - drift * 1.25) / 3600.0 + 0.37).g;
  float n3 = texture(tNoise2D, (q - drift * 1.5) / 1300.0 + 0.71).b;
  float c = n1 * 0.5 + n2 * 0.35 + n3 * 0.15;
  return smoothstep(0.47, 0.66, c);
}
float cloudShadow(vec3 wp) {
  float sy = max(uSunDir.y, 0.05);
  vec2 q = wp.xz + uSunDir.xz * ((UPPER_H - wp.y) / sy);
  float c = upperCoverage(q);
  // keep the holy city mostly in the sun: a designed gap above the main island
  vec2 g = wp.xz + uSunDir.xz * (60.0 - wp.y) / sy; // projected onto the island top plane
  float gap = 1.0 - smoothstep(170.0, 420.0, length(g));
  c *= 1.0 - gap * 0.85;
  float sh = 1.0 - 0.5 * c;
  // scripted / occasional big cloud shadow passing over the city
  if (uCloudEvt.w > 0.0) {
    vec2 e = g - uCloudEvt.xy;
    float m = 1.0 - smoothstep(uCloudEvt.z * 0.55, uCloudEvt.z, length(e * vec2(1.0, 1.35)));
    float nn = texture(tNoise2D, g / 380.0 + uTime * 0.002).r;
    m *= smoothstep(0.05, 0.45, nn + m * 0.5);
    m *= 1.0 - smoothstep(280.0, 380.0, length(g));
    sh *= 1.0 - uCloudEvt.w * m;
  }
  return sh;
}
`;

// Aerial perspective, shared by the atmosphere pass and custom transparent shaders.
export const GLSL_FOG = /* glsl */`
vec3 skyBase(vec3 rd) {
  float y = rd.y;
  float mu = dot(rd, uSunDir);
  vec3 zen = vec3(0.10, 0.245, 0.62);
  vec3 hor = vec3(0.66, 0.74, 0.86);
  float hy = clamp(y, 0.0, 1.0);
  vec3 col = mix(hor, zen, pow(hy, 0.42));
  vec2 a = normalize(rd.xz + 1e-5), b = normalize(uSunDir.xz);
  float az = max(dot(a, b), 0.0);
  float band = exp(-max(y, 0.0) * 5.5);
  col = mix(col, vec3(1.0, 0.80, 0.58), band * pow(az, 2.0) * 0.55);
  col += vec3(1.0, 0.70, 0.40) * (0.20 * pow(max(mu, 0.0), 5.0) + 0.55 * pow(max(mu, 0.0), 40.0));
  if (y < 0.0) col = mix(col, vec3(0.50, 0.53, 0.68), clamp(-y * 1.6, 0.0, 1.0));
  return col * uSkyK;
}
vec3 fogInscatter(vec3 rd) {
  // haze colour = sky just above the horizon in the same azimuth (seamless horizon)
  vec3 c = skyBase(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.35 + 0.02, rd.z)));
  float down = clamp(-rd.y * 2.5, 0.0, 1.0);
  c = mix(c, c * vec3(0.90, 0.92, 1.03), down);
  return c;
}
float fogAmount(vec3 ro, vec3 rd, float dist) {
  float a = uFogParams.x, b = uFogParams.y;
  float fh = a * exp(-b * (ro.y - uFogParams.z));
  float k = rd.y * b;
  float integ = abs(k) > 1e-4 ? fh * (1.0 - exp(-k * dist)) / k : fh * dist;
  integ += max(dist - 2200.0, 0.0) * 1.1e-4;
  return min(1.0 - exp(-max(integ, 0.0)), uFogParams.w);
}
vec3 applyFog(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition; float dist = length(d); vec3 rd = d / max(dist, 1e-3);
  return mix(col, fogInscatter(rd), fogAmount(cameraPosition, rd, dist));
}
`;
