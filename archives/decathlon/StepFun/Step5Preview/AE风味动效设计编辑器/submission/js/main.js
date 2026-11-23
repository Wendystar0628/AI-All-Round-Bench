/* ============ 锻火 FORGE · main.js : 启动 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const P=APP.project;

function boot(msg,pct){
  const l=document.getElementById('bootlog');
  const b=document.querySelector('#bootbar i');
  if(l)l.textContent=msg;
  if(b)b.style.width=pct+'%';
}
async function main(){
  boot('构建编辑器界面…',10);
  await new Promise(r=>setTimeout(r,20));
  if(!APP.app.project)APP.app.project=P.newProject();
  APP.ui.init();
  boot('生成矢量字体…',30);
  await new Promise(r=>setTimeout(r,10));
  try{APP.font.mesh('金');}catch(e){}
  boot('载入示例工程「锻字」…',55);
  await new Promise(r=>setTimeout(r,10));
  try{
    APP.demo.load();
  }catch(e){
    console.error('示例载入失败',e);
    APP.app.project=P.newProject();
  }
  boot('初始化撤销栈…',75);
  await new Promise(r=>setTimeout(r,10));
  C.undo.reset();
  C.undo.snapshot('初始状态');
  APP.ui.refreshAll();
  APP.ui.fit();
  boot('准备渲染…',92);
  await new Promise(r=>setTimeout(r,20));
  APP.ui.renderFrame();
  boot('完成',100);
  await new Promise(r=>setTimeout(r,120));
  document.getElementById('boot').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  APP.ui.resizeCanvas();
  APP.ui.fit();
  APP.ui.refreshAll();
  APP.ui.status('已载入 15 秒示例「锻字」· 空格播放 · 画布可直接拖动图层');
  // 首次交互建立音频
  const initAudio=()=>{
    APP.audio.resume();
    window.removeEventListener('pointerdown',initAudio);
    window.removeEventListener('keydown',initAudio);
  };
  window.addEventListener('pointerdown',initAudio);
  window.addEventListener('keydown',initAudio);
  // 暴露调试入口
  window.FORGE=APP;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(main,0));
else setTimeout(main,0);
})();
