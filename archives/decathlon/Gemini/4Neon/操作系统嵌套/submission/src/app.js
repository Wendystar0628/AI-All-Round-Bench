// Nested OS Renderer Bootstrap & window.bench Automation Interface

import { RootOS } from './root/root_os.js';

const mountEl = document.getElementById('app');
const nosSources = window.nestedHost?.readBundledNosPrograms?.() || {};

const rootOS = new RootOS(mountEl, nosSources);

// Expose window.bench contract (Appendix: 录制约定)
window.bench = {
  version: 1,
  ready: async () => {
    if (rootOS.isReady) {
      await new Promise((r) => setTimeout(r, 30));
      return true;
    }
    return new Promise((resolve) => rootOS.readyResolvers.push(() => resolve(true)));
  },
  reset: async () => {
    await rootOS.resetToInitialState();
    await new Promise((r) => setTimeout(r, 50));
    return true;
  },
  inspect: async () => rootOS.inspectState(),
};

// Expose reference for developer debugging only (never exposed to external webviews)
window.__nestedOS = rootOS;
