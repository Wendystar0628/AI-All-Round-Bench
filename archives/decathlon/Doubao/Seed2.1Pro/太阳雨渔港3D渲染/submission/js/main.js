/* ============================================================
   main.js — 启动、主循环、导出步进
   ============================================================ */
(function () {
'use strict';
const { scene, camera, renderer, ctrl, onUpdate, updaters, clamp } = H;

/* 建立依赖船只的缆绳（props 模块在 boats 之后加载，函数已注册） */
if (H._afterBoats) H._afterBoats();

/* ---------- 世界推进（实时与导出共用） ---------- */
H.stepWorld = function (t, dt, isExport) {
  H.dt = dt;
  for (const fn of updaters) fn(t, dt, isExport);
  updateUnderwater(dt);
};

function updateUnderwater(dt) {
  const wy = H.LAYOUT.waterY;
  const under = camera.position.y < wy + 0.2 ? 1 : 0;
  underMix += (under - underMix) * Math.min(1, dt * 3);
  if (underMix > 0.01) {
    scene.fog.color.copy(fogAir).lerp(fogUnder, underMix);
    scene.fog.density = 0.0052 + underMix * 0.05;
    renderer.toneMappingExposure = 1.12 - underMix * 0.25;
  } else {
    scene.fog.color.copy(fogAir);
    scene.fog.density = 0.0052;
    renderer.toneMappingExposure = 1.12;
  }
}
H.updateUnderwater = updateUnderwater;

/* ---------- 相机控制平滑 ---------- */
function updateCtrl(dt) {
  const k = 1 - Math.pow(0.0015, dt);
  ctrl.sph.theta += (ctrl.tSph.theta - ctrl.sph.theta) * k;
  ctrl.sph.phi += (ctrl.tSph.phi - ctrl.sph.phi) * k;
  ctrl.sph.radius += (ctrl.tSph.radius - ctrl.sph.radius) * k;
  const sinPhi = Math.sin(ctrl.sph.phi);
  camera.position.set(
    ctrl.target.x + ctrl.sph.radius * sinPhi * Math.sin(ctrl.sph.theta),
    ctrl.target.y + ctrl.sph.radius * Math.cos(ctrl.sph.phi),
    ctrl.target.z + ctrl.sph.radius * sinPhi * Math.cos(ctrl.sph.theta),
  );
  camera.lookAt(ctrl.target);
}

/* ---------- 水下雾感 ---------- */
const fogAir = new THREE.Color(0xdceef2);
const fogUnder = new THREE.Color(0x2f8f8c);
let underMix = 0;

/* ---------- 主循环 ---------- */
let last = performance.now();
let acc = 0;
H.ready = true;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!H.exportMode) {
    H.time += dt;
    H.stepWorld(H.time, dt, false);
    if (H.tourState.active) {
      H.updateTour(H.time);
    } else {
      updateCtrl(dt);
    }
    updateUnderwater(dt);
    renderer.render(scene, camera);
  }
}
requestAnimationFrame(loop);

/* ---------- 初始构图：第三视角远景 ---------- */
(function initView() {
  ctrl.target.set(2, 0.5, -8);
  ctrl.sph.set(86, 0.92, 0.9);
  ctrl.tSph.copy(ctrl.sph);
})();

/* 提示：控制台给出接口说明 */
console.log('[ひだまり港] ready. window.videoExport available:', !!window.videoExport);

})();
