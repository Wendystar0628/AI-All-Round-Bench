/* main.js — 启动、窗口尺寸、videoExport 逐帧接口 */
(function(){
'use strict';
const $=s=>document.querySelector(s);

function boot(){
  const canvas=$('#gl');
  if(!Render.init(canvas)){ return; }
  Composite.init();
  UI.init();
  Editor.init();
  NodesWidget.init();
  // 初始工程
  Demo.load();
  Editor.openComp(Model.project.comps[0].id);
  Editor.fitView();
  resize();
  window.addEventListener('resize',resize);
  // 供评测使用的固定接口
  setupExport();
  setTimeout(()=>Editor.toast('已载入「锻字」示例工程 · 空格播放'),300);
}
function resize(){
  const wrap=document.getElementById('viewer-wrap');
  const w=wrap.clientWidth||800, h=wrap.clientHeight||450;
  Render.resize(w,h);
  const comp=Model.currentComp();
  if(comp){ Render.setComp(comp.width,comp.height); }
  Render.fitView(Editor.zoomLevel||1);
  Editor.drawOverlay();
}

/* ==================== 逐帧导出接口 ==================== */
function setupExport(){
  const api={
    runs:['demo'],
    begin:async function(runId,opts){
      opts=opts||{};
      const fps=opts.fps||30;
      if(!Model.project){ Demo.load(); }
      const comp=Model.project.comps.find(c=>c.name==='锻字')||Model.project.comps[0];
      comp.fps=fps;
      comp.duration=15;
      comp.workStart=0; comp.workEnd=15;
      Editor.openComp(comp.id);
      Editor.playing=false;
      Editor.zoomLevel=1;
      Render.fitView(1);
      resize();
      api._comp=comp;
      api._fps=fps;
      api._active=true;
      Editor.setTime(0);
      // 预渲染第 0 帧
      await api.frame(0);
      return {frames:15*fps};
    },
    frame:async function(i){
      const comp=api._comp||Model.currentComp();
      if(!comp) return;
      const t=U.clamp(i/api._fps,0,comp.duration);
      Editor.time=t;
      Editor.playing=false;
      AudioEngine.stopAll();
      Particles.invalidateAll();
      // 预取样，确保粒子/几何缓存就绪
      for(const l of comp.layers){
        if(l.type==='particle') Particles.sample(l,comp,t);
      }
      Editor.render();
      UI.updateHUD();
      // 再渲染一次确保稳定
      Editor.render();
      return true;
    },
    end:async function(){
      api._active=false;
      Editor.playing=false;
      AudioEngine.stopAll();
      Particles.invalidateAll();
      const comp=api._comp||Model.currentComp();
      if(comp){ comp.fps=30; }
      Editor.setTime(0);
      Editor.render();
      return true;
    },
  };
  window.videoExport=api;
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

})();
