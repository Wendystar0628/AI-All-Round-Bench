'use strict';
const DemoMotion={point:null,target:null,drag:null,clickTime:-99,
 reset(){this.point=null;this.target=null;this.drag=null;this.clickTime=-99;$('demoCursor').style.display='none';$('demoCursor').querySelector('.drag-device').style.display='none';$('demoCursor').querySelector('.click-ring').style.opacity=0;},
 position(target){if(target.kind==='world')return View.screenPos(target.cell);const el=document.querySelector(target.selector),r=el?.getBoundingClientRect();if(!r?.width||!r.height)return target.last||this.point||{x:0,y:0};target.last={x:r.left+r.width*.5,y:r.top+r.height*.5};return target.last;},
 to(target,label='',duration=.45,drag=null){if(!target){this.point=null;this.target=null;this.drag=null;$('demoCursor').style.display='none';return;}const p=this.position(target),from=this.point||p;this.target={...target,from:{...from},start:Demo.time,duration:this.point?duration:0};this.drag=drag;$('demoCursor').style.display='block';$('demoCursor').querySelector('span').textContent=label;this.update();},
 world(c,label='',duration=.45,drag=null){this.to(c?{kind:'world',cell:c}:null,label,duration,drag);},
 element(selector,label='',duration=.45,drag=null){this.to({kind:'element',selector},label,duration,drag);},
 click(){this.clickTime=Demo.time;this.update();},
 update(){
  if(!this.target)return;const a=this.target,goal=this.position(a),p=a.duration?Math.min(1,Math.max(0,(Demo.time-a.start)/a.duration)):1,ease=p*p*(3-2*p);this.point={x:a.from.x+(goal.x-a.from.x)*ease,y:a.from.y+(goal.y-a.from.y)*ease};const el=$('demoCursor');el.style.left=this.point.x+'px';el.style.top=this.point.y+'px';const chip=el.querySelector('.drag-device');chip.style.display=this.drag&&p<1?'block':'none';
  if(this.drag&&p<1&&!UI.pending){chip.textContent=(Data.towers[this.drag]||Data.items[this.drag]).name;const rect=View.el.getBoundingClientRect();if(this.point.x>=rect.left&&this.point.x<=rect.right&&this.point.y>=rect.top&&this.point.y<=rect.bottom){const c=View.cellAt(this.point.x,this.point.y);if(c){const item=!!Data.items[this.drag],d=item?Data.items[this.drag]:Data.towers[this.drag],check=item?Game.itemCheck(this.drag,c):Game.canPlace(this.drag,c);View.showRange(c,d.range,this.drag,0,check.valid);View.showGhost(item?'':this.drag,c,0,check.valid);UI.previewRoutes(check);chip.classList.toggle('invalid',!check.valid);}}}
  const elapsed=Demo.time-this.clickTime,ring=el.querySelector('.click-ring');ring.style.opacity=elapsed>=0&&elapsed<.55?1-elapsed/.55:0;ring.style.transform='scale('+(1+Math.max(0,elapsed)*2)+')';
 }
};
