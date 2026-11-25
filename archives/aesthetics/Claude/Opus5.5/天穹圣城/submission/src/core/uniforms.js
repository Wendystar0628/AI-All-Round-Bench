import * as THREE from 'three';

// Shared uniform objects (same object references are reused by every material so a single update drives all).
export const U = {
  tNoise2D: { value: null },
  tNoise3D: { value: null },
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uWindDir: { value: new THREE.Vector2(0.8, -0.6) },
  uGust: { value: new THREE.Vector4(-1e5, 300, 0, 0) },
  uCloudEvt: { value: new THREE.Vector4(0, 0, 400, 0) },
  uFogSun: { value: new THREE.Color() },
  uFogAway: { value: new THREE.Color() },
  uFogParams: { value: new THREE.Vector4(0.82e-4, 1 / 900, 0, 0.975) },
  uSkyK: { value: 1.0 },
};

export function sharedUniforms() {
  return {
    tNoise2D: U.tNoise2D, tNoise3D: U.tNoise3D, uTime: U.uTime, uSunDir: U.uSunDir, uSunColor: U.uSunColor,
    uWindDir: U.uWindDir, uGust: U.uGust, uCloudEvt: U.uCloudEvt, uFogSun: U.uFogSun, uFogAway: U.uFogAway, uFogParams: U.uFogParams, uSkyK: U.uSkyK,
  };
}
