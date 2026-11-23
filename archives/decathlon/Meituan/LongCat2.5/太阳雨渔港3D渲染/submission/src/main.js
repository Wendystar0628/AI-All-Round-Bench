import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildSky } from './sky.js';
import { buildBase } from './base.js';
import { buildQuay } from './quay.js';
import { buildBoats } from './boats.js';
import { buildBuildings } from './buildings.js';
import { buildCreatures } from './creatures.js';
import { buildEffects, computeDyn } from './effects.js';
import { TOUR_DURATION, applyTourCamera } from './tour.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe4f0ee, 85, 240);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 800);
camera.position.set(34, 19, -38);

const hemi = new THREE.HemisphereLight(0xdcefee, 0xa09a8e, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe9c4, 2.0);
sun.position.set(38, 46, -24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -52; sun.shadow.camera.right = 52;
sun.shadow.camera.top = 52; sun.shadow.camera.bottom = -52;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
sun.shadow.intensity = 0.42;
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(-6, 0, -4);
const fill = new THREE.DirectionalLight(0xcfe4ea, 0.5);
fill.position.set(-30, 24, 26);
scene.add(fill);

const ctx = {
  scene, camera, renderer, sun, hemi,
  updaters: [],
  dyn: { rain: 0.5, coverage: 0.2, rainbow: 0, dark: 0, gustGlobal: 0 },
};

buildSky(ctx);
buildBase(ctx);
buildEffects(ctx);
buildBoats(ctx);
buildQuay(ctx);
buildBuildings(ctx);
buildCreatures(ctx);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-2, -1, -3);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 7;
controls.maxDistance = 130;
controls.maxPolarAngle = Math.PI * 0.55;
controls.update();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let simTime = 0;
let exportMode = false;
const clock = new THREE.Clock();

function tick(t) {
  ctx.dyn = computeDyn(t);
  for (let i = 0; i < ctx.updaters.length; i++) ctx.updaters[i](t, ctx.dyn);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!exportMode) simTime += dt;
  tick(simTime);
  controls.update();
  renderer.render(scene, camera);
}

window.videoExport = {
  runs: ['tour'],
  _fps: 30,
  begin(runId, opts) {
    this._fps = (opts && opts.fps) || 30;
    exportMode = true;
    simTime = 0;
    controls.enabled = false;
    tick(0);
    return { frames: Math.round(TOUR_DURATION * this._fps) };
  },
  frame(i) {
    simTime = i / this._fps;
    tick(simTime);
    applyTourCamera(simTime, camera);
    renderer.render(scene, camera);
    return Promise.resolve();
  },
  end() {
    exportMode = false;
    controls.enabled = true;
    simTime = 0;
    tick(0);
  },
};

function patchShaders(root) {
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (m && m.isShaderMaterial && !m.userData._patched) {
        m.userData._patched = true;
        let fs = m.fragmentShader || '';
        if (!fs.includes('colorspace_fragment')) {
          const idx = fs.lastIndexOf('}');
          fs = fs.slice(0, idx) + '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n' + fs.slice(idx);
          m.fragmentShader = fs;
          m.needsUpdate = true;
        }
      }
    }
  });
}
patchShaders(scene);

window.__dbg = { scene, camera, renderer, controls };
window.__THREE = THREE;
window.__ctx = ctx;
loop();
