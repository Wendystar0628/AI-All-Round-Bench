'use strict';
global.window = global;
window.NOS = window.NOS || {};
const NS = window.NOS;
NS.fmtBytes = n => String(n);
NS.makeId = p => p + '-' + Math.random().toString(36).slice(2, 8);
NS.uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
NS.clamp = (v,a,b) => Math.max(a, Math.min(b,v));
NS.jsonClone = v => JSON.parse(JSON.stringify(v));
NS.el = () => null; NS.toast = () => {}; NS.download = () => {};
NS.confirmDialog = () => Promise.resolve(false);
NS.AppHost = { onProcOutput(){}, onAppProcStateChange(){}, closeAppByPid(){}, applyUiOp(){} };
NS.DesktopAPI = { applyUiOp(){}, onSystemCreated(){}, onSystemStopped(){}, onSystemRestarted(){} };
NS.SceneHost = { onSceneSubmit(){}, onFxSubmit(){} };
require('../js/vm.js');
require('../js/kernel-sources.js');
require('../js/sys.js');
const K = NS.KernelSources;
const root = new NS.Sys(null, {});
root.seedFixtures();
const { sys: inner, carrier } = root.createChild({ name: 'inner-1' });
const r = inner.spawnNIL(K.progSum(), 'sum');
console.log('sum pid', r.proc.pid);
for (let i = 0; i < 10; i++) {
  root.advance(NS.STEP_MS);
  const kp = inner.kernelProc;
  console.log('step', i, 'rootUsed', root.usedLastStep, 'innerUsed', inner.usedLastStep,
    'carrierWork', carrier.work, 'kstate', kp && kp.state, 'kmail', kp && kp.mailbox.length,
    'sumState', r.proc.state, 'sumWork', r.proc.work, 'log', r.proc.log.join('|'));
}
console.log('child grantFromParent', inner.grantFromParent, 'grantCaps', Object.keys(root.grantCaps));
