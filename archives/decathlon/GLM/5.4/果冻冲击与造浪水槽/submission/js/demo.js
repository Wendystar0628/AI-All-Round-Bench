'use strict';
class Demos {
  constructor(app) { this.app = app; this.active = false; this.runId = null; this.cameraOverride = false; }
  play(id) {}
  stop() { this.active = false; this.runId = null; }
  progress() { return 1; }
  get api() {
    const self = this;
    return {
      runs: ['jelly-center', 'jelly-multi', 'jelly-offset', 'tank-full'],
      async begin(runId, opts) { return { frames: 1 }; },
      async frame(i) {},
      end() {},
    };
  }
}
