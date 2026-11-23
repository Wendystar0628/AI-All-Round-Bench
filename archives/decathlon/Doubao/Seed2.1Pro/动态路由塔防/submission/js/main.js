/* ================= 启动与主循环 ================= */
(function(){
'use strict';
var canvas=document.getElementById('scene');
var world=new G.World(canvas);
var game=new G.Game(world);
var ui=new G.UI(world,game);

G.main={world:world,game:game,ui:ui};

var last=performance.now(),exporting=false;
G.main.renderFrame=function(){
  world.render(0.016);
};
G.Demo.init&&G.Demo.init();

function loop(now){
  var dt=Math.min(.05,(now-last)/1000);last=now;
  var demo=G.Demo.current;
  if(demo&&demo.exportMode){
    // 导出模式：frame(i) 已负责推进与渲染，实时循环空转
    world.render(dt);
  }else{
    var active=(ui.mode==='battle'||ui.mode==='demo')&&!game.over;
    if(ui.mode==='battle'&&!game.paused){
      game.update(dt*game.speed);
    }
    world.render(dt);
    if(ui.mode==='battle'||ui.mode==='demo')ui.update(dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 启动主菜单（背景展示地图一）
ui.showMenu();

// 防止中键拖动选中页面
document.addEventListener('mousedown',function(e){if(e.button===1)e.preventDefault();});
})();
