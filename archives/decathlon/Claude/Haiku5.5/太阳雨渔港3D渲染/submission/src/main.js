import * as THREE from 'three';
import { clock, tickLive, liveNow } from './core/clock.js';
import { buildWorld } from './world.js';
import { overviewPose, makeControls } from './camera.js';
import { tourPose, OVERVIEW_DUR, TOUR_DUR } from './tour.js';

// ---------- 渲染器与场景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 800);
const controls = makeControls(camera, renderer.domElement);
const world = buildWorld(scene);

let userMoved = false;
controls.addEventListener('start', () => {
  userMoved = true;
});

function applyOverview() {
  const p = overviewPose(camera.aspect);
  camera.position.copy(p.pos);
  controls.target.copy(p.target);
  camera.lookAt(p.target.x, p.target.y, p.target.z);
  controls.update();
}
applyOverview();

// ---------- 导出模式下的运镜与状态 ----------
const runs = {
  overview: { dur: OVERVIEW_DUR, pose: (t) => overviewPose(camera.aspect, t) },
  tour: { dur: TOUR_DUR, pose: (t) => tourPose(t, camera.aspect) },
};
let run = null;
let exportFps = 60;
let exportFrames = 0;
let saved = null;

function setPose(p) {
  camera.position.copy(p.pos);
  controls.target.copy(p.target);
  camera.lookAt(p.target.x, p.target.y, p.target.z);
}

// 把当前时刻的画面渲染出来（导出模式下相机由运镜决定，实时模式下由用户控制）
function renderNow() {
  const t = clock.t;
  if (clock.mode === 'export' && run) {
    setPose(run.pose(t));
  } else {
    controls.update();
  }
  world.update(t, camera);
  renderer.render(scene, camera);
}

// 等待一帧被呈现。页面在后台或被遮挡时 rAF 可能不触发，因此加一个定时器兜底，避免导出挂起。
function nextPaint() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 150);
  });
}

window.videoExport = {
  runs: Object.keys(runs),
  async begin(runId, opts = {}) {
    const r = runs[runId];
    if (!r) throw new Error('unknown run: ' + runId);
    if (clock.mode === 'live') {
      saved = { pos: camera.position.clone(), target: controls.target.clone() };
    }
    clock.mode = 'export';
    run = r;
    exportFps = opts.fps || 60;
    exportFrames = Math.round(r.dur * exportFps);
    controls.enabled = false;
    clock.t = 0;
    renderNow();
    await nextPaint();
    return { frames: exportFrames };
  },
  async frame(i) {
    if (clock.mode !== 'export' || !run) throw new Error('call begin() first');
    const k = Math.max(0, Math.min(exportFrames - 1, Math.floor(i)));
    clock.t = k / exportFps;
    renderNow();
    await nextPaint();
  },
  end() {
    if (clock.mode !== 'export') return;
    const tEnd = clock.t;
    clock.mode = 'live';
    run = null;
    // 实时时钟接续导出结束时的时刻，画面不跳变
    clock.base = performance.now() / 1000 - tEnd;
    controls.enabled = true;
    if (saved) {
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      camera.lookAt(saved.target);
      saved = null;
    }
    controls.update();
  },
};

// ---------- 实时循环 ----------
function loop() {
  requestAnimationFrame(loop);
  tickLive();
  renderNow();
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  world.resize();
  if (!userMoved && clock.mode === 'live') applyOverview();
});

clock.t = liveNow();
loop();
