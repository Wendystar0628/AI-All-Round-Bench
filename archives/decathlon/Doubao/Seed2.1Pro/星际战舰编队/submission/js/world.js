/* world: fleet formation, shuttles, missiles, asteroid field, engine glow */
var World=(function(){
  var P=R.PAL;
  var ships=[];
  var shuttles=[];
  var asteroids=[];
  var chips=[];
  var missiles=[];
  var flagship=null;
  var guardProto,vanguardProto,shuttleProto;
  var engineAccel=0;   // 0..1 extra
  var spread=0;        // formation spread before battle
  var shieldLevel=0;   // global
  var time=0;
  var rng=RNG(2024);

  function build(){
    flagship={def:Ships.buildFlagship(), pos:V3.c(0,0,0),rot:V3.c(0,0,0),
      shieldT:-10, kind:'flag'};
    guardProto=Ships.buildGuard();
    vanguardProto=Ships.buildVanguard();
    shuttleProto=Ships.buildShuttle();
    // instances share prototype mesh -> create per-instance mesh? same geometry, but need own matrix:
    // meshes are single objects; make lightweight instance wrappers drawing same collector:
    // Simplest: clone Mesh referencing same vbo. We'll create mesh clones.
    formFleet();
    formShuttles();
    formAsteroids();
  }

  function cloneMesh(proto){
    return R.meshFromVbo(proto.mesh);
  }

  function makeShipInstance(proto,pos,rot,scale,kind){
    var mesh=cloneMesh(proto);
    var inst={mesh:mesh,proto:proto,basePos:V3.copy(pos),pos:V3.copy(pos),
      rot:rot?V3.c(rot[0],rot[1],rot[2]):V3.c(0,0,0),
      baseRot:rot?V3.c(rot[0],rot[1],rot[2]):V3.c(0,0,0),
      scale:scale,kind:kind,shieldT:-10,phase:rng()*Math.PI*2,
      spreadOffset:V3.c((rng()-0.5)*40,(rng()-0.5)*30,(rng()-0.5)*60)};
    mesh.setTRS(pos,inst.rot,scale);
    ships.push(inst);
    return inst;
  }

  function formFleet(){
    // guards around flagship sides/rear/heights: 12
    var gpos=[
      [-150, 40,-120],[150, 40,-120],
      [-170,-30,-60],[170,-30,-60],
      [-140, 60, 60],[140, 60, 60],
      [-160,-60,140],[160,-60,140],
      [-120, 90,-220],[120, 90,-220],
      [0,-90,-180],[0,110,-260]
    ];
    gpos.forEach((p,i)=>{
      var s=makeShipInstance(guardProto,p,[0,(i%2?0.15:-0.15),0],0.9,'guard');
    });
    // foreground close escort for opening shot (big on screen edges)
    makeShipInstance(guardProto,[-90,-40,420],[0,0.5,0.1],1.0,'guardClose');
    makeShipInstance(guardProto,[110,30,470],[0,-0.6,-0.08],0.95,'guardClose');

    // vanguards: 16 spread forward & outer
    for(var i=0;i<16;i++){
      var side=i%2?1:-1;
      var row=Math.floor(i/2);
      var x=side*(180+ (row%3)*70 + rng()*30);
      var y=(rng()-0.5)*180 + (row-2.5)*10;
      var z=260 + row*120 + rng()*80;
      makeShipInstance(vanguardProto,[x,y,z],[0,side*0.25+rng()*0.1,(rng()-0.5)*0.1],
        0.85+rng()*0.2,'vanguard');
    }
    // rear distant columns (small silhouettes)
    for(var i=0;i<6;i++){
      var side=i%2?1:-1;
      makeShipInstance(vanguardProto,[side*(120+(i%3)*90),(rng()-0.5)*160,-380-Math.floor(i/2)*120],
        [0,side*0.3,0],0.65+rng()*0.15,'vanguard');
    }
    // distant escort columns stretching toward the horizon
    for(var i=0;i<6;i++){
      var side=i%2?1:-1;
      makeShipInstance(guardProto,[side*(200+rng()*160),(rng()-0.5)*220, -200-i*120+rng()*40],
        [0,side*0.2,0],0.6+rng()*0.2,'guard');
    }
    // far forward screening line of vanguards
    for(var i=0;i<4;i++){
      var side=i%2?1:-1;
      makeShipInstance(vanguardProto,[side*(300+rng()*260),(rng()-0.5)*220, 900+rng()*300],
        [0,side*0.2,0],0.6+rng()*0.2,'vanguard');
    }
  }

  function formShuttles(){
    // several shuttles with scripted loops: parked, launch, escort, return
    for(var i=0;i<7;i++){
      var mesh=cloneMesh(shuttleProto);
      var sh={mesh:mesh,index:i,pos:V3.c(0,0,0),rot:V3.c(0,0,0),
        state:'park',t:rng()*10,phase:rng()*Math.PI*2,
        baySide:i%2?-1:1, bayZ:-100+(i%3)*90};
      mesh.setTRS(sh.pos,sh.rot,1);
      shuttles.push(sh);
    }
  }

  function formAsteroids(){
    // cluster forward starboard
    var layout=[];
    var big=[[420,40,700,46],[560,-60,820,40],[300,120,760,34]];
    var meds=[[480,120,640,22],[620,30,700,24],[380,-120,860,20],[520,180,900,22],[680,-120,820,18]];
    var smalls=[[360,0,620,11],[450,-30,760,10],[600,120,760,12],[280,60,820,9],[700,80,900,11],
      [420,-180,760,10],[560,200,700,12],[650,-180,960,9],[330,180,680,10],[500,60,960,11]];
    big.forEach(a=>layout.push({p:a,big:true}));
    meds.forEach(a=>layout.push({p:a,med:true}));
    smalls.forEach(a=>layout.push({p:a}));
    var seed=500;
    for(var L of layout){
      var a=L.p;
      var ast=Asteroids.makeAsteroid(a[0],a[1],a[2],a[3],seed++);
      ast.role=L;
      asteroids.push(ast);
    }
  }

  function getTargets(){
    return asteroids.filter(a=>a.alive&&!a.cracked);
  }

  /* ---------- shuttles animation ---------- */
  var HANGAR_MOUTH=V3.c(-88,0,0); // approximate flagship port opening
  function shuttlePath(sh,t){
    // cycles 24s: park -> launch out -> fly along hull -> return
    var cyc=fmod(t+sh.phase*3,26)/26;
    var side=sh.baySide;
    var start=V3.c(side*70, (sh.index%3-1)*16-4, sh.bayZ);
    if(cyc<0.2){ // parked in bay
      return {pos:start,rot:[0,side>0?0:Math.PI,0]};
    } else if(cyc<0.45){ // launch: move from bay to mouth then outside
      var u=(cyc-0.2)/0.25;
      var e=easeInOut(u);
      var p=V3.lerp(start, V3.add(HANGAR_MOUTH,V3.c(side*10,(sh.index%3-1)*16, sh.bayZ*0.2)), clamp01(e*1.4));
      if(u>0.7){p=V3.lerp(V3.add(HANGAR_MOUTH,V3.c(0,(sh.index%3-1)*16,0)),
        V3.c(-180,(sh.index%3-1)*16, sh.bayZ*0.2+60),(u-0.7)/0.3);}
      return {pos:p,rot:[0,Math.PI/2*side*0+ (side<0?Math.PI:0) - e*0.0,0.1]};
    } else if(cyc<0.75){ // escort fly along hull from bow to stern
      var u=(cyc-0.45)/0.3;
      var z=lerp(300,-350,u);
      var x=-150-side*20-Math.sin(u*6+sh.phase)*18;
      var y=(sh.index%3-1)*22+Math.sin(u*8+sh.phase)*10;
      return {pos:V3.c(x,y,z),rot:[0.05,-Math.PI/2+0.0,0.0]};
    } else if(cyc<0.92){ // return toward mouth
      var u=(cyc-0.75)/0.17;
      var p=V3.lerp(V3.c(-170,(sh.index%3-1)*22,-350),V3.add(HANGAR_MOUTH,V3.c(-10,(sh.index%3-1)*16,sh.bayZ*0.3)),easeInOut(u));
      return {pos:p,rot:[0,side<0?Math.PI:0,0]};
    } else {
      var u=(cyc-0.92)/0.08;
      var p=V3.lerp(V3.add(HANGAR_MOUTH,V3.c(-10,(sh.index%3-1)*16,sh.bayZ*0.3)),start,easeInOut(u));
      return {pos:p,rot:[0,side<0?Math.PI:0,0]};
    }
  }

  /* ---------- missiles ---------- */
  var missileProto=null;
  function ensureMissileProto(){
    if(missileProto)return missileProto;
    var C=new R.Collector();
    C.add(0,0,-2,P.trim,{scale:1.4,mat:1});
    C.add(0,0,1,P.hull2,{scale:1.2});
    C.add(0,0,3,P.accent2,{scale:0.9,mat:1,glow:P.accent2,emis:1.4});
    C.add(-1,0,-3,P.hull,{scale:0.8});C.add(1,0,-3,P.hull,{scale:0.8});
    missileProto={mesh:R.makeMesh(C)};
    return missileProto;
  }
  function launchMissile(cellPos,target){
    ensureMissileProto();
    var mesh=cloneMesh(missileProto);
    missiles.push({
      mesh:mesh, pos:V3.copy(cellPos), vel:V3.scl(V3.norm(V3.sub(target,cellPos)),120),
      target:target, t:0, life:6, active:true, arc:(rng()-0.5)*60
    });
  }

  // cyclic boost lunge: 0 at loop seam, peaks mid-end, eases back to 0
  function boostLunge(t){
    var up=smoothstep(70,73,t), down=1-smoothstep(73.4,76,t);
    return up*down*240;
  }

  /* ---------- per-frame update ---------- */
  function update(dt,t){
    time=t;
    var lunge=boostLunge(t);
    // intact asteroids stay nearly stationary before the boost; only during the
    // final acceleration do they stream backward past the camera.
    var astDrift=(1.2+engineAccel*40)*dt;
    // ship formation motion
    for(var s of ships){
      var ph=s.phase;
      var bob=Math.sin(t*0.3+ph)*2.5;
      var drift=V3.c(Math.sin(t*0.17+ph)*3, bob, Math.cos(t*0.23+ph)*3+lunge);
      var sp=V3.lerp(s.basePos,V3.add(s.basePos,s.spreadOffset),spread);
      s.pos=V3.add(sp,drift);
      s.rot[0]=s.baseRot[0]+Math.sin(t*0.2+ph)*0.015;
      s.rot[1]=s.baseRot[1]+Math.sin(t*0.13+ph)*0.02;
      s.rot[2]=s.baseRot[2]+Math.cos(t*0.18+ph)*0.02;
      s.mesh.setTRS(s.pos,s.rot,s.scale);
    }
    // flagship subtle + boost lunge
    flagship.def.mesh.setTRS(V3.c(0,Math.sin(t*0.2)*3,lunge),[Math.sin(t*0.15)*0.005,0,0],1);
    flagship.pos=V3.c(0,Math.sin(t*0.2)*3,lunge);

    // shuttles (follow fleet boost lunge)
    for(var sh of shuttles){
      var st=shuttlePath(sh,t);
      sh.pos=V3.add(st.pos,V3.c(0,0,lunge));
      sh.rot=V3.c(st.rot[0],st.rot[1],st.rot[2]);
      sh.mesh.setTRS(sh.pos,sh.rot,1);
    }

    // asteroids
    for(var a of asteroids){
      if(!a.driftZ)a.driftZ=0;
      a.driftZ-=astDrift*(a.cracked?2.2:1);
      a.lunge=lunge;
      Asteroids.updateAst(a,dt);
    }
    for(var c of chips){
      c.lunge=lunge;
      Asteroids.updateChip(c,dt);
    }

    // missiles
    for(var i=missiles.length-1;i>=0;i--){
      var m=missiles[i];
      m.t+=dt;
      var aim=V3.c(m.target[0]+Math.sin(m.t*2)*m.arc,m.target[1]+Math.cos(m.t*1.7)*m.arc*0.6,m.target[2]+lunge);
      var dist=V3.dist(m.pos,aim);
      var desired=V3.scl(V3.norm(V3.sub(aim,m.pos)),Math.min(320,140+m.t*120));
      m.vel=V3.lerp(m.vel,desired,Math.min(1,dt*2.2));
      m.pos=V3.add(m.pos,V3.scl(m.vel,dt));
      var yaw=Math.atan2(m.vel[0],m.vel[2]);
      var horiz=Math.hypot(m.vel[0],m.vel[2]);
      var pitch=-Math.atan2(m.vel[1],horiz);
      m.mesh.setTRS(m.pos,[pitch,yaw,0],1.6);
      // dense bright long trail (deterministic accumulator per missile)
      m.trail=(m.trail||0)+dt;
      while(m.trail>0.022){
        m.trail-=0.022;
        var back=V3.scl(V3.norm(m.vel),-3);
        FX.spawn({pos:V3.add(m.pos,back),vel:V3.scl(m.vel,-0.1),
          size:3.2,type:2,color:[1.0,0.62,0.26],life:1.5,drag:1.2,stretch:m.vel});
        FX.spawn({pos:V3.add(m.pos,back),vel:V3.scl(m.vel,-0.05),
          size:5,type:0,color:[1,0.55,0.25],life:1.2,drag:0.8,grow:12});
      }
      if(dist<26||m.t>m.life)missiles.splice(i,1);
    }

    emitEngineFX(dt,t);
  }

  var flameAcc=0;
  function emitEngineFX(dt,t){
    flameAcc+=dt;
    var interval=0.03;
    var power=1+engineAccel*1.6;
    while(flameAcc>interval){
      flameAcc-=interval;
      // flagship engines
      for(var ei=0;ei<flagship.def.loc.engines.length;ei++){
        var e=flagship.def.loc.engines[ei];
        if(rng()<0.9){
          var wp=V3.add(flagship.pos,V3.c(e.pos[0],e.pos[1],e.pos[2]));
          var back=V3.c(0,0,-1);
          var vel=V3.add(V3.scl(back,(20+rng()*16)*power),V3.c((rng()-0.5)*5,(rng()-0.5)*5,0));
          var col=rng()<0.25?[0.4,0.8,1.0]:(rng()<0.5?[1.0,0.62,0.22]:[1.0,0.82,0.4]);
          FX.spawn({pos:V3.add(wp,V3.c((rng()-0.5)*e.r*0.7,(rng()-0.5)*e.r*0.7,-2)),
            vel:vel,size:e.r*0.62*(1+engineAccel*0.6),type:2,color:col,
            life:1.0+rng()*0.6,drag:1.1,fade:true,stretch:vel});
          if(rng()<0.3)FX.spawn({pos:wp,vel:V3.scl(back,(8+rng()*10)*power),
            size:e.r*0.9,type:0,color:[1,0.6,0.3],life:0.7,drag:1,grow:e.r});
        }
      }
      // escort engines (subset for perf)
      for(var si=0;si<ships.length;si+=2){
        var s=ships[si];
        var eng=s.kind==='vanguard'?s.proto.engines:s.proto.engines;
        for(var e2 of eng){
          if(rng()<0.4){
            var p2=V3.add(s.pos,V3.scl(e2.pos,s.scale));
            var v2=V3.c((rng()-0.5)*2,(rng()-0.5)*2,-(12+rng()*8)*power);
            FX.spawn({pos:p2,vel:v2,size:2.2+s.scale,type:2,
              color:rng()<0.3?[0.4,0.8,1.0]:[1.0,0.55,0.18],life:0.6+rng()*0.4,drag:1.5,stretch:v2});
          }
        }
      }
      // shuttle engines
      for(var sh of shuttles){
        if(rng()<0.5){
          var back=V3.rotY(V3.c(0,0,-13),sh.rot[1]);
          var p3=V3.add(sh.pos,back);
          var vel=V3.scl(V3.norm(back),9+rng()*4);
          FX.spawn({pos:p3,vel:vel,size:1.4,type:2,
            color:[0.5,0.8,1.0],life:0.4,drag:2,stretch:vel});
        }
      }
    }
  }

  function setEngineAccel(v){engineAccel=clamp01(v);}
  function setSpread(v){spread=clamp01(v);}
  function setShieldLevel(v){shieldLevel=clamp01(v);}
  function getEngineAccel(){return engineAccel;}
  function getSpread(){return spread;}
  function getShieldLevel(){return shieldLevel;}

  function reset(){
    ships=[];shuttles=[];missiles=[];chips=[];asteroids=[];
    flagship=null;guardProto=null;vanguardProto=null;shuttleProto=null;missileProto=null;
    engineAccel=0;spread=0;shieldLevel=0;
  }

  return {build,update,reset,
    get ships(){return ships;},get shuttles(){return shuttles;},
    get asteroids(){return asteroids;},get chips(){return chips;},
    get missiles(){return missiles;},get flagship(){return flagship;},
    get guardProto(){return guardProto;},get vanguardProto(){return vanguardProto;},
    get shuttleProto(){return shuttleProto;},
    launchMissile,setEngineAccel,setSpread,setShieldLevel,
    getEngineAccel,getSpread,getShieldLevel,
    addChip:function(c){chips.push(c);}};
})();
