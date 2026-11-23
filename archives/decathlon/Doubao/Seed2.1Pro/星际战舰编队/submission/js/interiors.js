/* four interior spaces, each built as its own voxel mesh placed far from the fleet */
var Interiors=(function(){
  var P=R.PAL;

  function box(C,x0,y0,z0,x1,y1,z1,color,o){
    for(var x=x0;x<=x1;x+=2)for(var y=y0;y<=y1;y+=2)for(var z=z0;z<=z1;z+=2)
      C.add(x,y,z,color,o||{scale:0.96});
  }
  // hollow shell room: floor,ceiling,side walls with thickness
  function shell(C,cx,cy,cz,hw,hh,hd,th,wallCol,floorCol){
    function block(x0,y0,z0,x1,y1,z1,col,o){box(C,x0,y0,z0,x1,y1,z1,col,o);}
    block(cx-hw,cy-hh,cz-hd,cx+hw,cy-hh+th,cz+hd,floorCol,{scale:0.96});
    block(cx-hw,cy+hh-th,cz-hd,cx+hw,cy+hh,cz+hd,wallCol,{scale:0.96});
    block(cx-hw,cy-hh,cz-hd,cx-hw+th,cy+hh,cz+hd,wallCol,{scale:0.96});
    block(cx+hw-th,cy-hh,cz-hd,cx+hw,cy+hh,cz+hd,wallCol,{scale:0.96});
    block(cx-hw,cy-hh,cz-hd,cx+hw,cy+hh,cz-hd+th,wallCol,{scale:0.96});
    block(cx-hw,cy-hh,cz+hd-th,cx+hw,cy+hh,cz+hd,wallCol,{scale:0.96});
  }

  function glowStrip(C,x0,y,z0,x1,z1,color,intensity){
    for(var x=x0;x<=x1;x+=6)C.add(x,y,z0,color,{scale:0.7,mat:1,glow:color,emis:intensity});
    for(var z=z0;z<=z1;z+=6)C.add(x0,y,z,color,{scale:0.7,mat:1,glow:color,emis:intensity});
  }

  /* ---------- 1 bridge hall: 130 x 60 x 130 ---------- */
  function buildBridge(){
    var C=new R.Collector();
    var W=66,H=30,D=66, T=4;
    shell(C,0,0,0,W,H,D,T,P.hull2,P.interiorFloor);
    // open the front wall (z = -D) into a giant view window: remove by overlaying dark, add frame + glass
    for(var x=-W+T;x<=W-T;x+=4){
      for(var y=-H+T;y<=H-T;y+=4){
        // glass curtain wall
        if(x%20<16 && y%16<12){
          C.add(x,y,-D+1,P.glass,{scale:0.98,mat:3,glow:P.accent,emis:0.35});
        } else {
          C.add(x,y,-D+2,P.trim,{scale:0.98,mat:1});
        }
      }
    }
    // overhead cross beams
    for(var z=-D+10;z<=D-6;z+=22){
      box(C,-W+T,H-6,z-2,W-T,H-2,z+2,P.trim,{scale:0.95,mat:1});
      for(var x=-W+8;x<=W-8;x+=12)
        C.add(x,H-8,z,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:0.8});
    }
    // floor light guides toward window
    for(var x=-40;x<=40;x+=10){
      for(var z=-D+8;z<=D-8;z+=8)
        C.add(x,-H+T+2,z,P.accentDim,{scale:0.6,mat:2,glow:P.accent,emis:0.3});
    }
    // central command hub: stacked base + holo display
    var bz=18;
    box(C,-22,-H+T,bz-18,22,-H+T+8,bz+18,P.hull,{scale:0.96});
    box(C,-16,-H+T+8,bz-14,16,-H+T+14,bz+14,P.trim,{scale:0.94,mat:1});
    box(C,-10,-H+T+14,bz-10,10,-H+T+18,bz+10,P.dark,{scale:0.94,mat:2});
    // holographic fleet display: voxels of cyan light (fleet shapes)
    var hy=-H+T+26;
    var rng=RNG(7);
    for(var i=0;i<120;i++){
      var a=i/120*Math.PI*2+ (i%3)*0.2;
      var rr=6+(i%9)*1.6;
      var hx=Math.cos(a)*rr, hz=bz+Math.sin(a)*rr*0.7;
      C.add(hx,hy+Math.sin(i*1.7)*3,hz,P.accent,{scale:0.5,mat:1,glow:P.accent,emis:1.6});
    }
    // central flagship marker
    box(C,-2,hy+1,bz-2,2,hy+5,bz+2,P.white,{scale:0.6,mat:1,glow:P.white,emis:1.8});
    // route lines
    for(var i=0;i<60;i++){
      var t=i/60;
      C.add(-30+t*60,hy+Math.sin(t*6)*2,bz-20+Math.cos(t*8)*10,P.accent,
        {scale:0.4,mat:1,glow:P.accent,emis:1.2});
    }
    // side console rows on platforms at different heights
    for(var side=-1;side<=1;side+=2){
      for(var lvl=0;lvl<3;lvl++){
        var py=-H+T+10+lvl*12, pz=-10+lvl*14, px=side*(W-18-lvl*6);
        box(C,px-14,py-2,pz-22,px+14,py+2,pz+22,P.hull2,{scale:0.94});
        // glowing console tops
        for(var z=pz-20;z<=pz+20;z+=6){
          C.add(px-side*2,py+3,z,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:0.9});
          C.add(px+side*8,py+3,z+2,P.accent,{scale:0.5,mat:1,glow:P.accent,emis:0.7});
        }
        // support pillars
        box(C,px-12,-H+T,pz-4,px-8,py,pz+4,P.trim,{scale:0.9,mat:1});
        box(C,px+8,-H+T,pz-4,px+12,py,pz+4,P.trim,{scale:0.9,mat:1});
        // hanging display boards
        box(C,px-10,H-12,pz-12,px+10,H-9,pz+12,P.dark,{scale:0.9,mat:2});
        for(var gx=0;gx<4;gx++)C.add(px-8+gx*5,H-10,pz+8,P.accent,
          {scale:0.5,mat:1,glow:P.accent,emis:0.8});
      }
    }
    // foreground equipment near camera entrance (z=+D side)
    box(C,-30,-H+T,D-14,-10,-H+T+12,D-4,P.hull,{scale:0.96});
    box(C,10,-H+T,D-12,30,-H+T+10,D-4,P.hull2,{scale:0.96});
    // far opening depth glow
    for(var x=-30;x<=30;x+=8)C.add(x,0,-D+4,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:0.6});

    // distant voxel fleet silhouettes visible through the view window (outside)
    var rng2=RNG(21);
    for(var fi=0;fi<26;fi++){
      var fz=-D-60-(fi%6)*46-rng2()*10;
      var fx=(rng2()-0.5)*220+(fi%3-1)*30;
      var fy=(rng2()-0.5)*90+(fi%4)*8-10;
      var fl=8+(fi%3)*5, fh=2+(fi%2);
      for(var sz2=0;sz2<fl;sz2+=2){
        var taper=1-Math.abs(sz2-fl/2)/(fl/2);
        for(var sy=-fh;sy<=fh;sy+=2){
          if(Math.abs(sy)>fh*taper+1)continue;
          var col=(sy===fh&&sz2%4===0)?P.trim:(rng2()<0.12?P.accentDim:P.hull2);
          var oo={scale:1.8};
          if(col===P.accentDim){oo.glow=P.accent;oo.emis=0.5;oo.mat=1;}
          C.add(fx+ (rng2()-0.5)*2, fy+sy, fz-sz2, col,oo);
        }
      }
      // engine glow
      C.add(fx,fy,fz+3,P.accent2,{scale:1.6,mat:1,glow:P.accent2,emis:1.4});
    }
    // a large nearby escort sliding past the window (scale via a few plates)
    for(var k=0;k<14;k++){
      C.add(-110+k*4, 26+Math.sin(k*0.5)*4, -D-40-Math.cos(k*0.4)*8,
        k%4===0?P.trim:P.hull,{scale:3.2,mat:k%4===0?1:0});
    }

    var mesh=R.makeMesh(C);
    return {mesh:mesh,
      bounds:{x:W,y:H,z:D},
      holoCenter:[0,-H+T+30,bz],
      windowCenter:[0,0,-D]};
  }

  /* ---------- 2 power core atrium: 250 wide x 250 high ---------- */
  function buildCore(){
    var C=new R.Collector();
    var W=125,H=125,D=90,T=6;
    shell(C,0,0,0,W,H,D,T,P.hull2,P.interiorDark);
    // remove far/near walls partially? keep; add ring platforms 5 levels
    var levels=[-90,-50,-10,30,70];
    for(var li=0;li<levels.length;li++){
      var y=levels[li],rin=26+(li%2)*6,rout=70-(li%3)*8;
      for(var a=0;a<Math.PI*2;a+=Math.PI/36){
        for(var r=rin;r<=rout;r+=6){
          var x=Math.round(Math.cos(a)*r),z=Math.round(Math.sin(a)*r*0.72);
          C.add(x,y,z,(r%18<6)?P.trim:P.hull,{scale:0.94,mat:r%18<6?1:0});
        }
      }
      // glowing rim
      for(var a=0;a<Math.PI*2;a+=Math.PI/24){
        var x=Math.round(Math.cos(a)*rin),z=Math.round(Math.sin(a)*rin*0.72);
        C.add(x,y+2,z,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:1.0});
      }
      // forks extending toward walls
      for(var k=0;k<4;k++){
        var ang=k*Math.PI/2+li*0.4;
        for(var r=rout;r<W-T;r+=6){
          C.add(Math.round(Math.cos(ang)*r),y,Math.round(Math.sin(ang)*r*0.72),
            P.trim,{scale:0.85,mat:r%18<6?1:0});
        }
      }
    }
    // heavy supports from walls to core
    for(var k=0;k<6;k++){
      var ang=k/6*Math.PI*2+0.2;
      for(var r=20;r<W-T;r+=8){
        var x=Math.round(Math.cos(ang)*r),z=Math.round(Math.sin(ang)*r*0.72);
        for(var y=-30;y<=30;y+=12)
          C.add(x,y,z,P.hull2,{scale:0.92});
      }
    }
    // core outer voxel frame (cage)
    for(var a=0;a<Math.PI*2;a+=Math.PI/10){
      for(var y=-80;y<=80;y+=6){
        C.add(Math.round(Math.cos(a)*18),y,Math.round(Math.sin(a)*18),
          P.trim,{scale:0.8,mat:1});
      }
    }
    for(var y=-80;y<=80;y+=16){
      for(var a=0;a<Math.PI*2;a+=Math.PI/10){
        C.add(Math.round(Math.cos(a)*18),y,Math.round(Math.sin(a)*18),
          P.hull2,{scale:0.85});
      }
    }
    // glowing inner core column
    for(var y=-70;y<=70;y+=4){
      for(var a=0;a<Math.PI*2;a+=Math.PI/8){
        var pulse=(Math.sin(y*0.2)+1)*0.5;
        C.add(Math.round(Math.cos(a)*8),y,Math.round(Math.sin(a)*8),
          pulse>0.5?P.accent:P.accentDim,
          {scale:0.75,mat:1,glow:P.accent,emis:1.2+pulse*0.8});
      }
      if(y%12===0)C.add(0,y,0,P.white,{scale:0.7,mat:1,glow:P.white,emis:2.0});
    }
    // energy flow lines up supports
    for(var k=0;k<6;k++){
      var ang=k/6*Math.PI*2+0.2;
      for(var r=22;r<W-T;r+=12){
        C.add(Math.round(Math.cos(ang)*r),2,Math.round(Math.sin(ang)*r*0.72),
          P.accent,{scale:0.5,mat:1,glow:P.accent,emis:1.0});
      }
    }
    var mesh=R.makeMesh(C);
    // rotating voxel ring bands around the core (separate meshes, spun at runtime)
    var rings=[];
    for(var ri=0;ri<3;ri++){
      var RC=new R.Collector();
      var rr=24+ri*8;
      for(var a=0;a<Math.PI*2;a+=Math.PI/16){
        var rx=Math.round(Math.cos(a)*rr),rz=Math.round(Math.sin(a)*rr);
        for(var yy=-3;yy<=3;yy+=3){
          var glow=(Math.round(a*10)%4===0);
          RC.add(rx,yy,rz,glow?P.accent:P.trim,{scale:2.6,mat:1,
            glow:glow?P.accent:P.trim,emis:glow?1.2:0});
        }
      }
      var rm=R.makeMesh(RC);
      var ry0=-50+ri*34;
      rings.push({mesh:rm,radius:rr,y:ry0,speed:(ri%2?0.25:-0.18),axis:(ri%2?[0,1,0]:[1,0,0])});
    }
    return {mesh:mesh,rings:rings,bounds:{x:W,y:H,z:D},coreCenter:[0,0,0]};
  }

  /* ---------- 3 hangar: ~360 long (1/3 of flagship) ---------- */
  function buildHangar(){
    var C=new R.Collector();
    var L=180, W=60, H=34, T=5; // half-length 180 -> 360 total
    // axis along X: interior from x=-L (inner second door) to x=+L (mouth)
    shellX(C,0,0,0,L,W,H,T,P.hull2,P.interiorFloor);
    // open mouth at +X
    for(var y=-H+T;y<=H-T;y+=4)for(var z=-W+T;z<=W-T;z+=4){
      if(y%24<18 && z%30<24){
        C.add(L+1,y,z,P.glass,{scale:0.98,mat:3,glow:P.accent,emis:0.25});
      }else C.add(L+2,y,z,P.trim,{scale:0.98,mat:1});
    }
    // inner second door at -L: heavy frame + glow
    for(var y=-H+T;y<=H-T;y+=6)for(var z=-W+T;z<=W-T;z+=6){
      if(Math.abs(y)>H-14||Math.abs(z)>W-14)
        C.add(-L,y,z,P.trim,{scale:0.95,mat:1});
      else
        C.add(-L,y,z,P.accentDim,{scale:0.8,mat:2,glow:P.accent,emis:0.5});
    }
    // parking alcoves on both side walls with recessed bays
    for(var side=-1;side<=1;side+=2){
      for(var x=-L+20;x<=L-20;x+=44){
        // recess frame
        for(var y=-H+10;y<=2;y+=4){
          C.add(x,y,side*(W-T),P.trim,{scale:0.9,mat:1});
          C.add(x,y,side*(W-T-3),P.dark,{scale:0.9,mat:2});
        }
        // bay lights
        C.add(x,4,side*(W-T),P.accent2,{scale:0.6,mat:1,glow:P.accent2,emis:0.9});
      }
    }
    // overhead cross-bridges
    for(var x=-120;x<=120;x+=60){
      box(C,x-3,H-8,-W+T,x+3,H-2,W-T,P.trim,{scale:0.92,mat:1});
      for(var z=-W+10;z<=W-10;z+=10)
        C.add(x,H-10,z,P.accent,{scale:0.5,mat:1,glow:P.accent,emis:0.8});
    }
    // abstract maintenance arms hanging from ceiling
    for(var x=-100;x<=100;x+=50){
      for(var z=-20;z<=20;z+=20){
        for(var y=H-8;y>H-22;y-=4)C.add(x,y,z,P.hull,{scale:0.75});
        C.add(x,H-24,z,P.accent2,{scale:0.5,mat:1,glow:P.accent2,emis:0.7});
      }
    }
    // floor guide lights converging toward mouth
    for(var x=-L+8;x<=L-8;x+=8){
      C.add(x,-H+T+2,0,P.accent,{scale:1.1,mat:1,glow:P.accent,emis:1.4});
      C.add(x,-H+T+2,-20,P.accent,{scale:0.9,mat:1,glow:P.accent,emis:0.9});
      C.add(x,-H+T+2,20,P.accent,{scale:0.9,mat:1,glow:P.accent,emis:0.9});
    }
    // wall edge light strips
    for(var x=-L+10;x<=L-10;x+=14){
      C.add(x,H-8,-W+T+2,P.accent,{scale:0.8,mat:1,glow:P.accent,emis:1.0});
      C.add(x,H-8,W-T-2,P.accent,{scale:0.8,mat:1,glow:P.accent,emis:1.0});
    }
    // ceiling dark beams
    for(var x=-L+10;x<=L-10;x+=24)
      box(C,x-2,H-T,-W+T,x+2,H-6,W-T,P.dark,{scale:0.9,mat:2});

    // parked shuttles in alternating side alcoves (voxel, shared grid ~2-unit)
    var bays=0;
    for(var bx=-L+30;bx<=L-30;bx+=44){
      for(var side=-1;side<=1;side+=2){
        if((bays+ (side>0?1:0))%2!==0)continue;
        var cz=side*(W-T-8), cy=-H+T+6;
        for(var sz=-6;sz<=8;sz+=2){
          var wd=sz<2?4:Math.max(1,Math.round(4-(sz-2)*0.4));
          for(var wx=-wd;wx<=wd;wx+=2)for(var wy=0;wy<=4;wy+=2){
            if(wy>=4&&Math.abs(wx)>wd-2)continue;
            var edge=Math.abs(wx)>=wd||wy>=4||sz>=7;
            C.add(bx+sz,cy+wy,cz+wx*side, edge?P.trim:P.hull,{scale:1.9,mat:edge?1:0});
          }
        }
        // prongs
        for(var s2=-1;s2<=1;s2+=2)for(var sz2=8;sz2<=12;sz2+=2)
          C.add(bx+sz2,cy+2,cz+s2*2*side,P.hull2,{scale:1.7});
        // cockpit + nozzle
        C.add(bx+2,cy+6,cz,P.glass,{scale:1.6,mat:3,glow:P.accent,emis:1.0});
        C.add(bx-7,cy+2,cz,P.accent2,{scale:1.5,mat:1,glow:P.accent2,emis:1.2});
        // docking arm
        for(var ay=cy+5;ay<cy+12;ay+=2)C.add(bx,ay,cz+side*3,P.trim,{scale:1.4,mat:1});
      }
      bays++;
    }

    var mesh=R.makeMesh(C);
    return {mesh:mesh,bounds:{x:L,y:H,z:W},
      mouth:[L,0,0],inner:[-L,0,0]};
  }
  function shellX(C,cx,cy,cz,hl,hw,hh,th,wCol,fCol){
    // floor/ceiling
    box(C,cx-hl,cy-hh,cz-hw,cx+hl,cy-hh+th,cz+hw,fCol,{scale:0.96});
    box(C,cx-hl,cy+hh-th,cz-hw,cx+hl,cy+hh,cz+hw,wCol,{scale:0.96});
    // side walls z
    box(C,cx-hl,cy-hh,cz-hw,cx+hl,cy+hh,cz-hw+th,wCol,{scale:0.96});
    box(C,cx-hl,cy-hh,cz+hw-th,cx+hl,cy+hh,cz+hw,wCol,{scale:0.96});
  }

  /* ---------- 4 energy loading corridor: 360 long, 100 wide, 70 high ---------- */
  function buildCorridor(){
    var C=new R.Collector();
    var L=200,W=50,H=35,T=5; // axis z: -L(far chamber) .. +L(camera entry)
    shell(C,0,0,0,W,H,L,T,P.hull2,P.interiorDark);
    // big cross frames receding
    for(var z=-L+10;z<=L-10;z+=34){
      box(C,-W+T,H-8,z-3,W-T,H-3,z+3,P.trim,{scale:0.92,mat:1});
      box(C,-W+T,-H+T,z-3,-W+12,H-8,z+3,P.trim,{scale:0.9,mat:1});
      box(C,W-12,-H+T,z-3,W-T,H-8,z+3,P.trim,{scale:0.9,mat:1});
      C.add(0,H-10,z,P.accent,{scale:0.7,mat:1,glow:P.accent,emis:1.0});
    }
    // tall loading devices: heavy frame + dark layers + glowing core
    for(var side=-1;side<=1;side+=2){
      for(var z=-L+20;z<=L-16;z+=44){
        var cx=side*(W-22);
        // outer frame columns
        box(C,cx-8,-H+T,z-10,cx-5,H-12,z+10,P.hull,{scale:0.92});
        box(C,cx+5,-H+T,z-10,cx+8,H-12,z+10,P.hull,{scale:0.92});
        box(C,cx-8,H-16,z-10,cx+8,H-12,z+10,P.trim,{scale:0.92,mat:1});
        // dark interlayers
        for(var y=-H+T+6;y<H-18;y+=10)
          box(C,cx-5,y,z-8,cx+5,y+3,z+8,P.dark,{scale:0.9,mat:2});
        // bright core column
        for(var y=-H+T+8;y<H-20;y+=6)
          C.add(cx,y,z,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:1.1});
        // slot rails
        for(var k=-6;k<=6;k+=6)
          C.add(cx+k,-H+T+4,z+11,P.accent2,{scale:0.5,mat:1,glow:P.accent2,emis:0.7});
      }
    }
    // suspended guide conduits overhead
    for(var x=-20;x<=20;x+=10)
      for(var z=-L+8;z<=L-8;z+=10)
        C.add(x,H-10,z,P.accentDim,{scale:0.5,mat:2,glow:P.accent,emis:0.4});
    // floor channel
    box(C,-6,-H+T,-L+8,6,-H+T+2,L-8,P.dark,{scale:0.9,mat:2});
    for(var z=-L+10;z<=L-10;z+=12)
      C.add(0,-H+T+3,z,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:1.0});
    // far glowing chamber: wide cavity at -L
    for(var x=-30;x<=30;x+=6)for(var y=-20;y<=20;y+=6){
      var d=Math.hypot(x/30,y/20);
      C.add(x,y,-L+2,d<0.8?P.accent:P.accentDim,
        {scale:d<0.8?0.8:0.7,mat:1,glow:P.accent,emis:1.6*(1-d)+0.3});
    }
    var mesh=R.makeMesh(C);
    // two abstract mechanical jaws that slowly open/close around central channel
    var jaws=[];
    for(var side=-1;side<=1;side+=2){
      var JC=new R.Collector();
      for(var jx=-3;jx<=3;jx+=3)for(var jy=-12;jy<=12;jy+=3){
        var ed=Math.abs(jx)>=3||Math.abs(jy)>=10;
        JC.add(jx,jy,0,ed?P.trim:P.hull,{scale:2.8,mat:ed?1:0});
      }
      var jm=R.makeMesh(JC);
      jaws.push({mesh:jm,side:side});
    }
    // advancing energy block carriers (small glowing blocks)
    var carriers=[];
    for(var ci=0;ci<3;ci++){
      var EC=new R.Collector();
      for(var ex=-3;ex<=3;ex+=3)for(var ey=-3;ey<=3;ey+=3)for(var ez=-3;ez<=3;ez+=3)
        EC.add(ex,ey,ez,P.accent,{scale:2.8,mat:1,glow:P.accent,emis:2.2});
      carriers.push(R.makeMesh(EC));
    }
    return {mesh:mesh,jaws:jaws,carrier:carriers[0],_carriers:carriers,bounds:{x:W,y:H,z:L}};
  }

  return {buildBridge,buildCore,buildHangar,buildCorridor};
})();
