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
try {
  const prog = NS.VM.compile(NS.KernelSources.defaultKernel('inner-1'));
  console.log('compile ok, code', prog.code.length, 'nglobals', prog.nglobals);
} catch (e) { console.log('compile error:', e.message); }
const root = new NS.Sys(null, {});
root.seedFixtures();
const { sys: inner } = root.createChild({ name: 'inner-1' });
console.log('state', inner.state, 'err', inner.kernelError);
console.log('kernelProc', !!inner.kernelProc, 'procs', inner.procs.size);
