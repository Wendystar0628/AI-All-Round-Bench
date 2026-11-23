/* ============ 锻火 FORGE · export.js : 逐帧导出接口 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;

const E={};
E.runs=['demo'];
E._ready=null;
E._busy=false;

E.begin=async function(runId,opts){
  opts=opts||{};
  const fps=opts.fps||30;
  if(runId!=='demo')throw new Error('未知的导出段: '+runId);
  // 等待示例准备完成
  await E.ensureReady();
  const app=APP.app;
  app.exportMode=true;
  app.exportFps=fps;
  // 重置到起始状态
  APP.audio.mute(true);
  APP.audio.stop();
  app.particleCache.clear();
  app.renderCache.clear();
  app.time=0;
  app.playing=false;
  // 回到主合成
  const comp=APP.project.activeComp();
  if(comp)app.project.activeComp=comp.id;
  APP.ui.refreshAll();
  APP.ui.fit();
  APP.ui.renderFrame();
  E._frames=Math.round(15*fps);
  return {frames:E._frames};
};
E.frame=async function(i){
  const app=APP.app;
  if(!app.exportMode)throw new Error('请先调用 begin()');
  const fps=app.exportFps||30;
  const comp=APP.project.activeComp();
  const t=C.clamp(i/fps,0,comp.duration);
  app.time=t;
  app.renderCache.clear();
  app.playing=false;
  APP.audio.stop();
  APP.ui.renderFrame();
  APP.ui.refreshTimeline();
  APP.ui.updateTimeRead();
  // 确保完成绘制
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return {i,t};
};
E.end=function(){
  const app=APP.app;
  app.exportMode=false;
  APP.audio.mute(false);
  APP.ui.refreshAll();
};
E.ensureReady=function(){
  if(E._ready)return E._ready;
  E._ready=(async()=>{
    // 字体预热(三角化)
    const chars=APP.font.chars().cjk.concat(APP.font.chars().lat);
    for(const ch of chars){try{APP.font.mesh(ch);}catch(e){}}
    await new Promise(r=>setTimeout(r,30));
    return true;
  })();
  return E._ready;
};
window.videoExport=E;
})();
