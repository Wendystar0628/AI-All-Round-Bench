/* director: 76s loop timeline, camera shots, battle events, shields, lights */
var Director=(function(){
  var LOOP=76;
  var t=0, prevT=-1;
  var shots=[];
  var cam={pos:V3.c(),target:V3.c(),up:V3.c(0,1,0),fov:55*Math.PI/180,shake:0,shakeV:0};
  var eventRng=RNG(7777);
  var lights=[];
  var beams=[];
  var events=[];
  var firedSet={};

  function setup(){
    defineShots();
    buildEvents();
    spawnAmbientDebris();
  }

  function defineShots(){
    shots=[
      {t0:0,t1:7, fov:62,
        pos:[V3.c(-120,-30,560),V3.c(60,20,500),V3.c(180,60,380),V3.c(120,30,260)],
        look:[V3.c(0,10,200),V3.c(0,20,100),V3.c(0,0,0),V3.c(0,10,-60)]},
      {t0:7,t1:15, fov:58,
        pos:[V3.c(170,50,600),V3.c(150,90,540),V3.c(-120,30,470),V3.c(-230,-30,320),V3.c(-250,-50,150)],
        look:[V3.c(0,20,460),V3.c(0,10,400),V3.c(0,20,300),V3.c(0,0,180),V3.c(0,10,40)]},
      {t0:15,t1:22, fov:70,
        pos:[V3.c(-70,-50,-620),V3.c(50,-80,-640),V3.c(110,-40,-600),V3.c(40,-20,-575)],
        look:[V3.c(0,0,-545),V3.c(0,8,-535),V3.c(0,0,-470),V3.c(0,10,-380)]},
      {t0:22,t1:28, fov:66,
        pos:[V3.c(-420,20,-60),V3.c(-300,10,-30),V3.c(-180,0,0),V3.c(-120,-2,2)],
        look:[V3.c(-120,0,-10),V3.c(-60,0,-4),V3.c(20,0,4),V3.c(160,0,0)]},
      {t0:28,t1:33, fov:70, interior:'hangar',
        pos:[V3.c(170,6,6),V3.c(60,2,-4),V3.c(-80,-4,2),V3.c(-160,0,0)],
        look:[V3.c(20,0,0),V3.c(-60,0,0),V3.c(-170,0,0),V3.c(-200,0,0)]},
      {t0:33,t1:39, fov:62, interior:'bridge',
        pos:[V3.c(50,6,58),V3.c(30,-2,30),V3.c(-30,8,-6),V3.c(20,14,-40)],
        look:[V3.c(0,0,10),V3.c(0,4,-10),V3.c(0,2,-40),V3.c(0,0,-66)]},
      {t0:39,t1:46, fov:68, interior:'core',
        pos:[V3.c(95,-85,45),V3.c(45,-35,28),V3.c(-45,40,-30),V3.c(70,85,-45)],
        look:[V3.c(0,0,0),V3.c(0,10,0),V3.c(0,0,0),V3.c(0,-10,0)]},
      {t0:46,t1:51, fov:72, interior:'corridor',
        pos:[V3.c(10,6,180),V3.c(-6,2,80),V3.c(8,-2,-40),V3.c(-4,4,-160)],
        look:[V3.c(0,0,40),V3.c(0,0,-40),V3.c(0,0,-120),V3.c(0,0,-200)]},
      {t0:51,t1:57, fov:66,
        pos:[V3.c(-200,90,320),V3.c(-80,50,380),V3.c(60,70,440),V3.c(20,30,490)],
        look:[V3.c(260,20,640),V3.c(360,20,700),V3.c(440,20,740),V3.c(470,30,760)]},
      {t0:57,t1:63, fov:60,
        pos:[V3.c(-160,70,450),V3.c(-110,45,485),V3.c(-40,25,515),V3.c(10,50,555)],
        look:[V3.c(300,30,600),V3.c(370,30,650),V3.c(410,35,670),V3.c(440,40,700)]},
      {t0:63,t1:69, fov:66,
        pos:[V3.c(180,-30,380),V3.c(80,30,440),V3.c(-100,70,500),V3.c(-30,20,540)],
        look:[V3.c(420,10,720),V3.c(470,20,770),V3.c(520,10,800),V3.c(480,10,760)]},
      {t0:69,t1:76, fov:68,
        pos:[V3.c(140,40,560),V3.c(-60,80,520),V3.c(-140,-20,500),V3.c(-120,-30,560)],
        look:[V3.c(0,20,200),V3.c(0,0,100),V3.c(0,20,0),V3.c(0,10,200)]}
    ];
  }

  var IOFF={
    hangar:V3.c(0,-2200,0),
    bridge:V3.c(-3200,0,0),
    core:V3.c(3200,0,0),
    corridor:V3.c(0,2200,0)
  };
  function interiorOffset(k){return IOFF[k];}

  function curShot(time){
    for(var i=0;i<shots.length;i++)if(time>=shots[i].t0&&time<shots[i].t1)return shots[i];
    return shots[shots.length-1];
  }

  function segPath(points,u){
    // piecewise cubic Catmull-Rom, parameterized by segment index (monotonic, no overshoot past endpoints)
    var n=points.length, f=u*(n-1), i=Math.min(n-2,Math.floor(f)), k=f-i;
    var p0=points[Math.max(0,i-1)],p1=points[i],p2=points[Math.min(n-1,i+1)],p3=points[Math.min(n-1,i+2)];
    function h(a,b,c,d){
      return 0.5*((2*b[0])+(-a[0]+c[0])*k+(2*a[0]-5*b[0]+4*c[0]-d[0])*k*k+(-a[0]+3*b[0]-3*c[0]+d[0])*k*k*k);
    }
    return V3.c(h(p0,p1,p2,p3), (function(){
      return 0.5*((2*p1[1])+(-p0[1]+p2[1])*k+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*k*k+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*k*k*k);
    })(), (function(){
      return 0.5*((2*p1[2])+(-p0[2]+p2[2])*k+(2*p0[2]-5*p1[2]+4*p2[2]-p3[2])*k*k+(-p0[2]+3*p1[2]-3*p2[2]+p3[2])*k*k*k);
    })());
  }
  function updateCamera(time,dt){
    var s=curShot(time),u=clamp01((time-s.t0)/(s.t1-s.t0));
    var pos=segPath(s.pos,u),look=segPath(s.look,u);
    var fov=(s.fov||55)*Math.PI/180;
    cam.shakeV*=Math.exp(-3*dt);
    var sh=cam.shakeV;
    pos=V3.add(pos,V3.c((eventRng()-0.5)*sh,(eventRng()-0.5)*sh,(eventRng()-0.5)*sh));
    if(s.interior){
      var off=IOFF[s.interior];
      pos=V3.add(pos,off);look=V3.add(look,off);
    }
    cam.pos=pos;cam.target=look;cam.fov=fov;cam.up=V3.c(0,1,0);
    return cam;
  }

  /* ---------------- events ---------------- */
  function buildEvents(){
    events.length=0;
    function E(tm,fn){events.push({tm:tm,fn:fn});}
    // main beam
    E(58.7,function(){hitAsteroid(0,'beam');});
    E(60.9,function(){hitAsteroid(1,'beam');});
    // pulse volleys
    for(var w=0;w<14;w++)E(60.4+w*0.45,(function(wv){return function(){firePulseVolley(wv);};})(w));
    // impacts pulse
    E(61.6,function(){hitAsteroid(5,'pulse');});
    E(63.2,function(){hitAsteroid(6,'pulse');});
    E(64.6,function(){hitAsteroid(8,'pulse');});
    E(66.0,function(){hitAsteroid(11,'pulse');});
    // guard bursts
    for(var g=0;g<24;g++)E(62+g*0.25,function(){fireGuardBurst();});
    E(63.6,function(){hitAsteroid(10,'guard');});
    E(65.2,function(){hitAsteroid(14,'guard');});
    E(67.0,function(){hitAsteroid(17,'guard');});
    // missiles waves
    for(var m=0;m<10;m++)E(60.6+m*0.34,function(){fireMissileWave();});
    E(64.2,function(){hitAsteroid(2,'missile');});
    E(66.4,function(){hitAsteroid(7,'missile');});
    E(67.6,function(){hitAsteroid(13,'missile');});
    events.sort(function(a,b){return a.tm-b.tm;});
  }

  function processEvents(from,to){
    for(var e of events){
      if(e.tm>from&&e.tm<=to&&!firedSet[e.tm+'_'+events.indexOf(e)]){
        firedSet[e.tm+'_'+events.indexOf(e)]=true;
        e.fn();
      }
    }
  }
  function prefireEvents(time){
    // mark all events <= time as already fired (without executing) for seeks
    for(var i=0;i<events.length;i++)if(events[i].tm<=time)firedSet[events[i].tm+'_'+i]=true;
  }

  function flagMuzzle(){
    var m=World.flagship.def.loc.beam.muzzle;
    return V3.add(World.flagship.pos,V3.c(m[0],m[1]+Math.sin(t*0.2)*3,m[2]));
  }

  function firePulseVolley(wave){
    var turrets=World.flagship.def.loc.pulseTurrets;
    var targets=World.asteroids;
    wave=wave||(Math.floor((t-60.4)*2.2));
    var k=0;
    if(!isFinite(wave)||wave<0)wave=0;
    for(var i=wave%2;i<turrets.length;i+=2){
      if(k>5)break;
      if(!turrets[i])continue;
      var tp=turrets[i].pos;
      var wp=V3.add(World.flagship.pos,V3.c(tp[0],tp[1]+Math.sin(t*0.2)*3,tp[2]));
      var ast=targets[(i*2+wave)%targets.length];
      var aim=ast?Asteroids.worldOrigin(ast):V3.c(500,0,800);
      for(var b=0;b<3;b++){
        var dir=V3.norm(V3.sub(aim,wp));
        var vel=V3.scl(dir,260+b*8);
        FX.spawn({pos:V3.add(wp,V3.scl(dir,10+b*6)),vel:vel,size:2.4+b*0.3,type:1,
          color:b===1?[0.8,1,1]:[0.3,0.9,1.0],life:2.2,drag:0,stretch:vel});
      }
      FX.flash(wp,[0.4,0.9,1],6,0.25);
      k++;
    }
  }

  function fireGuardBurst(){
    var guards=World.ships.filter(function(s){return s.kind==='guard'||s.kind==='guardClose';});
    for(var gi=0;gi<guards.length;gi++){
      if(eventRng()<0.55)continue;
      var g=guards[gi];
      if(!g.proto.pd)continue;
      for(var pdi=0;pdi<g.proto.pd.length;pdi++){
        if(eventRng()<0.6)continue;
        var pd=g.proto.pd[pdi];
        var wp=V3.add(g.pos,V3.scl(pd,g.scale));
        var aim=V3.c(300+eventRng()*400,(eventRng()-0.5)*300,620+eventRng()*360);
        var dir=V3.norm(V3.sub(aim,wp));
        for(var b=0;b<3;b++){
          var vel=V3.scl(dir,360+b*20);
          FX.spawn({pos:V3.add(wp,V3.scl(dir,4+b*5)),vel:vel,size:1.8,type:5,
            color:[1.0,0.88,0.52],life:1.2,drag:0,stretch:vel});
        }
        FX.flash(wp,[1,0.9,0.6],4,0.14);
      }
    }
  }

  var missileCounter=0;
  function fireMissileWave(){
    var vans=World.ships.filter(function(s){return s.kind==='vanguard';});
    var count=0;
    var wave=missileCounter++;
    for(var i=wave%2;i<vans.length;i+=2){
      if(count>=3)break;
      var v=vans[i];
      var cells=v.proto.missileCells;
      var cell=cells[(wave*3+count)%cells.length];
      var wp=V3.add(v.pos,V3.scl(cell,v.scale));
      var ast=World.asteroids[2+(wave+count)%5];
      var aim=ast?Asteroids.worldOrigin(ast):V3.c(400,0,800);
      World.launchMissile(wp,aim);
      FX.flash(wp,[1,0.6,0.25],6,0.3);
      count++;
    }
  }

  function hitAsteroid(idx,weapon){
    var ast=World.asteroids[idx];
    var atPos=ast?Asteroids.worldOrigin(ast):V3.c(450,0,750);
    if(!ast||ast.cracked){impactFX(atPos,weapon);return;}
    var pieces=Asteroids.fracture(ast,atPos,weapon,eventRng);
    for(var p of pieces){
      var n=weapon==='beam'?10:(weapon==='missile'?9:5);
      var chips=Asteroids.spawnChips(p.pos,n,eventRng,weapon==='guard'?10:18);
      for(var c of chips)World.chips.push(c);
    }
    impactFX(atPos,weapon);
    cam.shakeV=Math.max(cam.shakeV,weapon==='missile'?1.6:(weapon==='beam'?1.2:0.5));
    addLight(atPos,weapon==='guard'?[1,0.8,0.4]:(weapon==='missile'?[1,0.6,0.3]:[0.4,0.9,1]),
      weapon==='missile'?700:450,300,0.6);
  }

  function impactFX(pos,weapon){
    var col=weapon==='guard'?[1,0.85,0.5]:(weapon==='missile'?[1,0.6,0.3]:[0.45,0.9,1]);
    var n=weapon==='beam'?26:(weapon==='missile'?22:12);
    for(var i=0;i<n;i++){
      var dir=V3.norm(V3.c(eventRng()-0.5,eventRng()-0.5,eventRng()-0.5));
      var sp=(weapon==='guard'?30:60)+eventRng()*60;
      FX.spawn({pos:V3.copy(pos),vel:V3.scl(dir,sp),size:1.5+eventRng()*2.5,type:1,
        color:col,life:0.5+eventRng()*0.5,drag:2,grow:2});
    }
    for(var i=0;i<n*0.8;i++){
      var dir=V3.norm(V3.c(eventRng()-0.5,eventRng()-0.5,eventRng()-0.5));
      FX.spawn({pos:V3.copy(pos),vel:V3.scl(dir,10+eventRng()*20),size:5+eventRng()*8,type:4,
        color:[0.45,0.42,0.4],life:1.2+eventRng(),drag:1,grow:14});
    }
    FX.flash(pos,col,weapon==='guard'?10:22,weapon==='guard'?0.3:0.6);
  }

  /* ---------------- lights ---------------- */
  function addLight(pos,color,intensity,range,life){
    lights.push({pos:V3.copy(pos),color:color,intensity:intensity,range:range,life:life,age:0});
  }
  function updateLights(dt){
    for(var i=lights.length-1;i>=0;i--){
      var L=lights[i];
      if(L===beamLight||L.persist)continue; // managed separately
      L.age+=dt;L.intensity*=Math.exp(-2.2*dt);
      if(L.age>L.life)lights.splice(i,1);
    }
  }
  function currentLights(){return lights;}

  /* ---------------- ambient + boost FX ---------------- */
  function spawnAmbientDebris(){
    var rng=RNG(313);
    for(var i=0;i<240;i++){
      var p=V3.c((rng()-0.5)*2600,(rng()-0.5)*1400,-800+rng()*1800);
      FX.spawn({pos:p,vel:V3.c((rng()-0.5)*4,(rng()-0.5)*2,-6-rng()*10),
        size:0.6+rng()*2.2,type:rng()<0.3?3:0,
        color:rng()<0.3?[0.5,0.7,0.9]:[0.6,0.6,0.7],alpha:0.5,life:99999,drag:0,fade:false});
    }
    for(var i=0;i<110;i++){
      var p=V3.c((rng()-0.5)*1400,(rng()-0.5)*700,-200+rng()*900);
      FX.spawn({pos:p,vel:V3.c(0,0,-4-rng()*6),size:0.4+rng()*0.8,type:3,
        color:[0.7,0.8,1],alpha:0.35,life:99999,drag:0,fade:false});
    }
  }
  var streakTimer=0;
  function updateBoostFX(dt){
    var a=World.getEngineAccel();
    streakTimer-=dt;
    if(a>0.35&&streakTimer<=0){
      streakTimer=0.04;
      var p=V3.add(cam.pos,V3.c((eventRng()-0.5)*300,(eventRng()-0.5)*200,40));
      FX.spawn({pos:p,vel:V3.c((eventRng()-0.5)*20,(eventRng()-0.5)*20,-(200+a*300)),
        size:1.2,type:5,color:[0.5,0.8,1],life:0.7,drag:0,stretch:[0,0,-1]});
    }
  }

  /* ---------------- interior device FX ---------------- */
  var corrTimer=0, coreTimer=0, bridgeTimer=0, hangTimer=0;
  function updateInteriorFX(time,dt){
    var s=curShot(time);
    if(s.interior!=='corridor')corrTimer=0;
    if(s.interior!=='core')coreTimer=0;
    if(s.interior!=='bridge')bridgeTimer=0;
    if(s.interior!=='hangar')hangTimer=0;
    if(s.interior==='corridor'){
      corrTimer-=dt;
      if(corrTimer<=0){
        corrTimer+=0.55;
        var off=IOFF.corridor;
        for(var side=-1;side<=1;side+=2){
          var p=V3.add(off,V3.c(side*28,-20,180));
          FX.spawn({pos:p,vel:V3.c(0,0,-90),size:3,type:0,color:[0.4,0.9,1],life:4,drag:0,fade:true});
        }
      }
    }
    if(s.interior==='core'){
      coreTimer-=dt;
      if(coreTimer<=0){
        coreTimer+=0.05;
        var a=eventRng()*Math.PI*2,y=(eventRng()-0.5)*140;
        var p=V3.add(IOFF.core,V3.c(Math.cos(a)*16,y,Math.sin(a)*16));
        FX.spawn({pos:p,vel:V3.c(0,12+eventRng()*20,0),size:1.6,type:0,color:[0.4,0.9,1],life:1.6,drag:1});
      }
    }
    if(s.interior==='bridge'){
      bridgeTimer-=dt;
      if(bridgeTimer<=0){
        bridgeTimer+=0.04;
        var p=V3.add(IOFF.bridge,V3.c((eventRng()-0.5)*40,-2+(eventRng()-0.5)*10,20+(eventRng()-0.5)*40));
        FX.spawn({pos:p,vel:V3.c((eventRng()-0.5)*6,0,(eventRng()-0.5)*6),size:1.2,type:0,color:[0.4,0.9,1],life:1.2,drag:2});
      }
    }
    if(s.interior==='hangar'){
      hangTimer-=dt;
      if(hangTimer<=0){
        hangTimer+=0.08;
        var p=V3.add(IOFF.hangar,V3.c(-160+eventRng()*320,(eventRng()-0.5)*40,(eventRng()-0.5)*60));
        FX.spawn({pos:p,vel:V3.c(10+eventRng()*15,0,(eventRng()-0.5)*4),size:1.4,type:0,
          color:[0.5,0.8,1],life:2.5,drag:0.5});
      }
    }
  }

  /* ---------------- shields & beams ---------------- */
  function shieldEnvelope(time,delay){
    // expand after 68.6, stabilize, then thin across the loop seam into the next cycle
    var t0=68.6+delay;
    if(time>=t0){
      var expand=smoothstep(t0,t0+3,time);
      // full through 76 (==0), fading over first 7s of next loop
      var fade=1-smoothstep(0,7,fmod(time,LOOP))*0.75;
      return {expand:expand,level:expand*fade};
    }
    // first 7s of the loop still carry thinning shield remnant from prior cycle
    if(time<7){
      var fade=1-smoothstep(0,7,time)*0.75;
      return {expand:1,level:fade};
    }
    return {expand:1,level:0};
  }
  function renderShields(time){
    var env=shieldEnvelope(time,0);
    drawShipShield(World.flagship.pos,[320,140,300],[0.35,0.85,1.0],env.level,0,time,env.expand);
    var ships=World.ships;
    for(var i=0;i<ships.length;i++){
      var s=ships[i];
      var delay=0.2+(i%10)*0.12;
      var e2=shieldEnvelope(time,delay);
      var dims=s.kind==='vanguard'?[72,26,76]:[58,32,60];
      drawShipShield(s.pos,dims,[0.35,0.8,1.0],e2.level,delay,time,e2.expand);
    }
  }
  function drawShipShield(pos,dims,color,level,delay,time,expand){
    if(level<=0.002)return;
    var sc=lerp(0.72,1.04,expand);
    var m=Mat4.trs(pos,[0,0,0],[dims[0]*sc,dims[1]*sc,dims[2]*sc]);
    FX.drawShield(m,color,level*(0.5+0.35*(1-expand)),time,expand);
  }

  var beamPartAcc=0, beamRingAcc=0, beamMuzzleAcc=0, chargeAcc=0, beamImpactAcc=0;
  var beamLight=null;
  function sustainedLight(pos,color,intensity,range){
    if(!beamLight){beamLight={pos:V3.copy(pos),color:color,intensity:intensity,range:range,life:999,age:0};lights.push(beamLight);}
    beamLight.pos=V3.copy(pos);beamLight.intensity=intensity;beamLight.range=range;beamLight.age=0;
  }
  function updateBeam(time,dt){
    var beamInt=0;
    if(time>56.3&&time<62.6){
      if(time<58)beamInt=smoothstep(56.3,58,time)*0.3;
      else if(time<61.6)beamInt=smoothstep(58,58.5,time)*(1-0.15*smoothstep(61.2,61.6,time));
      else beamInt=(1-smoothstep(61.6,62.6,time))*0.8;
    }
    beams.length=0;
    var p0=flagMuzzle();
    // charge buildup at muzzle
    if(time>55.6&&time<58){
      var ch=smoothstep(55.6,58,time);
      chargeAcc+=dt;
      while(chargeAcc>0.07){
        chargeAcc-=0.07;
        FX.flash(p0,[0.5,0.9,1],6+ch*16,0.12);
        FX.spawn({pos:V3.add(p0,V3.c((eventRng()-0.5)*8,(eventRng()-0.5)*8,(eventRng()-0.5)*8)),
          vel:V3.c(0,0,0),size:3+ch*5,type:0,color:[0.5,0.9,1],life:0.3,drag:2,grow:6});
      }
    }
    if(beamInt>0.02){
      var tAst=World.asteroids[0];
      var target=tAst?Asteroids.worldOrigin(tAst):V3.c(420,40,700);
      beams.push({p0:p0,p1:target,intensity:beamInt,color:[0.45,0.9,1.0]});
      // sustained impact glow + light while beam presses the rock
      beamImpactAcc+=dt;
      while(beamImpactAcc>0.04){
        beamImpactAcc-=0.04;
        FX.flash(target,[0.5,0.9,1],16+eventRng()*8,0.18);
        FX.spawn({pos:V3.add(target,V3.c((eventRng()-0.5)*30,(eventRng()-0.5)*30,(eventRng()-0.5)*30)),
          vel:V3.c((eventRng()-0.5)*40,(eventRng()-0.5)*40,(eventRng()-0.5)*40),
          size:3+eventRng()*4,type:1,color:[0.5,0.9,1],life:0.5,drag:2,grow:3});
      }
      sustainedLight(target,[0.45,0.85,1.0],500*beamInt,200);
      beamPartAcc+=dt;
      while(beamPartAcc>0.03){
        beamPartAcc-=0.03;
        FX.spawn({pos:V3.lerp(p0,target,eventRng()),
          vel:V3.c((eventRng()-0.5)*10,(eventRng()-0.5)*10,(eventRng()-0.5)*10),
          size:2+eventRng()*4,type:0,color:[0.5,0.9,1],life:0.4,drag:4,grow:10});
      }
      // traveling rings: emit at muzzle, particles carry them forward
      beamRingAcc+=dt*1.4;
      var ringCount=0;
      while(beamRingAcc>=1){
        beamRingAcc-=1;ringCount++;
        var dir=V3.norm(V3.sub(target,p0));
        FX.spawn({pos:V3.add(p0,V3.scl(dir,6)),vel:V3.scl(dir,520),size:8,type:0,
          color:[0.6,0.95,1],life:1.1,drag:0,grow:18,fade:true});
      }
      beamMuzzleAcc+=dt;
      while(beamMuzzleAcc>0.1){
        beamMuzzleAcc-=0.1;
        FX.flash(p0,[0.6,0.95,1],14,0.1);
      }
    } else {
      beamPartAcc=0;beamRingAcc=0;beamMuzzleAcc=0;chargeAcc=0;beamImpactAcc=0;
      if(beamLight){var bi=lights.indexOf(beamLight);if(bi>=0)lights.splice(bi,1);beamLight=null;}
    }
  }
  function renderBeams(){
    for(var b of beams){
      FX.drawCylinder(b.p0,b.p1,16,11,b.color,b.intensity*0.55,t);
      FX.drawCylinder(b.p0,b.p1,8,5,b.color,b.intensity,t);
      FX.drawCylinder(b.p0,b.p1,3.5,2,[0.95,1,1],b.intensity*1.5,t);
    }
  }

  var engineLights=[];
  var ENGINE_CFG=[[0,0,-572,260,300],[34,8,-572,150,220],[-34,8,-572,150,220],[0,-22,-572,150,220]];
  function updateEngineLights(){
    if(engineLights.length===0){
      for(var ci=0;ci<ENGINE_CFG.length;ci++){
        var c=ENGINE_CFG[ci];
        engineLights.push({pos:V3.c(c[0],c[1],c[2]),color:[1.0,0.6,0.28],intensity:c[3],range:c[4],life:9999,age:0,persist:true});
      }
    }
    var boost=0.6+World.getEngineAccel()*1.2;
    var bob=World.flagship?World.flagship.pos[1]:0;
    for(var i=0;i<engineLights.length;i++){
      var L=engineLights[i];
      L.pos[1]=ENGINE_CFG[i][1]+bob;
      L.intensity=ENGINE_CFG[i][3]*boost;
      if(lights.indexOf(L)<0)lights.push(L);
    }
  }

  /* ---------------- main update ---------------- */
  function update(time,dt){
    var nt=fmod(time,LOOP);
    // detect wrap
    var from=prevT<0?nt:prevT;
    if(nt>=from)processEvents(from,nt);
    t=nt;prevT=nt;
    World.setSpread(smoothstep(50,54,t));
    World.setEngineAccel(smoothstep(70,74,t)*0.9+0.12*smoothstep(0,3,t));
    updateBeam(t,dt);
    updateEngineLights();
    updateLights(dt);
    updateBoostFX(dt);
    updateInteriorFX(t,dt);
    return updateCamera(t,dt);
  }

  function seek(time){
    t=fmod(time,LOOP);
    firedSet={};
    prefireEvents(t);
    prevT=t;
    World.setSpread(smoothstep(50,54,t));
    World.setEngineAccel(smoothstep(70,74,t)*0.9+0.12*smoothstep(0,3,t));
    updateBeam(t,0.016);
    updateEngineLights();
    return updateCamera(t,0.016);
  }
  // deterministic export step: call in strict frame order
  function step(time,dt){
    var nt=fmod(time,LOOP);
    var from=prevT<0?nt:prevT;
    if(nt>=from)processEvents(from,nt);
    else { // loop wrap (shouldn't happen within 0..LOOP except final)
      processEvents(from,LOOP);
    }
    t=nt;prevT=nt;
    World.setSpread(smoothstep(50,54,t));
    World.setEngineAccel(smoothstep(70,74,t)*0.9+0.12*smoothstep(0,3,t));
    updateBeam(t,dt);
    updateEngineLights();
    updateLights(dt);
    updateBoostFX(dt);
    updateInteriorFX(t,dt);
    return updateCamera(t,dt);
  }
  function resetForExport(){
    firedSet={};prevT=-1;beams.length=0;lights.length=0;engineLights.length=0;missileCounter=0;
  }

  return {LOOP,setup,update,seek,step,resetForExport,currentLights,renderShields,renderBeams,
    interiorOffset,IOFF,curShot,
    get cam(){return cam;},get t(){return t;},get beams(){return beams;}};
})();
