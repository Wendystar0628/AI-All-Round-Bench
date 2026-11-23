/* ============================================================
   tour.js — 一分钟内置镜头组 + 视频导出接口
   ============================================================ */
(function () {
'use strict';
const { clamp, lerp, easeInOut } = H;

/* 镜头：每段 [时长秒, 起始机位, 起始目标, 结束机位, 结束目标]
   切镜在段与段之间直接跳。 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const shots = [
  // 0 远景：港外高处推向 L 形码头
  [7.5,
    V(64, 52, 70), V(2, 0, -6),
    V(40, 30, 46), V(4, 0, -10)],
  // 1 中景：沿南堤岸横移掠过泊位渔船浮标
  [6.5,
    V(29, 9, 16), V(14, 0.5, -2),
    V(-3, 7.5, 16), V(8, 0.5, -5)],
  // 2 特写：系船柱海鸥，推近，海鸥飞走（事件 scare1）
  [5,
    V(4, 3.2, 9.5), V(0, 0.9, 5.6),
    V(1.6, 1.8, 6.6), V(0, 0.95, 5.6)],
  // 3 中景：乐器硬箱 + 透明雨伞 + 水洼倒影
  [6,
    V(-2, 4.2, 14), V(-1.5, 0.4, 8),
    V(-3.5, 3, 11.5), V(-2.5, 0.3, 7)],
  // 4 特写：舢板下港猫抬头
  [4.5,
    V(25, 2.8, 15), V(22.2, 0.5, 12.4),
    V(23.4, 1.6, 13.5), V(22.2, 0.55, 12.4)],
  // 5 中景：阵风——晒网、浮球、风向袋、小旗依次摆动
  [7,
    V(-20, 7, 18), V(-16, 2, 0),
    V(-15, 5.5, 11), V(-13, 2, -4)],
  // 6 特写：透过驾驶舱玻璃推向雷达屏、海图、保温壶（船0 船头朝+x，前窗在 x≈7.9）
  [6.5,
    V(10.6, 2.5, 3.6), V(8.1, 1.25, 1.55),
    V(9.4, 1.8, 2.4), V(8.0, 1.2, 1.55)],
  // 7 中景：从门外斜推半拉卷帘门，看仓库光柱、成垛鱼箱（仓库门朝 +x）
  [7,
    V(-2.2, 4.4, -15.5), V(-9.6, 1.8, -21.5),
    V(-5.0, 2.9, -19.8), V(-10.2, 1.9, -22)],
  // 8 中景：隔候船室落地玻璃横移（玻璃面朝 +z）
  [5.5,
    V(22.0, 2.4, 18.6), V(25.5, 1.5, 10.4),
    V(29.0, 2.2, 18.0), V(25.5, 1.5, 10.4)],
  // 9 中景：从港池水面下沉看岸壁剖面 + 水下鱼群
  [6.5,
    V(24, 5, 10), V(12, -1, -4),
    V(20, -3.6, 9.2), V(6, -4.2, -8)],
  // 10 中景：灯塔 + 消波块浪花
  [5,
    V(12, 5.5, -22), V(4.6, 2.4, -30),
    V(9.5, 4, -26), V(4.5, 3, -30)],
  // 11 远景：跟出港渔船，带上航迹（船约 62.5s 启航，沿港池向北绕防波堤）
  [8,
    V(34, 26, 22), V(8, 0, -4),
    V(40, 34, 8), V(16, 0, -18)],
];
const total = shots.reduce((s, x) => s + x[0], 0);
H.tourTotal = total;
H.tourShots = shots;
H.tourApplyCamera = applyCamera;

/* 镜头内事件 */
const events = [
  { t: shots.slice(0, 2).reduce((s, x) => s + x[0], 0) + 1.2, fn: 'scareGull' },
  { t: shots.slice(0, 4).reduce((s, x) => s + x[0], 0) + 0.6, fn: 'catLook' },
  { t: shots.slice(0, 5).reduce((s, x) => s + x[0], 0) + 0.2, fn: 'gust' },
  { t: 61.5, fn: 'cruise' },
];

function applyCamera(t) {
  let acc = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (t <= acc + s[0] + 1e-6 || i === shots.length - 1) {
      const local = clamp((t - acc) / s[0], 0, 1);
      const e = easeInOut(local);
      H.camera.position.lerpVectors(s[1], s[3], e);
      H.ctrl.target.lerpVectors(s[2], s[4], e);
      H.camera.lookAt(H.ctrl.target);
      return i;
    }
    acc += s[0];
  }
}

const fired = {};
function fireEvents(t, force) {
  for (const ev of events) {
    const key = ev.fn + Math.floor(ev.t);
    if (!fired[key] && t >= ev.t) {
      fired[key] = true;
      if (ev.fn === 'scareGull') {
        // 吓飞最近系船柱上的海鸥
        let best = null, bd = 1e9;
        for (const gu of H.gulls) {
          if (gu.s.mode !== 'perch') continue;
          const d = gu.b.position.distanceTo(new THREE.Vector3(0, 1, 5.6));
          if (d < bd) { bd = d; best = gu; }
        }
        if (best) {
          best.s.mode = 'fly';
          best.s.cx = best.b.position.x + 8; best.s.cz = best.b.position.z - 10;
          best.s.rad = 10; best.s.ph = H.time * best.s.spd;
        }
      } else if (ev.fn === 'catLook') {
        H.catState.lookT = H.time;
        setTimeoutLike(3500, () => { if (!H.exportMode) H.catState.lookT = 0; });
      } else if (ev.fn === 'gust') {
        // 注入一阵风：临时把阵风强度推高
        H.forcedGust = { t0: H.time, dur: 6 };
      } else if (ev.fn === 'cruise') {
        if (!H.isCruising()) H.startCruise(H.time + 1);
      }
    }
  }
}
function setTimeoutLike(ms, fn) {
  // 导出模式不能用真实时间：用帧号近似（60fps），预览也可接受
  const target = H.time + ms / 1000;
  H._timers.push({ target, fn });
}
H._timers = [];

H.tourState = { active: false, t0: 0 };

/* 重置场景动态到 tour 初态（确定性） */
function resetForTour() {
  H.time = 0;
  firedArrayReset();
  for (const k in fired) delete fired[k];
  H._timers.length = 0;
  H.forcedGust = null;
  // 船归位
  for (const b of H.boats) {
    b.position.copy(b.userData.home);
    b.rotation.y = b.userData.homeRot;
    b.userData.moored = true;
  }
  H._cruiseOverride = null;
  H.catState.mode = 'shelter'; H.catState.lookT = 0;
  applyCamera(0);
}
function firedArrayReset() {}
H.resetForTour = resetForTour;

/* 由 main 主循环调用：推进 tour 相机与事件 */
H.updateTour = function (t) {
  if (!H.tourState.active) return;
  const lt = clamp(t - H.tourState.t0, 0, total);
  applyCamera(lt);
  fireEvents(lt, false);
  if (lt >= total && !H.exportMode) {
    // 实时循环：停在末镜，稍后交还控制
    H.tourState.active = false;
    H.ctrl.enabled = true;
    syncCtrlFromCamera();
  }
};

function syncCtrlFromCamera() {
  const off = H.camera.position.clone().sub(H.ctrl.target);
  H.ctrl.sph.setFromVector3(off);
  H.ctrl.tSph.copy(H.ctrl.sph);
}
H.syncCtrl = syncCtrlFromCamera;

/* ---------- 导出 API ---------- */
let exporting = false;
let fpsOut = 60;
window.videoExport = {
  runs: ['tour'],
  async begin(runId, opts) {
    if (runId !== 'tour') throw new Error('unknown run: ' + runId);
    const fps = (opts && opts.fps) || 60;
    fpsOut = fps;
    resetForTour();
    exporting = true;
    H.exportMode = true;
    H.ctrl.enabled = false;
    H.tourState.active = true;
    H.tourState.t0 = 0;
    H._exportFps = fps;
    const frames = Math.round(total * fps);
    // 立即渲染第 0 帧
    H.time = 0;
    H.renderExportFrame(0);
    return { frames };
  },
  async frame(i) {
    H.renderExportFrame(i);
  },
  end() {
    exporting = false;
    H.exportMode = false;
    H.tourState.active = false;
    H.ctrl.enabled = true;
    syncCtrlFromCamera();
  },
};

H.renderExportFrame = function (i) {
  const t = i / H._exportFps;
  H.time = t;
  H.stepWorld(t, 1 / H._exportFps, true);
  applyCamera(t);
  fireEvents(t, true);
  // 定时器
  for (let k = H._timers.length - 1; k >= 0; k--) {
    if (H.time >= H._timers[k].target) { const fn = H._timers[k].fn; H._timers.splice(k, 1); fn(); }
  }
  H.renderer.render(H.scene, H.camera);
};

})();
