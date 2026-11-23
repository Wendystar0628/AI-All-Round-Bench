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
const { sys: inner } = root.createChild({ name: 'inner-1' });
const recvP = inner.spawnNIL(K.progReceiver(), 'receiver').proc;
const sendP = inner.spawnNIL(K.progSender(), 'sender').proc;
for (let i = 0; i < 60; i++) {
  root.advance(NS.STEP_MS);
  if (i % 10 === 0 || i === 59) {
    console.log('step', i,
      'sender', sendP.state, sendP.log.join('|'),
      'recv', recvP.state, recvP.log.join('|'),
      'outbox', inner.outbox.length,
      'kstate', inner.kernelProc.state);
  }
}
