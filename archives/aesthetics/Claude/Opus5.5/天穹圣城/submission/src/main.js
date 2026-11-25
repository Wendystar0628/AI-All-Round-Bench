import * as THREE from 'three';
import { U, sharedUniforms } from './core/uniforms.js';
import { makeNoise2D, makeNoise3D } from './core/textures.js';
import { createMaterials } from './core/materials.js';
import { Pipeline } from './render/pipeline.js';
import { ENV_FRAG, ENV_VERT } from './render/atmosphere.js';
import { ViewControls } from './camera/controls.js';
import { makeViewpoints } from './camera/viewpoints.js';
import { makeTour, TOUR_DURATION, TOUR_EVENTS } from './camera/tour.js';
import { buildWorld } from './world/world.js';
import { makeUI } from './ui.js';
import { EV, eventPhase, EVENT_DUR } from './events.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 2, 40000);

// ---------------- global lighting setup ----------------
U.tNoise2D.value = makeNoise2D(256);
U.tNoise3D.value = makeNoise3D(64);
const sunAz = 7.7 * Math.PI / 6, sunEl = THREE.MathUtils.degToRad(24);
const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl)).normalize();
U.uSunDir.value.copy(sunDir);
U.uSunColor.value.setRGB(1.0, 0.84, 0.64).multiplyScalar(3.6);
U.uFogSun.value.setRGB(0.98, 0.84, 0.68);
U.uFogAway.value.setRGB(0.68, 0.76, 0.88);
U.uWindDir.value.set(-0.62, 0.79).normalize();

const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.83, 0.62), 4.1);
sun.castShadow = true;
sun.shadow.mapSize.set(8192, 8192);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 2.5;
sun.layers.enableAll();
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(new THREE.Color(0.55, 0.66, 0.92), new THREE.Color(0.60, 0.56, 0.66), 0.14);
hemi.layers.enableAll();
scene.add(hemi);

function makeEnv() {
  const envScene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({ vertexShader: ENV_VERT, fragmentShader: ENV_FRAG, uniforms: { ...sharedUniforms() }, side: THREE.BackSide, glslVersion: THREE.GLSL3, depthWrite: false });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0, 0.1, 1000);
  pm.dispose();
  return rt.texture;
}
const envMap = makeEnv();
const M = createMaterials(envMap);
const pipeline = new Pipeline(renderer);

// ---------------- world ----------------
const ctx = { scene, camera, renderer, M, U, sun, hemi, pipeline, updaters: [], sunDir };
buildWorld(ctx);

// event-driven atmosphere uniforms (wind gust front, passing cloud shadow)
ctx.updaters.push((t) => {
  const g = eventPhase('gust', t);
  if (g >= 0) { const u = g / EVENT_DUR.gust; U.uGust.value.set(-520 + 1040 * u, 150, Math.sin(Math.PI * u) * 1.15, 0); }
  else U.uGust.value.set(-1e5, 150, 0, 0);
  const sp = eventPhase('shadow', t);
  if (sp >= 0) {
    const u = sp / EVENT_DUR.shadow;
    const str = THREE.MathUtils.smoothstep(u, 0.0, 0.12) * (1 - THREE.MathUtils.smoothstep(u, 0.9, 1.0));
    U.uCloudEvt.value.set(0, 600 - 1200 * u, 340, 0.82 * str);
  } else U.uCloudEvt.value.w = 0;
});

// ---------------- viewpoints, controls, UI ----------------
let mode = 'interactive'; // 'interactive' | 'export' | 'preview'
const vps = makeViewpoints(ctx);
const controls = new ViewControls(camera, canvas, ctx.collider);
let curVP = 0;
controls.setView(vps[0].target, vps[0].pos, vps[0].lim);
function selectVP(i) {
  if (mode !== 'interactive') return;
  curVP = i; ui.show(i);
  const v = vps[i];
  const dist = camera.position.distanceTo(v.pos);
  const dur = THREE.MathUtils.clamp(1.5 + dist / 900, 1.8, 4.2);
  controls.flyTo(v.target, v.pos, v.lim, dur);
}
const ui = makeUI(vps, selectVP);
ui.show(0);

const tour = makeTour(ctx);

function resize() {
  const exporting = mode === 'export';
  const pr = exporting ? (window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight, pr);
}
addEventListener('resize', resize);

// shadow frustum fitted to the region around the current look target (texel snapped)
const _sc = new THREE.Vector3();
const lightRot = new THREE.Matrix4().lookAt(new THREE.Vector3(), sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
const lightInv = lightRot.clone().invert();
function fitShadow(center, extent) {
  const ext = THREE.MathUtils.clamp(extent, 60, 1150);
  const cam = sun.shadow.camera;
  const texel = (2 * ext) / sun.shadow.mapSize.x;
  _sc.copy(center).applyMatrix4(lightInv);
  _sc.x = Math.round(_sc.x / texel) * texel; _sc.y = Math.round(_sc.y / texel) * texel;
  _sc.applyMatrix4(lightRot);
  sun.position.copy(_sc).addScaledVector(sunDir, 2600);
  sun.target.position.copy(_sc); sun.target.updateMatrixWorld();
  cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
  cam.near = 100; cam.far = 5400;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = 0.2 + ext * 0.0018;
}

// ---------------- time, modes, rendering ----------------
let simTime = 0, previewTime = 0, last = performance.now();
const lookTarget = new THREE.Vector3();
function updateWorld(t) { U.uTime.value = t; for (const u of ctx.updaters) u(t); }
function applyTour(t) {
  const c = tour.at(t);
  camera.position.copy(c.pos); camera.lookAt(c.tgt);
  if (Math.abs(camera.fov - c.fov) > 1e-4) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
  lookTarget.copy(c.tgt);
}
function renderNow(frameSeed) {
  const dist = camera.position.distanceTo(lookTarget);
  camera.near = THREE.MathUtils.clamp(dist * 0.008, 0.35, 6); camera.far = 30000; camera.updateProjectionMatrix();
  fitShadow(lookTarget, Math.max(dist * 0.9, 90));
  pipeline.render(scene, camera, frameSeed !== undefined ? { frameSeed } : {});
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (mode === 'export') return;
  if (mode === 'preview') {
    previewTime += dt;
    if (previewTime >= TOUR_DURATION) { stopPreview(); return; }
    updateWorld(previewTime); applyTour(previewTime);
  } else {
    simTime += dt;
    controls.update(dt);
    lookTarget.copy(controls.target);
    updateWorld(simTime);
  }
  renderNow();
}
function restoreView() {
  camera.fov = 38; camera.updateProjectionMatrix();
  const v = vps[curVP]; controls.flight = null; controls.setView(v.target, v.pos, v.lim);
}
function startPreview() { controls.enabled = false; mode = 'preview'; previewTime = 0; EV.tourEvents = TOUR_EVENTS; document.body.classList.add('export'); }
function stopPreview() { controls.enabled = true; mode = 'interactive'; EV.tourEvents = null; document.body.classList.remove('export'); restoreView(); }
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'p' && e.ctrlKey && e.altKey) { if (mode === 'preview') stopPreview(); else if (mode === 'interactive') startPreview(); } });

// ---------------- video export interface ----------------
let exportFps = 60;
const nextFrame = () => new Promise((r) => { let done = false; const fin = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => requestAnimationFrame(fin)); setTimeout(fin, 120); });
window.videoExport = {
  runs: ['tour'],
  async begin(runId = 'tour', opts = {}) {
    if (runId !== 'tour') throw new Error('unknown run: ' + runId);
    exportFps = opts && opts.fps ? opts.fps : 60;
    mode = 'export'; EV.tourEvents = TOUR_EVENTS; controls.enabled = false;
    document.body.classList.add('export');
    resize();
    // initial state of the clip (time 0, first shot); warm up shaders & buffers
    for (let k = 0; k < 3; k++) { updateWorld(0); applyTour(0); renderNow(0); }
    renderer.getContext().finish();
    await nextFrame();
    return { frames: Math.round(TOUR_DURATION * exportFps) };
  },
  async frame(i) {
    if (mode !== 'export') throw new Error('call begin() first');
    const t = i / exportFps;
    updateWorld(t); applyTour(t); renderNow(i);
    renderer.getContext().finish();
    await nextFrame();
  },
  end() {
    if (mode !== 'export') return;
    mode = 'interactive'; EV.tourEvents = null; controls.enabled = true;
    document.body.classList.remove('export');
    resize(); restoreView();
    last = performance.now();
  },
};

// ---------------- start ----------------
resize();
requestAnimationFrame((n) => { last = n; loop(n); canvas.classList.add('ready'); });
