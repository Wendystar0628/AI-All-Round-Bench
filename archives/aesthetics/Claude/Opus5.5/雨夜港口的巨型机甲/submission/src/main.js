// Breaker Delta — rainy night port. Entry point.
import * as THREE from 'three';
import { GU } from './core/globals.js';
import { makeNoise3D, makeDropTile, makeScratchTile } from './materials/noise.js';
import { U as MU, makeMechMaterials } from './materials/mechMaterials.js';
import { buildMech } from './mech/mech.js';
import { reactorFrame, reactorRotorGeos, REACTOR } from './mech/torso.js';
import { SWORD } from './mech/sword.js';
import { createSea, SEA_LEVEL, seaHeight, bigWaveHeight } from './env/sea.js';
import { createSky, createBolt } from './env/sky.js';
import { createPort } from './env/port.js';
import { createGlows, createRainHalos } from './env/glows.js';
import { createRain, RAIN_LIGHTS } from './env/rain.js';
import { createHelicopters } from './env/heli.js';
import { createPost } from './post/post.js';
import { createEvents } from './events.js';
import { createViews } from './cam/views.js';
import { createTour } from './cam/tour.js';
import { createAmbience } from './audio/ambience.js';
import { createUI } from './ui.js';
import { createFX } from './env/fx.js';
import { buildDecals } from './mech/decals.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ renderer
const container = document.getElementById('app') || document.body;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: false });
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block';
renderer.domElement.style.opacity = '0';
renderer.domElement.style.transition = 'opacity 1.4s ease';

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0.026, 0.031, 0.04);
scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0042);
scene.background = null;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.4, 14000);
camera.position.set(37, 19, 115);

// ------------------------------------------------------------------ textures
const noise = makeNoise3D(64);
GU.uNoise.value = noise;
MU.uNoise.value = noise;
MU.uDrops.value = makeDropTile();
MU.uScratch.value = makeScratchTile();

// ------------------------------------------------------------------ environment
const glows = createGlows();
const sky = createSky(noise, FOG_COLOR);
scene.add(sky.mesh);
const port = createPort(glows);
scene.add(port.group);
const bolt = createBolt();
scene.add(bolt.group);

// ------------------------------------------------------------------ mech
const B = buildMech();
const mats = makeMechMaterials(null);
const decals = buildDecals(B);
const baked = B.bake(mats);
scene.add(B.root);
scene.add(baked.group);
B.root.updateMatrixWorld(true);
const chestM = B.J.chest.matrixWorld.clone();
const restInv = new THREE.Matrix4().makeTranslation(-B.J.chest.userData.rest.x, -B.J.chest.userData.rest.y, -B.J.chest.userData.rest.z);
const reactorWorld = chestM.clone().multiply(restInv).multiply(reactorFrame());
const reactorPos = V(0, 0, 0).applyMatrix4(reactorWorld);
const reactorN = V(0, 0, 1).transformDirection(reactorWorld);
MU.uReactorC.value.copy(reactorPos); MU.uReactorN.value.copy(reactorN);
// rotor (dynamic)
const rotorGeo = reactorRotorGeos();
const toStd = (g) => { const b = new THREE.BufferGeometry(); b.setAttribute('position', g.attributes.position); b.setAttribute('normal', g.attributes.normal); const n = g.attributes.position.count; b.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(n), 1)); b.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(0.5), 1)); b.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); return b; };
const rotor = new THREE.Group();
rotor.matrixAutoUpdate = false;
const rotorSpin = new THREE.Group();
rotor.add(rotorSpin);
rotorSpin.add(new THREE.Mesh(toStd(rotorGeo.blades), mats.reactorBlade));
rotorSpin.add(new THREE.Mesh(toStd(rotorGeo.hub), mats.hub));
rotorSpin.add(new THREE.Mesh(toStd(rotorGeo.rings), mats.reactorBlade));
rotor.matrix.copy(reactorWorld);
scene.add(rotor);
// crystal cover
const crystalMat = new THREE.ShaderMaterial({
    uniforms: { uEnv: { value: null }, uPulse: MU.uReactorPulse, uFlash: GU.uFlash, uTime: GU.uTime, uNoise: GU.uNoise, uC: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform samplerCube uEnv; uniform float uPulse; uniform float uFlash; uniform float uTime; uniform sampler3D uNoise; uniform vec3 uC;
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
        float nv = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.05 + 0.95 * pow(1.0 - nv, 5.0);
        vec3 R = reflect(-V, N);
        vec3 refl = textureLod(uEnv, R, 0.0).rgb;
        float rim = pow(1.0 - nv, 2.2);
        float r = length(vW - uC) / 5.2;
        // faint internal facets / striations catching the core light
        float stri = texture(uNoise, vec3(vW.xy * 0.35, uTime * 0.01)).a;
        vec3 core = vec3(1.0, 0.5, 0.16) * (0.35 * rim + 0.1 * smoothstep(0.55, 0.9, stri)) * uPulse;
        vec3 col = refl * F * 1.6 + core + vec3(0.6, 0.65, 0.8) * uFlash * F;
        float a = clamp(0.07 + F * 0.85 + rim * 0.22, 0.0, 0.9);
        gl_FragColor = vec4(col / max(a, 0.05), a);
      }`,
    transparent: true, depthWrite: false,
  });
{
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 64, 16, 0, Math.PI * 2, 0, 0.62), crystalMat);
  dome.rotation.x = Math.PI / 2;
  dome.position.z = -4.15 + 0.45;
  const holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.matrix.copy(reactorWorld);
  holder.add(dome); dome.renderOrder = 6;
  scene.add(holder);
}
// mech anchors
const M = {};
const mk = (name) => B.markerWorld(name);
M.visor = mk('visor')[0];
M.crestBeam = mk('crestBeam')[0];
M.signalRed = mk('signalRed'); M.signalGreen = mk('signalGreen'); M.collarLamps = mk('collarLamp'); M.pauldronBeams = mk('pauldronBeam');
M.fingertips = mk('fingertip');
M.fingertipsR = M.fingertips.filter(p => p.x < 0); M.fingertipsL = M.fingertips.filter(p => p.x > 0);
M.swordTip = mk('swordTip')[0]; M.swordRoot = mk('swordRoot')[0]; M.swordAxisB = mk('swordAxisB')[0];
M.thrusters = mk('thruster'); M.elbowThruster = mk('elbowThruster')[0];
M.wingLamps = mk('wingLamp'); M.pauldronLamps = mk('pauldronLamp'); M.crestLamp = mk('crestLamp')[0];
M.collar = mk('collarFront')[0]; M.drips = mk('drip'); M.grille = mk('grille');
M.browDrips = mk('browDrip'); M.crestFront = mk('crestFront')[0];
// mech lamp beams: the two shoulder searchlights throw cool-white beams obliquely upward
M.lampBeams = M.pauldronLamps.map((p, i) => ({ p: p.clone(), d: M.pauldronBeams[i].clone().sub(p).normalize(), ang: 0.13, range: 70 }));
M.reactor = reactorPos.clone(); M.reactorN = reactorN.clone();
const jp = (j) => B.J[j].getWorldPosition(new THREE.Vector3());
M.head = jp('neck').add(V(0, 3.0, 0.6));
M.chest = jp('chest').add(V(0, 5.5, 1.0));
M.waist = jp('waist');
M.pelvis = jp('pelvis');
M.elbowL = jp('elbowL'); M.elbowR = jp('elbowR'); M.wristL = jp('wristL'); M.wristR = jp('wristR');
M.shoulderL = jp('shoulderL'); M.shoulderR = jp('shoulderR');
M.kneeL = jp('kneeL'); M.kneeR = jp('kneeR'); M.ankleL = jp('ankleL'); M.ankleR = jp('ankleR');
M.hipL = jp('hipL'); M.hipR = jp('hipR');
// blade frame for temper colours
{
  const a = M.swordTip.clone().sub(M.swordRoot).normalize();
  const side = M.swordAxisB.clone().sub(M.swordRoot).normalize(); // thickness dir
  const width = new THREE.Vector3().crossVectors(a, side).normalize();
  MU.uBladeO.value.copy(M.swordRoot); MU.uBladeA.value.copy(a); MU.uBladeS.value.copy(width);
}
MU.uVisorC.value.copy(jp('neck').add(V(0, 3.72, 0))); // centre of the visor
MU.uVisorF.value.set(0, 0, 1).applyQuaternion(B.J.neck.getWorldQuaternion(new THREE.Quaternion()));
// no heat shimmer: the thrusters are cold (the warm colours belong to the visor and the reactor)
for (let i = 0; i < 3; i++) MU.uHeat.value[i].set(0, -1000, 0, 1);
scene.add(decals);

// mech lamps glow
for (const p of M.wingLamps) glows.add(p, 0xe8f2ff, 6, 0.75);
for (const p of M.pauldronLamps) glows.add(p, 0xe8f2ff, 12, 1.0);
glows.add(M.crestLamp, 0xf2f6ff, 20, 1.2);
for (const p of M.collarLamps) glows.add(p, 0xe8f2ff, 4, 1.3);
for (const p of M.signalRed) glows.add(p, 0xff2414, 9, 0.85);
for (const p of M.signalGreen) glows.add(p, 0x22ff58, 9, 0.85);
M.chestLamps = mk('chestLamp'); M.armLamps = mk('armLamp'); M.thighLamps = mk('thighLamp'); M.kneeGreen = mk('kneeGreen');
for (const p of M.chestLamps) glows.add(p, 0xe8f2ff, 3, 0.7);
for (const p of [...M.armLamps, ...M.thighLamps]) glows.add(p, 0xe8f2ff, 3.5, 1.0);
for (const p of M.kneeGreen) glows.add(p, 0x22ff58, 5, 0.7);
scene.add(glows.build());
const halos = createRainHalos([
  ...port.masts.map(p => ({ p, color: 0xffb070, k: 0.32, w: 16, h: 30 })),
  ...port.beams.filter(b => b.range === 60).map(b => ({ p: b.p, color: 0xfff0dc, k: 0.24, w: 12, h: 34 })),
]);
scene.add(halos.mesh);

// ------------------------------------------------------------------ sea, rain, helicopters
const envRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const sea = createSea(envRT.texture, noise);
crystalMat.uniforms.uEnv.value = envRT.texture;
crystalMat.uniforms.uC.value.copy(reactorPos);
scene.add(sea.group);
sea.uniforms.uLegs.value[0].set(0, 0, 3.3, 0);
const rain = createRain(70000);
scene.add(rain.mesh); scene.add(rain.curtains);
const targets = { chest: M.chest.clone(), arm: M.elbowL.clone().lerp(M.wristL, 0.5), back: jp('chest').add(V(0, 7, -3)), head: M.head.clone(), armR: M.elbowR.clone().lerp(M.wristR, 0.55), legs: M.kneeL.clone().lerp(M.kneeR, 0.5) };
const baseTargets = Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, v.clone()]));
const helis = createHelicopters(scene, targets);

// leg positions at the waterline (for foam/piling)
function legAt(knee, ankle, y) { const t = (y - ankle.y) / (knee.y - ankle.y); return ankle.clone().lerp(knee, t); }
const legL = legAt(M.kneeL, M.ankleL, SEA_LEVEL), legR = legAt(M.kneeR, M.ankleR, SEA_LEVEL);
sea.uniforms.uLegs.value[0].set(legL.x, legL.z, 3.4, 0);
sea.uniforms.uLegs.value[1].set(legR.x, legR.z, 3.4, 0);
M.legL = legL; M.legR = legR;

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight(0x3a4658, 0x0b0907, 0.9);
scene.add(hemi);
const rimA = new THREE.DirectionalLight(0xffcf98, 2.8);
rimA.position.set(-120, 140, -260); rimA.target.position.set(0, 40, 0);
rimA.castShadow = true;
rimA.shadow.mapSize.set(4096, 4096);
Object.assign(rimA.shadow.camera, { left: -60, right: 60, top: 60, bottom: -40, near: 50, far: 600 });
rimA.shadow.bias = -0.0003; rimA.shadow.normalBias = 0.05;
rimA.shadow.autoUpdate = false; rimA.shadow.needsUpdate = true;
scene.add(rimA, rimA.target);
const rimB = new THREE.DirectionalLight(0xc8d6ff, 2.0);
rimB.position.set(160, 110, -200); rimB.target.position.set(0, 40, 0);
scene.add(rimB, rimB.target);
const fill = new THREE.DirectionalLight(0x8fa6c8, 0.95);
fill.position.set(120, 80, 220); fill.target.position.set(0, 35, 0);
scene.add(fill, fill.target);
const reactorLight = new THREE.PointLight(0xff7a22, 420, 0, 2);
reactorLight.position.copy(M.reactor).addScaledVector(M.reactorN, 3.2);
scene.add(reactorLight);
const visorLight = new THREE.PointLight(0xffbf55, 9, 0, 2);
visorLight.position.copy(M.visor).add(V(0, -0.3, 2.2));
scene.add(visorLight);
const headSpot = new THREE.SpotLight(0xeef3ff, 30000, 0, 0.09, 0.5, 2);
headSpot.position.copy(M.crestLamp);
headSpot.target.position.copy(M.crestLamp.clone().add(M.crestBeam.clone().sub(M.crestLamp).normalize().multiplyScalar(60)));
scene.add(headSpot, headSpot.target);
const flashLight = new THREE.DirectionalLight(0xbcd0ff, 0);
flashLight.position.set(-200, 500, -400); flashLight.target.position.set(0, 30, 0);
scene.add(flashLight, flashLight.target);

// ------------------------------------------------------------------ FX
const fx = createFX({ scene, baked, M, renderer });

// ------------------------------------------------------------------ environment cube (reflections)
function captureEnv() {
  const hide = [baked.group, rotor, rain.mesh, rain.curtains, sea.group, decals, fx.group].filter(Boolean);
  hide.forEach(o => o.visible = false);
  helis.helis.forEach(h => h.root.visible = false);
  const cc = new THREE.CubeCamera(1, 12000, envRT);
  cc.position.set(0, 32, 30);
  scene.add(cc);
  const fogD = scene.fog.density;
  scene.fog.density = fogD * 0.6;
  cc.update(renderer, scene);
  scene.fog.density = fogD;
  scene.remove(cc);
  hide.forEach(o => o.visible = true);
  helis.helis.forEach(h => h.root.visible = true);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromCubemap(envRT.texture).texture;
  for (const m of Object.values(mats)) if (m.isMeshStandardMaterial) { m.envMap = envTex; m.needsUpdate = true; }
  decals.traverse(o => { if (o.material && o.material.isMeshStandardMaterial) { o.material.envMap = envTex; o.material.needsUpdate = true; } });
  scene.environment = envTex;
  scene.environmentIntensity = 1.4;
}
captureEnv();

// ------------------------------------------------------------------ post
const post = createPost(renderer, scene, camera, Math.round(innerWidth * DPR()), Math.round(innerHeight * DPR()));

// ------------------------------------------------------------------ events, views, tour, UI
const events = createEvents({ bolt, M });
const views = createViews({ camera, dom: renderer.domElement, M, seaHeight: (x, z, t) => seaHeight(x, z, t, events.bigWave) });
const tour = createTour({ M, events, helis });
// ambient sound: starts on the first click / key press (browsers only allow audio after a user gesture)
const ambience = createAmbience({ M, helis, events, tour });
const startAudio = () => ambience.start();
addEventListener('pointerdown', startAudio, true);
addEventListener('keydown', startAudio, true);
const ui = createUI(views);

// ------------------------------------------------------------------ per-frame update
let simTime = 0;
const tmpV = new THREE.Vector3();
function updateWorld(t) {
  GU.uTime.value = t; MU.uTime.value = t;
  events.update(t);
  GU.uFlash.value = events.flash;
  GU.uGust.value = events.gust;
  GU.uRain.value = 1.0 + events.gust * 0.4;
  scene.fog.density = 0.0042 * (1.0 + 0.45 * events.gust) * (1.0 - 0.25 * events.flash);
  sky.uniforms.uFlashPos.value.copy(events.flashPos);
  sky.uniforms.uFlash.value = events.flashSky;
  flashLight.intensity = events.flash * 9.0;
  flashLight.position.copy(events.flashPos);
  // reactor spin + pulse
  const pulse = 0.88 + 0.08 * Math.sin(t * 2.1) + 0.04 * Math.sin(t * 5.3);
  MU.uReactorPulse.value = pulse;
  rotorSpin.rotation.z = -t * 1.35;
  reactorLight.intensity = 420 * pulse;
  rotor.matrix.copy(reactorWorld);
  // world bits
  port.update(t);
  // slow searchlight wander: H1 drifts between chest and right arm; cues from the tour can override
  {
    const w = 0.5 + 0.5 * Math.sin(t * 0.045 + 1.2);
    targets.chest.copy(baseTargets.chest).lerp(baseTargets.armR, w * 0.85);
    const cue = exportMode && tour.cue ? tour.cue(t - tour.time0) : null;
    targets._cued = new Set();
    if (cue) for (const k of Object.keys(cue)) if (targets[k] && cue[k]) { targets[k].copy(cue[k]); targets._cued.add(k); }
  }
  helis.update(t, targets);
  const bw = events.bigWave;
  sea.uniforms.uBig.value.set(bw.x, bw.z, bw.amp, bw.width);
  fx.update(t, events, null, renderer);
  // rain + sea lighting uniforms
  const spots = [...helis.helis.map(h => h.spot), headSpot];
  spots.forEach((s, i) => {
    const d = s.target.position.clone().sub(s.position).normalize();
    RAIN_LIGHTS.uSpotP.value[i].copy(s.position);
    RAIN_LIGHTS.uSpotD.value[i].copy(d);
    const k = i < 3 ? 1.6 : 0.9;
    RAIN_LIGHTS.uSpotC.value[i].set(k, k * 1.02, k * 1.08);
    RAIN_LIGHTS.uSpotCos.value[i] = Math.cos(s.angle);
    if (i < 4) {
      sea.uniforms.uSpotP.value[i].copy(s.position); sea.uniforms.uSpotD.value[i].copy(d);
      sea.uniforms.uSpotC.value[i].setRGB(1.0, 1.02, 1.06).multiplyScalar(i < 3 ? 0.9 : 0.5);
      sea.uniforms.uSpotCos.value[i] = Math.cos(s.angle * 1.05);
    }
  });
  RAIN_LIGHTS.uPtP.value[0].copy(reactorLight.position); RAIN_LIGHTS.uPtC.value[0].set(1.0, 0.45, 0.12).multiplyScalar(0.9 * pulse);
  RAIN_LIGHTS.uPtP.value[1].copy(visorLight.position); RAIN_LIGHTS.uPtC.value[1].set(1.0, 0.72, 0.25).multiplyScalar(0.12);
  RAIN_LIGHTS.uPtP.value[2].copy(M.elbowThruster); RAIN_LIGHTS.uPtC.value[2].set(0, 0, 0);
  sea.uniforms.uPtP.value[0].copy(reactorLight.position); sea.uniforms.uPtC.value[0].setRGB(1.0, 0.42, 0.1).multiplyScalar(1.2 * pulse);
  sea.uniforms.uPtP.value[1].copy(visorLight.position); sea.uniforms.uPtC.value[1].setRGB(1.0, 0.7, 0.22).multiplyScalar(0.4);
  sea.uniforms.uSunDir.value.copy(rimA.position).normalize();
  // heli spot intensity (sweep flicker)
  helis.helis.forEach((h, i) => { h.spot.intensity = 260000 * (0.96 + 0.04 * Math.sin(t * 3.0 + i)); });
  // volumetric cones
  const vol = post.volume.uniforms;
  let n = 0;
  const pushCone = (p, dir, cosA, range, col, k) => {
    if (n >= 28) return;
    vol.uP.value[n].set(p.x, p.y, p.z, range);
    vol.uD.value[n].set(dir.x, dir.y, dir.z, cosA);
    vol.uC.value[n].set(col.r, col.g, col.b, k);
    n++;
  };
  helis.helis.forEach((h) => {
    const d = h.spot.target.position.clone().sub(h.spot.position);
    const L = d.length(); d.normalize();
    pushCone(h.spot.position, d, Math.cos(h.spot.angle * 0.85), L + 2, new THREE.Color(0.95, 0.98, 1.05).multiplyScalar(2.2), 0.45);
  });
  {
    const d = headSpot.target.position.clone().sub(headSpot.position).normalize();
    pushCone(headSpot.position, d, Math.cos(headSpot.angle * 1.0), 120, new THREE.Color(0.9, 0.95, 1.0).multiplyScalar(2.2), 0.6);
  }
  for (const lb of M.lampBeams) pushCone(lb.p, lb.d, Math.cos(lb.ang), lb.range, _lampCol, 1.6);
  coneBase = n;
  vol.uN.value = n;
  vol.uOrb.value[0].set(reactorLight.position.x, reactorLight.position.y, reactorLight.position.z, 4.5);
  vol.uOrbC.value[0].set(0.16, 0.06, 0.015).multiplyScalar(pulse);
  vol.uOrb.value[1].set(visorLight.position.x, visorLight.position.y, visorLight.position.z, 3.0);
  vol.uOrbC.value[1].set(0.05, 0.035, 0.01);
}

let coneBase = 0;
const _lampCol = new THREE.Color(0.85, 0.92, 1.0).multiplyScalar(1.5);
const _bc = new THREE.Color();
function updateCameraDependent() {
  // nearest port light cones to the (final) camera — evaluated after the camera is placed
  const vol = post.volume.uniforms;
  let n = coneBase;
  const cams = camera.position;
  const sorted = port.beams.map(b => ({ b, d: b.p.distanceToSquared(cams) })).sort((a, b) => a.d - b.d);
  for (const { b } of sorted) {
    if (n >= 28) break;
    _bc.copy(b.color).multiplyScalar(1.1);
    vol.uP.value[n].set(b.p.x, b.p.y, b.p.z, b.range);
    vol.uD.value[n].set(b.dir.x, b.dir.y, b.dir.z, Math.cos(b.angle));
    vol.uC.value[n].set(_bc.r, _bc.g, _bc.b, b.k);
    n++;
  }
  vol.uN.value = n;
  fx.setCamera(camera);
}
function renderFrame() {
  updateCameraDependent();
  sky.update(camera);
  sea.update(camera);
  rain.update(camera, renderer);
  renderer.getDrawingBufferSize(tmpV2);
  glows.material.uniforms.uScale.value = tmpV2.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  glows.material.uniforms.fogDensity.value = scene.fog.density;
  halos.material.uniforms.fogDensity.value = scene.fog.density;
  glows.material.uniforms.uRes.value.copy(renderer.getDrawingBufferSize(tmpV2));
  post.render();
}
const tmpV2 = new THREE.Vector2();

// ------------------------------------------------------------------ resize
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(DPR());
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(Math.round(w * DPR()), Math.round(h * DPR()));
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ main loop + export API
let exportMode = false;
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  if (exportMode) { last = now; return; }
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  simTime += dt;
  views.update(dt, simTime);
  updateWorld(simTime);
  renderFrame();
  ambience.update(simTime, camera);
}

const nextFrame = () => new Promise(r => { let done = false; requestAnimationFrame(() => { if (!done) { done = true; r(); } }); setTimeout(() => { if (!done) { done = true; r(); } }, 120); });
let exportFps = 60, exportRun = null;
window.videoExport = {
  runs: ['tour'],
  async begin(runId, opts = {}) {
    if (runId !== 'tour') throw new Error('unknown run ' + runId);
    exportMode = true;
    ambience.setExport(true);
    exportFps = opts.fps || 60;
    renderer.domElement.style.transition = 'none';
    renderer.domElement.style.opacity = '1';
    exportRun = runId;
    ui.setVisible(false);
    views.setEnabled(false);
    events.setScripted(tour.events);
    resize();
    // prepare first frame
    updateWorld(tour.time0);
    tour.apply(0, camera);
    renderFrame();
    await nextFrame();
    return { frames: Math.round(tour.duration * exportFps) };
  },
  async frame(i) {
    const t = i / exportFps;
    updateWorld(tour.time0 + t);
    tour.apply(t, camera);
    renderFrame();
    await nextFrame();
    await nextFrame();
  },
  // the tour's ambient sound, rendered offline: a stereo WAV Blob starting at the moment of frame 0
  async audio() { return ambience.renderTour(); },
  end() {
    exportMode = false;
    ambience.setExport(false);
    exportRun = null;
    events.setScripted(null);
    ui.setVisible(true);
    views.setEnabled(true);
    views.restore();
    last = performance.now();
  },
};

// ------------------------------------------------------------------ start
views.go(0, true);
updateWorld(0);
// warm-up compile, first frame, then fade in
renderer.compile(scene, camera);
renderFrame();
requestAnimationFrame(() => { renderer.domElement.style.opacity = '1'; });
requestAnimationFrame(loop);
window.__app = { scene, camera, renderer, B, M, views, events, tour, post, sea, helis, mats, baked, ambience, updateWorld, renderFrame, setTime: (t) => { simTime = t; } };
