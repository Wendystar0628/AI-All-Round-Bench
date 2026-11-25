"use strict";
(()=>{
  const $=id=>document.getElementById(id);
  const stage=$("stage"), canvas=$("film"), ctx=canvas.getContext("2d",{alpha:false}), track=$("track");
  const seek=$("seek"),launch=$("launch"),play=$("play"),volume=$("volume");
  let poster=true,exporting=false,ready=false,rate=60,frameCount=0,targetTime=0;
  let raf=0,hideTimer=0,dragging=false,restore=null,requestId=0,lastDisplayFrame=-1;
  let mediaLength=81.4,dragPointer=null,resumeAfterDrag=false;
  const icon=(button,name)=>button.querySelector("use").setAttribute("href","#i-"+name);
  const short=t=>pad(Math.floor(t/60))+":"+pad(Math.floor(t)%60);
  function measure(){
    const bounds=stage.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
    const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
  }
  function update(t){
    const section=sections[sectionAt(t)][1],id=pad(cutAt(t));
    if($("sectionName").textContent!==section)$("sectionName").textContent=section;
    if($("cutNumber").textContent!==id)$("cutNumber").textContent=id;
    if($("now").textContent!==short(t))$("now").textContent=short(t);
    if(!dragging)seek.value=t;
    const readout=short(t)+" · "+section+" · Cut "+id;if(seek.getAttribute("aria-valuetext")!==readout)seek.setAttribute("aria-valuetext",readout);
    $("railFill").style.width=100*clamp(t/mediaLength)+"%";
  }
  function draw(){
    if(!ready)return;
    const t=exporting?targetTime:track.currentTime;
    if(poster&&!exporting)cover(ctx,canvas.width,canvas.height);
    else renderAt(ctx,t,canvas.width,canvas.height);
    if(!exporting)update(t);
  }
  function loop(){
    raf=0;if(exporting||track.paused||track.ended)return;
    const displayFrame=Math.floor(track.currentTime*60);
    if(displayFrame!==lastDisplayFrame){lastDisplayFrame=displayFrame;draw()}
    raf=requestAnimationFrame(loop);
  }
  function awaken(){
    document.body.classList.remove("idle");clearTimeout(hideTimer);
    if(!track.paused&&!exporting)hideTimer=setTimeout(()=>document.body.classList.add("idle"),2200);
  }
  function usePoster(on){poster=on;launch.hidden=!on||exporting}
  function transportState(){
    const paused=track.paused||track.ended;icon(play,paused?"play":"pause");play.setAttribute("aria-label",paused?"再生":"一時停止");
    canvas.setAttribute("aria-description",paused?"再生（Space）":"一時停止（Space）");awaken()
  }
  async function toggle(){
    if(exporting||dragging)return;
    if(!track.paused){track.pause();return}
    if(track.ended||track.currentTime>=mediaLength-.008)track.currentTime=0;
    const attempt=++requestId;usePoster(false);
    try{await prepared;if(exporting||attempt!==requestId)return;await track.play()}
    catch{if(!exporting){usePoster(track.currentTime===0);draw()}}
  }
  function jump(t){
    if(exporting)return;usePoster(false);track.currentTime=clamp(t,0,mediaLength);
    if(ready){renderAt(ctx,track.currentTime,canvas.width,canvas.height);update(track.currentTime)}awaken()
  }
  function readDuration(){
    if(Number.isFinite(track.duration)){mediaLength=track.duration;seek.max=mediaLength;$("length").textContent=short(mediaLength)}
  }
  track.addEventListener("loadedmetadata",readDuration);readDuration();
  track.addEventListener("play",()=>{if(exporting){track.pause();return}usePoster(false);lastDisplayFrame=-1;transportState();cancelAnimationFrame(raf);loop()});
  track.addEventListener("pause",()=>{cancelAnimationFrame(raf);transportState();if(!exporting)draw()});
  track.addEventListener("seeked",()=>{if(!exporting)draw()});
  track.addEventListener("ended",()=>{transportState();draw()});
  launch.addEventListener("click",toggle);canvas.addEventListener("click",toggle);play.addEventListener("click",toggle);
  function scrubAtPointer(event){
    if(!dragging||event.pointerId!==dragPointer)return;
    const bounds=seek.getBoundingClientRect(),thumbRadius=4.5;
    const fraction=clamp((event.clientX-bounds.left-thumbRadius)/Math.max(1,bounds.width-2*thumbRadius));
    seek.value=fraction*mediaLength;
    jump(Number(seek.value))
  }
  seek.addEventListener("pointerdown",event=>{
    if(exporting||dragging||event.button!==0)return;
    event.preventDefault();seek.focus({preventScroll:true});
    dragging=true;dragPointer=event.pointerId;resumeAfterDrag=!track.paused;
    seek.setPointerCapture(event.pointerId);
    if(resumeAfterDrag)track.pause();
    scrubAtPointer(event)
  });
  window.addEventListener("pointermove",event=>{
    if(!dragging||event.pointerId!==dragPointer)return;
    if(event.buttons&1)scrubAtPointer(event);else finishDrag(event)
  },true);
  function finishDrag(event){
    if(!dragging||event.pointerId!==dragPointer)return;
    if(event.type==="pointerup")scrubAtPointer(event);
    const resume=resumeAfterDrag;dragging=false;dragPointer=null;resumeAfterDrag=false;
    if(exporting)return;
    update(track.currentTime);awaken();
    if(resume&&track.currentTime<mediaLength-.001)track.play().catch(transportState)
  }
  window.addEventListener("pointerup",finishDrag,true);
  window.addEventListener("pointercancel",finishDrag,true);
  // A native range thumb can transfer capture while the button is still held.
  // Continue tracking its pointer through the window until the real release.
  seek.addEventListener("lostpointercapture",event=>{if(event.buttons===0)finishDrag(event)});
  window.addEventListener("blur",()=>{if(dragging)finishDrag({pointerId:dragPointer})});
  seek.addEventListener("input",()=>{if(!dragging)jump(Number(seek.value))});
  seek.addEventListener("keydown",e=>{
    if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
    e.preventDefault();jump(track.currentTime+(e.key==="ArrowLeft"?-1:1)*(e.shiftKey?5:BEAT))
  });
  const rail=$("rail"),tip=$("scrubTip");
  rail.addEventListener("pointermove",e=>{
    const b=rail.getBoundingClientRect();const t=clamp((e.clientX-b.left)/b.width)*mediaLength;
    tip.hidden=false;tip.style.left=clamp(e.clientX-b.left,57,b.width-57)+"px";tip.textContent=short(t)+"   ·   CUT "+pad(cutAt(t));
  });rail.addEventListener("pointerleave",()=>tip.hidden=true);
  sections.slice(1).forEach(([t])=>{const mark=document.createElement("i");mark.style.left=(t/81.4*100)+"%";$("ticks").append(mark)});
  track.volume=.8;
  function soundState(){const quiet=track.muted||track.volume===0;icon($("mute"),quiet?"mute":"speaker");
    $("mute").setAttribute("aria-label",quiet?"ミュートを解除":"ミュート");volume.value=quiet?0:track.volume;volume.style.setProperty("--vol",(Number(volume.value)*100)+"%")}
  $("mute").addEventListener("click",()=>{if(track.volume===0)track.volume=.8;else track.muted=!track.muted;soundState();awaken()});
  volume.addEventListener("input",()=>{track.muted=false;track.volume=Number(volume.value);soundState();awaken()});
  async function fullscreen(){if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector(".archive").requestFullscreen()}
  $("fullscreen").addEventListener("click",()=>fullscreen().catch(()=>{}));
  document.addEventListener("fullscreenchange",()=>{icon($("fullscreen"),document.fullscreenElement?"small":"expand");$("fullscreen").setAttribute("aria-label",document.fullscreenElement?"全画面を終了":"全画面");measure();draw()});
  document.addEventListener("pointermove",awaken,{passive:true});
  document.addEventListener("keydown",e=>{
    if(exporting||e.altKey||e.metaKey||e.ctrlKey)return;
    if(e.code==="Space"&&e.target.tagName!=="BUTTON"){e.preventDefault();toggle()}
    if(e.code==="KeyM")$("mute").click();
    if(e.code==="KeyF")$("fullscreen").click();
    if(e.target.tagName!=="INPUT"&&["ArrowLeft","ArrowRight"].includes(e.key)){
      e.preventDefault();jump(track.currentTime+(e.key==="ArrowLeft"?-1:1)*(e.shiftKey?5:BEAT))
    }awaken()
  });
  new ResizeObserver(()=>{measure();draw()}).observe(stage);
  const prepared=(async()=>{
    measure();cover(ctx,canvas.width,canvas.height);
    await imagesReady;prepareSprites();await document.fonts.ready;
    if(poster&&!exporting)cover(ctx,canvas.width,canvas.height);
    if(typeof prepareSpace==="function")prepareSpace();
    if(typeof prepareProofs==="function")prepareProofs();
    ready=true;measure();draw()
  })();
  // In a visible player, post the completion task from the rendering step.
  // The capture caller then runs after this canvas update has been presented.
  // Hidden pages still submit the bitmap without depending on a refresh tick.
  const canvasFence=new MessageChannel(),pendingFrames=[];
  canvasFence.port1.onmessage=()=>{const done=pendingFrames.shift();if(done)done()};
  function afterPresentation(){
    return new Promise(resolve=>{
      let refresh=0;
      function submit(){
        cancelAnimationFrame(refresh);
        document.removeEventListener("visibilitychange",visibilityChanged);
        window.removeEventListener("blur",submit);
        pendingFrames.push(resolve);canvasFence.port2.postMessage(0)
      }
      function visibilityChanged(){if(document.hidden)submit()}
      if(document.hidden||!document.hasFocus()){submit();return}
      document.addEventListener("visibilitychange",visibilityChanged);
      window.addEventListener("blur",submit);
      refresh=requestAnimationFrame(submit)
    })
  }
  window.videoExport={
    runs:["pv"],
    async begin(run,options={}){
      if(run!=="pv")throw new RangeError("Unknown run: "+run);
      const fps=Number(options.fps??60);if(!(fps>0&&Number.isFinite(fps)))throw new RangeError("fps must be positive");
      if(!exporting)restore={time:track.currentTime,playing:!track.paused||resumeAfterDrag,poster,muted:track.muted};
      dragging=false;dragPointer=null;resumeAfterDrag=false;
      requestId++;exporting=true;rate=fps;track.pause();track.muted=true;cancelAnimationFrame(raf);clearTimeout(hideTimer);
      document.body.classList.remove("idle");document.body.classList.add("exporting");launch.hidden=true;targetTime=0;
      await prepared;track.currentTime=0;
      // Chrome may defer media loading in an unselected local tab. The fixed
      // master was measured at 81.400 s; loaded metadata takes precedence.
      readDuration();frameCount=Math.ceil(mediaLength*rate);
      measure();draw();await afterPresentation();return {frames:frameCount}
    },
    async frame(i){
      if(!exporting)throw new Error("Call begin first");
      if(!Number.isInteger(i)||i<0||i>=frameCount)throw new RangeError("Frame outside run");
      targetTime=i/rate;measure();draw();
      await afterPresentation()
    },
    end(){
      if(!exporting)return;exporting=false;document.body.classList.remove("exporting");track.muted=restore.muted;
      track.currentTime=restore.time;usePoster(restore.poster);soundState();measure();draw();transportState();
      if(restore.playing)track.play().catch(()=>{});restore=null;
    }
  };
})();

