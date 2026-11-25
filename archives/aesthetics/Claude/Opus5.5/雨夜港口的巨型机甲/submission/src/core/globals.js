// Global shared uniforms + custom fog chunk (height-attenuated, warm toward the port)
import * as THREE from 'three';

export const GU = {
  uTime: { value: 0 },
  uFlash: { value: 0 },      // lightning flash (0..1+)
  uGust: { value: 0 },       // gust strength 0..1
  uRain: { value: 1 },       // rain intensity multiplier
  uNoise: { value: null },
};

// Replace three's fog chunks globally (applies to all built-in + ShaderMaterial(fog:true))
THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogW;
#endif`;
THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogW = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz + cameraPosition;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogW;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  vec3 portFogColor(vec3 dir, vec3 base) {
    // warm sodium glow toward the port (-z) near the horizon, cool elsewhere
    float toPort = smoothstep(-0.2, 0.9, dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5), vec3(0.0, 0.0, -1.0)));
    float horizon = 1.0 - smoothstep(0.0, 0.45, abs(dir.y));
    vec3 warm = base * vec3(2.2, 1.4, 0.85);
    return mix(base, warm, toPort * horizon * 0.7);
  }
#endif`;
THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  {
    vec3 fd = vFogW - cameraPosition;
    float fdist = length(fd);
    vec3 fdir = fd / max(fdist, 1e-3);
    #ifdef FOG_EXP2
      float hf = 0.0085;
      float h0 = max(cameraPosition.y, 0.0), h1 = max(vFogW.y, 0.0);
      float dh = h1 - h0;
      float hint = abs(dh) > 0.05 ? (exp(-hf * h0) - exp(-hf * h1)) / (hf * dh) : exp(-hf * h0);
      float fogFactor = 1.0 - exp(-fogDensity * fdist * hint);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, portFogColor(fdir, fogColor), fogFactor);
  }
#endif`;
