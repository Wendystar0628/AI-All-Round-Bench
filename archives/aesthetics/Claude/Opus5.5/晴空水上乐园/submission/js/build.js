'use strict';
/* ==========================================================================
   Build orchestration
   ========================================================================== */
(function () {
  const P = window.P;
  const nextFrame = () => new Promise((r) => setTimeout(r, 0));
  P.buildAll = async function (progress) {
    const steps = [
      ['models', () => { P.buildPalmModels(); P.buildPlantModels(); P.buildPropModels(); }],
      ['front', () => P.buildFront && P.buildFront()],
      ['mid', () => P.buildMid && P.buildMid()],
      ['back', () => P.buildBack && P.buildBack()],
      ['slides', () => P.buildSlides && P.buildSlides()],
      ['plants', () => P.buildPlanting && P.buildPlanting()],
    ];
    let i = 0;
    for (const [name, fn] of steps) {
      const t = performance.now();
      fn();
      console.log('build', name, (performance.now() - t).toFixed(0), 'ms');
      i++;
      progress(0.2 + 0.5 * (i / steps.length));
      await nextFrame();
    }
  };
  // after meshing: instanced props
  P.placeInstances = function (scene) {
    let n = 0;
    for (const name in P.inst) {
      const mdl = P.models[name];
      if (!mdl) { console.warn('no model', name); continue; }
      const list = P.inst[name];
      P.instModel(scene, mdl, list);
      n += list.length;
    }
    console.log('instances', n);
  };
})();
