'use strict';
global.window = global;
window.NOS = window.NOS || {};
require('../js/vm.js');
require('../js/kernel-sources.js');
const K = window.NOS.KernelSources;
const items = {
  kernel: () => K.defaultKernel('inner-1'),
  sum: K.progSum, sender: K.progSender, receiver: K.progReceiver, endless: K.progEndless,
  flycontrol: K.progFlyControl, timeline: K.progTimeline, scene: K.progScene, fx: K.progFx,
  chartRecv: K.progChartRecv, wmRules: K.wmRules, chartRules: K.chartRules
};
let bad = 0;
for (const k in items) {
  try { const p = window.NOS.VM.compile(items[k]()); console.log('ok   ' + k + ' (' + p.code.length + ')'); }
  catch (e) { bad++; console.log('FAIL ' + k + ': ' + e.message); }
}
// 场景资源 JSON 与记录可解析
try {
  const sc = JSON.parse(K.sampleScene());
  console.log('scene ok: duration', sc.duration, 'terrain', sc.terrain.n, 'record segs', sc.record.length);
} catch (e) { bad++; console.log('FAIL scene json: ' + e.message); }
try { const sh = JSON.parse(K.sampleSheet()); console.log('sheet ok: cells', Object.keys(sh.sheet.cells).length); }
catch (e) { bad++; console.log('FAIL sheet json: ' + e.message); }
process.exit(bad ? 1 : 0);