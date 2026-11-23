'use strict';
/* 原生视频接口。独立的本地页面负责导出，原页面在其下暂停并保留操作状态。
   消息通信兼容 file:// 的不透明源，不需要模块、fetch 或录制工具注入。 */
(() => {
  const TAG = 'harbor-video-export-v1';
  const url = new URL(location.href);
  const isExportView = window.parent !== window && url.searchParams.get('__harbor_export') === '1';
  const durations = { overview: 5, tour: 61 };
  let runtime, active = false, view = null, ready = null, sequence = 0;
  const pending = new Map();
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const settle = () => new Promise(resolve => nativeRAF(() => nativeRAF(resolve)));

  // 每次 begin 都新建一份相同的场景，闭包中的粒子/动物/随机状态也随之重置。
  // 仅导出页面使用固定随机种子与模拟计时器，日常浏览保持原样。
  let time = 0, timerID = 0;
  const timers = new Map();
  if (isExportView) {
    let seed = 0x75a1b09;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let n = Math.imul(seed ^ seed >>> 15, seed | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
    const addTimer = (fn, delay, repeat, args) => {
      const id = ++timerID;
      timers.set(id, { fn, at: time + Math.max(0, Number(delay) || 0) / 1000,
        delay: Math.max(1, Number(delay) || 0) / 1000, repeat, args });
      return id;
    };
    window.setTimeout = (fn, delay, ...args) => addTimer(fn, delay, false, args);
    window.setInterval = (fn, delay, ...args) => addTimer(fn, delay, true, args);
    window.clearTimeout = window.clearInterval = id => timers.delete(id);
  }
  function runTimers() {
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= time + 1e-9)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) return;
      const [id, timer] = due;
      if (timer.repeat) timer.at += timer.delay; else timers.delete(id);
      timer.fn(...timer.args);
    }
  }

  // 一分钟镜头组：每个镜头 [起, 止, 缓动, 相机路径, 注视路径]，路径为 Catmull-Rom 样条；
  // 镜头之间直接切换。相机与注视点只由时间决定，同一帧号必然得到同一机位。
  const shots = [
    // 远景：从港外高处推向 L 形码头，带上防波堤和灯塔
    [0, 3.5, 'soft', [[31, 15, 33], [26, 11, 28]], [[-2, 0, -1], [-3, 0.5, 0.5]]],
    // 中景：阵风依次吹动风向袋、晒网、浮球绳串和小旗
    [3.5, 10, 'soft', [[6.5, 3.4, 21], [-1.5, 3.5, 21], [-6.5, 3.4, 20.5]], [[7.5, 3.9, 12.9], [-5, 2.8, 11.8], [-10.5, 2.2, 11.8]]],
    // 特写：系船柱上的海鸥，镜头一到海鸥受惊扑翅飞走，机位随之上摇
    [10, 12.4, 'linear', [[-4.4, 1.9, 6.1], [-4.55, 1.95, 5.95]],
      [[-6.6, 1.75, 5.8], [-6.1, 2.5, 5.3], [-4.5, 4.2, 3.9], [-3.25, 5.2, 2.6], [-3.15, 5.2, 1.9]]],
    // 中景：沿泊位横移，掠过渔船和浮标
    [12.4, 17, 'soft', [[-0.4, 1.35, 4.5], [-0.4, 1.4, -1.5], [-0.4, 1.45, -6]], [[-4.8, 1.0, 2.5], [-4.8, 1.0, -3], [-4.8, 1.0, -8]]],
    // 特写：透过驾驶舱玻璃推向舱内
    [17, 21, 'soft', [[-0.6, 1.7, -0.2], [-2.8, 1.5, -1.0]], [[-4.8, 1.15, -1.3], [-4.8, 1.1, -1.3]]],
    // 远景：跟着出港的渔船拉高，带上身后的航迹（匀速，注视点跟在船上）
    [21, 30.2, 'linear', [[-2.4, 1.5, -3.2], [-0.6, 2.3, -3.1], [2.6, 3.6, -2.8], [5.0, 5.6, -3.3], [5.2, 7.8, -4.5]],
      [[-4.4, 0.7, -6.3], [-2.0, 0.6, -6.8], [1.8, 0.4, -7.0], [5.8, 0.3, -7.2], [7.7, 0.0, -10.0]]],
    // 中景：防波堤尽头的灯塔，消波块间浪花翻涌，返港的船从前景驶过
    [30.2, 35.2, 'soft', [[13, 2.6, -1.0], [11.4, 2.2, -3.2]], [[4.0, 2.4, -11.2], [4.0, 2.3, -11.2]]],
    // 中景：硬箱、雨伞和水洼
    [35.2, 39.7, 'soft', [[-0.8, 1.2, 11.2], [1.8, 1.15, 10.6]], [[1.6, 0.95, 8.0], [2.2, 0.95, 8.1]]],
    // 中景：沿街巷前行，经过半拉起的卷帘门
    [39.7, 44.7, 'soft', [[-6.4, 1.6, -1.8], [-6.4, 1.65, -7.0]], [[-11.5, 1.8, -5.0], [-12, 1.7, -7.4]]],
    // 中景：隔着落地玻璃横移
    [44.7, 49.7, 'soft', [[-8.3, 1.9, 0.2], [-8.3, 1.9, 3.4]], [[-12.6, 1.8, 1.4], [-12.6, 1.7, 3.2]]],
    // 特写：舢板下的港猫抬头看镜头
    [49.7, 54.7, 'soft', [[11.3, 0.85, 12.6], [11.0, 0.75, 12.2]], [[10.85, 0.5, 11.05], [10.85, 0.5, 11.05]]],
    // 中景：沿底座侧壁下沉
    [54.7, 61, 'soft', [[8.5, 3.0, 17.5], [9.6, -0.3, 17.3], [10.4, -1.6, 16.8]], [[10.5, 0.2, 12], [11.0, -1.2, 11.5], [11.4, -1.8, 10.5]]]
  ];
  const eases = {
    linear: u => u,
    soft: u => 0.45 * u + 0.55 * (u * u * u * (u * (u * 6 - 15) + 10))
  };
  const spline = (pts, u) => {
    const n = pts.length - 1;
    if (n < 1) return pts[0].slice();
    const f = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(f), n - 1), s = f - i;
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
    return p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * s +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s * s + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * s * s * s));
  };
  const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
  function pose(run, t) {
    if (run === 'overview') {
      const scale = Math.max(1, 1.72 / (innerWidth / innerHeight));
      const target = [-1, -4, 0];
      return [mix(target, [26, 18, 34], scale), target];
    }
    let k = 0;
    while (k < shots.length - 1 && t >= shots[k][1]) k++;
    const [t0, t1, ease, cam, tgt] = shots[k];
    const u = eases[ease](Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
    return [spline(cam, u), spline(tgt, u)];
  }

  let runID, fps, frames, lastFrame = -1, stepIndex = 0, initialized = false;
  function validate(run, options) {
    if (!Object.hasOwn(durations, run)) throw new Error('未知视频段：' + run);
    const rate = options?.fps ?? 60;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 240) throw new Error('fps 必须在 (0, 240] 范围内');
    return rate;
  }
  async function localFrame(i) {
    if (!active) throw new Error('请先调用 begin');
    if (!Number.isInteger(i) || i < 0 || i >= frames || i !== lastFrame + 1)
      throw new Error('frame 必须从 0 开始依次调用，且不能超出总帧数');
    const target = i / fps;
    // 固定 60Hz 模拟，低帧率预览也走完中间状态。小数尾步仅用于非整除帧率。
    while ((stepIndex + 1) / 60 <= target + 1e-9) {
      const next = ++stepIndex / 60;
      runtime.aim(...pose(runID, next));
      const dt = next - time; time = next;
      runTimers(); runtime.advance(dt, time);
    }
    if (target - time > 1e-9 || !initialized) {
      const dt = target - time; time = target;
      runtime.aim(...pose(runID, time));
      runTimers(); runtime.advance(dt, time);
    }
    runtime.render(...pose(runID, target));
    initialized = true;
    lastFrame = i;
    await settle();
  }

  const bridge = window.HarborVideoExport = {
    isExportView,
    get paused() { return active; },
    attach(value) {
      runtime = value;
      if (isExportView) window.parent.postMessage({ tag: TAG, type: 'ready' }, '*');
    }
  };
  function rpc(type, args = []) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      view.contentWindow.postMessage({ tag: TAG, type, id, args }, '*');
    });
  }
  window.addEventListener('message', async event => {
    const m = event.data;
    if (!m || m.tag !== TAG) return;
    if (isExportView) {
      if (event.source !== window.parent) return;
      try {
        let result;
        if (m.type === 'begin') {
          runID = m.args[0]; fps = validate(runID, m.args[1]);
          frames = Math.round(durations[runID] * fps); active = true;
          await document.fonts.ready;
          await localFrame(0);
          lastFrame = -1; // begin 已显示初态；调用方仍从 frame(0) 开始。
          result = { frames };
        } else if (m.type === 'frame') await localFrame(m.args[0]);
        else return;
        window.parent.postMessage({ tag: TAG, type: 'result', id: m.id, result }, '*');
      } catch (error) {
        window.parent.postMessage({ tag: TAG, type: 'result', id: m.id, error: String(error) }, '*');
      }
      return;
    }
    if (event.source !== view?.contentWindow) return;
    if (m.type === 'ready') { ready?.resolve(); return; }
    const request = pending.get(m.id);
    if (!request) return;
    pending.delete(m.id);
    if (m.error) request.reject(new Error(m.error)); else request.resolve(m.result);
  });

  const end = () => {
    active = false;
    view?.remove(); view = null;
    ready?.reject(new Error('导出已结束')); ready = null;
    for (const request of pending.values()) request.reject(new Error('导出已结束'));
    pending.clear();
  };
  window.videoExport = {
    runs: ['overview', 'tour'],
    async begin(run, options = {}) {
      if (isExportView) throw new Error('导出视图由主页面驱动');
      const rate = validate(run, options);
      end(); active = true;
      const loaded = new Promise((resolve, reject) => { ready = { resolve, reject }; });
      const childURL = new URL(location.href);
      childURL.searchParams.set('__harbor_export', '1');
      view = document.createElement('iframe');
      view.setAttribute('aria-hidden', 'true'); view.tabIndex = -1;
      view.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;z-index:2147483647;pointer-events:none;visibility:hidden';
      view.src = childURL.href; document.body.appendChild(view);
      try {
        await loaded;
        const info = await rpc('begin', [run, { fps: rate }]);
        ready = null;
        view.style.visibility = 'visible';
        await settle();
        return info;
      } catch (error) { end(); throw error; }
    },
    async frame(i) {
      if (!active || !view) throw new Error('请先调用 begin');
      await rpc('frame', [i]);
      view.style.visibility = 'visible';
      await settle();
    },
    end
  };
  // 导出期间忽略真实鼠标输入；end 后原来的事件监听器立即恢复工作。
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'dblclick', 'contextmenu']) {
    window.addEventListener(type, event => {
      if (!active) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }
})();
