(function(){
  'use strict';
  const F=window.Forge;
  F.needsRender=true;
  function init(){
    try{
      F.project=F.buildDefaultProject();F.time=8.16;F.selection=['glyph'];F.renderer.init();F.ui.init();F.emit('selection',F.selection);F.emit('time',F.time);F.renderer.render(F.time,true);
      let last=performance.now();
      function tick(now){const delta=Math.min(.08,(now-last)/1000);last=now;if(F.playing&&!F.exporting){const comp=F.activeComp(),previous=F.time;let time=previous+delta;if(time>=comp.workEnd){if(F.loop)time=comp.workStart+(time-comp.workEnd)%Math.max(.001,comp.workEnd-comp.workStart);else{time=comp.workEnd-1/comp.fps;F.ui.togglePlay()}}F.setTime(time);F.audio.update(previous,time)}if(F.needsRender&&!F.exporting){F.renderer.render(F.time,F.playing);F.needsRender=false}else if(F.playing&&!F.exporting)F.renderer.render(F.time);requestAnimationFrame(tick)}requestAnimationFrame(tick);
      window.forgeApp=F;window.FORGE_READY=true;
    }catch(error){console.error(error);const loading=document.getElementById('render-loading');loading.innerHTML=`<strong>工程初始化失败</strong><span>${String(error.message||error)}</span>`}
  }
  let exportState=null,exportFPS=60;
  window.videoExport={
    runs:['demo'],
    async begin(runId,options={}){if(runId!=='demo')throw new Error('未知导出段落：'+runId);if(!window.FORGE_READY)await new Promise(resolve=>{const timer=setInterval(()=>{if(window.FORGE_READY){clearInterval(timer);resolve()}},30)});if(F.playing)F.ui.togglePlay();exportState={activeCompId:F.project.activeCompId,time:F.time,selection:F.selection.slice(),motionBlur:F.motionBlur};exportFPS=Math.max(1,Number(options.fps)||60);F.exporting=true;F.audio.pause();F.project.activeCompId='main';F.selection=['glyph'];F.setTime(0);F.emit('change',{label:'逐帧导出'});F.renderer.render(0);return{frames:Math.round(15*exportFPS)}},
    async frame(index){if(!F.exporting)throw new Error('请先调用 videoExport.begin');const i=Math.max(0,Math.round(Number(index)||0)),time=i/exportFPS;F.setTime(time);await new Promise(resolve=>requestAnimationFrame(resolve));F.renderer.render(time);await new Promise(resolve=>requestAnimationFrame(resolve));return{frame:i,time}},
    end(){if(!F.exporting)return;F.exporting=false;if(exportState){F.project.activeCompId=exportState.activeCompId;F.setTime(exportState.time);F.selection=exportState.selection;F.motionBlur=exportState.motionBlur}exportState=null;F.emit('change',{label:'结束逐帧导出'});F.emit('selection',F.selection);F.renderer.render(F.time,true);F.needsRender=true}
  };
  init();
})();
