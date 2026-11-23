/* main: init, render loop, interior placement, deterministic video export */
(function(){
  var canvas=document.getElementById('gl');
  var gl=R.init(canvas);
  FX.init();
  R.resize();

  var interiorSets={};
  var simTime=0;
  var exportMode=false;
  var built=false;

  function placeInteriors(){
    interiorSets.bridge.mesh.setTRS(Director.IOFF.bridge,[0,0,0],1);
    interiorSets.core.mesh.setTRS(Director.IOFF.core,[0,0,0],1);
    // hangar built along local X; rotate so its long axis aligns with world -Z entry flow?
    // Keep along X: camera keyframes already authored in local coords + offset.
    interiorSets.hangar.mesh.setTRS(Director.IOFF.hangar,[0,0,0],1);
    interiorSets.corridor.mesh.setTRS(Director.IOFF.corridor,[0,0,0],1);
  }

  function buildScene(){
    World.build();
    interiorSets.bridge=Interiors.buildBridge();
    interiorSets.core=Interiors.buildCore();
    interiorSets.hangar=Interiors.buildHangar();
    interiorSets.corridor=Interiors.buildCorridor();
    placeInteriors();
    if(!built){Director.setup();built=true;}
    Director.resetForExport();
  }

  try{ buildScene(); }catch(e){R.showError('BUILD: '+(e.stack||e));throw e;}

  var lastWall=performance.now();

  function setInteriorVisibility(kind){
    interiorSets.bridge.mesh.visible=kind==='bridge';
    interiorSets.core.mesh.visible=kind==='core';
    interiorSets.hangar.mesh.visible=kind==='hangar';
    interiorSets.corridor.mesh.visible=kind==='corridor';
    // animated sub-meshes follow parent visibility
    if(interiorSets.core&&interiorSets.core.rings)interiorSets.core.rings.forEach(r=>r.mesh.visible=kind==='core');
    if(interiorSets.corridor&&interiorSets.corridor.jaws)interiorSets.corridor.jaws.forEach(j=>j.mesh.visible=kind==='corridor');
    if(interiorSets.corridor&&interiorSets.corridor._carriers)interiorSets.corridor._carriers.forEach(cm=>cm.visible=kind==='corridor');
  }

  function updateInteriorAnims(t){
    // core rotating ring bands
    if(interiorSets.core&&interiorSets.core.rings){
      for(const r of interiorSets.core.rings){
        var a=t*r.speed;
        // T(offset+height) * R(axis)
        var m=Mat4.trs(V3.add(Director.IOFF.core,V3.c(0,r.y,0)),[r.axis[0]*a,r.axis[1]*a,r.axis[2]*a],1);
        r.mesh.setMatrix(m);
      }
    }
    // corridor jaws opening/closing + advancing carriers
    if(interiorSets.corridor&&interiorSets.corridor.jaws){
      var open=(Math.sin(t*0.6)+1)/2;
      var n=interiorSets.corridor.jaws.length;
      interiorSets.corridor.jaws.forEach((j,i)=>{
        var ph=i*Math.PI;
        var x=j.side*(10+open*8);
        j.mesh.setTRS(V3.add(Director.IOFF.corridor,V3.c(x,0,0)),[0,0,0],1);
      });
    }
    if(interiorSets.corridor&&interiorSets.corridor._carriers){
      // carriers travel from far chamber toward camera; several spaced along the corridor
      var period=160;
      for(var ci=0;ci<interiorSets.corridor._carriers.length;ci++){
        var cm=interiorSets.corridor._carriers[ci];
        var z=-180+fmod(t*90+ci*period*0.8,period+200);
        cm.setTRS(V3.add(Director.IOFF.corridor,V3.c(ci%2?14:-14,-4,z)),[0,0,0],1);
      }
    }
  }

  function drawScene(cam,t,dt,directorStep){
    var aspect=R.canvas.width/R.canvas.height;
    var proj=Mat4.perspective(cam.fov,aspect,0.5,14000);
    var view=Mat4.lookAt(cam.pos,cam.target,cam.up);
    R.setCamera(view,proj,cam.pos);
    R.setLights(Director.currentLights());
    var shot=Director.curShot(Director.t);
    var interior=!!shot.interior;
    if(interior){
      R.state.fogDensity=0.0011;
      R.state.fogColor=new Float32Array([0.012,0.018,0.035]);
      R.state.ambient=new Float32Array([0.16,0.19,0.28]);
    }else{
      R.state.fogDensity=0.00048;
      R.state.fogColor=new Float32Array([0.012,0.016,0.030]);
      R.state.ambient=new Float32Array([0.10,0.13,0.20]);
    }
    gl.clearColor(0.008,0.011,0.022,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    var fwd=V3.norm(V3.sub(cam.target,cam.pos));
    var right=V3.norm(V3.cross(fwd,V3.c(0,1,0)));
    var up=V3.cross(right,fwd);
    FX.beginFrame(view,proj);
    FX.drawSky(view,proj,t);
    updateInteriorAnims(t);
    setInteriorVisibility(shot.interior);
    R.renderAll();
    FX.drawParticles(view,proj,right,up);
    Director.renderBeams();
    if(!interior)Director.renderShields(t);
  }

  var crashed=false;
  function loop(now){
    if(!exportMode&&!crashed){
      try{
      var dt=Math.min(0.05,(now-lastWall)/1000);
      lastWall=now;
      World.update(dt,simTime);
      var cam=Director.update(simTime,dt);
      FX.updateParticles(dt);
      drawScene(cam,simTime,dt,false);
      simTime=fmod(simTime+dt,Director.LOOP);
      }catch(e){crashed=true;R.showError('LOOP: '+(e.stack||e));}
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('resize',function(){R.resize();});
  window.addEventListener('error',function(e){
    R.showError((e.message||'error')+' @ '+(e.filename||'')+':'+(e.lineno||'')+'\n'+(e.error&&e.error.stack?e.error.stack:''));
  });

  /* deterministic export */
  var exportState=null;
  window.videoExport={
    runs:['tour'],
    begin:function(runId,opts){
      opts=opts||{};
      var fps=opts.fps||60;
      var frames=Math.round(Director.LOOP*fps);
      exportMode=true;
      // full deterministic rebuild
      FX.clearParticles();
      R.clearAll();
      World.reset();
      interiorSets={};
      built=false;
      buildScene();
      R.resize();
      simTime=0;
      exportState={fps:fps,frames:frames,runId:runId};
      return Promise.resolve({frames:frames});
    },
    frame:function(i){
      return new Promise(function(resolve){
        var fps=exportState.fps;
        var t=i/fps,dt=1/fps;
        simTime=t;
        World.update(dt,t);
        FX.updateParticles(dt);
        var cam=Director.step(t,dt);
        drawScene(cam,t,dt,true);
        gl.finish();
        resolve();
      });
    },
    end:function(){
      exportMode=false;
      lastWall=performance.now();
      return Promise.resolve();
    }
  };

  // debug-only timeline seek (preview), not part of the UI
  window.__previewSeek=function(timeSec,fps){
    exportMode=true;
    fps=fps||30;
    FX.clearParticles();
    R.clearAll();
    World.reset();
    interiorSets={};
    built=false;
    buildScene();
    R.resize();
    simTime=0;
    var n=Math.round(timeSec*fps),dt=1/fps;
    for(var i=0;i<=n;i++){
      var t=i/fps;
      World.update(dt,t);
      FX.updateParticles(dt);
      Director.step(t,dt);
    }
    var cam=Director.cam;
    drawScene(cam,timeSec,dt,true);
  };
  window.__previewResume=function(){exportMode=false;lastWall=performance.now();};
})();
