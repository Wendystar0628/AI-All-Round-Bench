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
const root = new NS.Sys(null, {});
root.seedFixtures();
const { sys: inner } = root.createChild({ name: 'inner-1' });
const sp = inner.spawnNIL(NS.KernelSources.progSum(), 'sum');
let traced = 0;
inner.trace = function (proc, at, op, sp2, stack, frames, ctx) {
  if (proc.role === 'kernel' && traced < 200) {
    traced++;
    const names = Object.keys(NS.VM.OP);
    const nm = names.find(k => NS.VM.OP[k] === op);
    console.log('k', at, nm, 'sp=' + sp2, 'top=' + JSON.stringify(stack.slice(Math.max(0, sp2 - 3), sp2)));
  }
};
root.advance(50);
console.log('sumWork', sp.proc.work, 'log', sp.proc.log.join('|'), 'kstate', inner.kernelProc.state);
