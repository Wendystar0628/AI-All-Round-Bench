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
const sp = inner.spawnNIL(K.progSender(), 'sender').proc;
const rc = inner.spawnNIL(K.progReceiver(), 'receiver').proc;
let traced = 0;
inner.trace = function (proc, at, op, sp2, stack, frames, ctx) {
  if (proc === sp && traced < 250) {
    traced++;
    const names = Object.keys(NS.VM.OP);
    const nm = names.find(k => NS.VM.OP[k] === op);
    console.log('s', at, nm, 'sp=' + sp2, 'top=' + JSON.stringify(stack.slice(Math.max(0, sp2 - 2), sp2)).slice(0, 120));
  }
};
for (let i = 0; i < 6; i++) root.advance(50);
console.log('err', sp.error, 'log', sp.log.join('|'), 'state', sp.state);