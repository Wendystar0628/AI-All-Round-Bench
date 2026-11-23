/* 视频导出固定接口：window.videoExport */
'use strict';
window.videoExport = {
  runs: ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'],
  _fps: 30, _frames: 0, _busy: false,
  async begin(runId, opts) {
    const fps = Math.max(1, Math.round((opts && opts.fps) || 30));
    if (!GFX.device) throw new Error('WebGPU 尚未就绪');
    App.enterExport();
    const st = Demos.begin(runId);
    this._fps = fps;
    this._frames = Math.round(st.def.duration * fps) + 1;
    App.resizeCanvas(true);
    // 初始状态渲染一次，确保资源就绪
    App.renderOnce();
    await GFX.device.queue.onSubmittedWorkDone();
    return { frames: this._frames };
  },
  async frame(i) {
    if (!Demos.active) throw new Error('尚未 begin');
    const t = i / this._fps;
    await Demos.advanceTo(t);
    App.renderOnce();
    await GFX.device.queue.onSubmittedWorkDone();
  },
  end() {
    Demos.end();
    App.exitExport();
  }
};
