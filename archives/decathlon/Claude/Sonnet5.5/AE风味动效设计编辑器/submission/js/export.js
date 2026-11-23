(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  window.videoExport = { runs: ['demo'], async begin(runId, o) { return { frames: 15 * ((o && o.fps) || 30) }; }, async frame(i) { }, end() { } };
})();
