(function(){
'use strict';
let autoStart=0;
let exportMode=false;
let exportStart=0;
let exportFps=60;
let globalTime=0;

function loop(now){
  requestAnimationFrame(loop);
  if(exportMode) return;
  globalTime=(now-autoStart)/1000;
  window.SCENE.renderAt(globalTime,{cycle:Math.floor(globalTime/window.SCENE.duration)});
}

async function init(){
  await new Promise(r=>requestAnimationFrame(r));
  window.VE.resize();
  window.SCENE.init();
  window.VE.resize();
  const loading=document.getElementById('loading');
  if(loading) loading.classList.add('hide');
  autoStart=performance.now();
  requestAnimationFrame(loop);
}

window.videoExport={
  runs:['tour'],
  async begin(runId,opts){
    exportMode=true;
    exportFps=(opts&&opts.fps)?opts.fps:60;
    exportStart=0;
    globalTime=0;
    // All state is a pure function of global time, so rebuilding is implicit.
    return {frames:Math.round(window.SCENE.duration*exportFps)};
  },
  async frame(i){
    const t=exportStart+i/exportFps;
    globalTime=t;
    window.SCENE.renderAt(t,{cycle:0});
    window.VE.gl.finish();
  },
  end(){
    exportMode=false;
    autoStart=performance.now()-globalTime*1000;
    return true;
  }
};

window.addEventListener('load',init);
})();