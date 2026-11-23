/* procedural ship construction on shared voxel grid.
   Convention: +Z bow, -Z stern, +X starboard, +Y up.
   Design motif: "twin-prong stepped blade" — forked forward blade,
   stepped armor bands, recessed dark slots between plates, glowing seam lines. */
var Ships=(function(){
  var P=R.PAL;
  var C=new R.Collector();
  // locators filled while building
  var loc={engines:[],pulseTurrets:[],pdTurrets:[],missileCells:[],hangars:[],beam:{}};

  function V(x,y,z){return [x,y,z];}
  function matColor(mat){
    return mat;
  }
  function add(x,y,z,color,o){C.add(x,y,z,color,o);}

  function hullMatColor(x,y,z,rng,variant){
    // plate banding along z -> alternate main/light/dark
    var band=Math.abs(Math.floor(z/46)%3);
    if(band===0)return variant?P.hull2:P.hull;
    if(band===1)return P.hull;
    return variant?P.hull:P.hull2;
  }

  /* ---------- flagship: ~1100 long ---------- */
  function buildFlagship(){
    C=new R.Collector();
    loc={engines:[],pulseTurrets:[],pdTurrets:[],missileCells:[],hangars:[],beam:{}};
    var rng=RNG(101);
    var L=1100;
    // hull half-extents along z: width(z), height(z)
    function profile(z){
      // z from -550(stern) .. 550(bow)
      var t=(z+L/2)/L; // 0 stern -> 1 bow
      var w,h;
      if(t<0.12){ // stern taper
        var k=t/0.12; w=lerp(42,86,smoothstep(0,1,k)); h=lerp(30,58,k);
      } else if(t<0.72){
        var u=(t-0.12)/0.60;
        w=lerp(86,74,u); h=lerp(58,50,u);
        w+=Math.sin(u*Math.PI*3)*3;
      } else {
        var u=(t-0.72)/0.28;
        w=lerp(74,6,smoothstep(0,1,u)); h=lerp(50,6,smoothstep(0,1,u));
      }
      return {w:w,h:h};
    }

    // main armored body: shell rings on a 6-unit macro grid (integer multiple
    // of the shared voxel grid), scale 5.7 so plates stay nearly seamless.
    var G=6;
    var HZ_START=-470, HZ_END=430;
    for(var z=HZ_START;z<=HZ_END;z+=G){
      var pr=profile(z);
      var w=Math.max(G,Math.round(pr.w/G)*G),h=Math.max(G,Math.round(pr.h/G)*G);
      var shellTh=G;
      for(var x=-w;x<=w;x+=G){
        for(var y=-h;y<=h;y+=G){
          var ax=Math.abs(x),ay=Math.abs(y);
          var surf = ax>=w-shellTh || ay>=h-shellTh
                   || y>=h-shellTh || (y<=-h+shellTh);
          if(!surf)continue;
          // carve the port-side hangar opening (x negative)
          if(ax>=w-G && x<0 && z>-138&&z<138 && y>-42&&y<42)continue;
          // step pattern: carve slots
          var slot=((Math.floor(z/12)+Math.floor(ax/18)+Math.floor((ay)/12))%5===0) && ax>w-shellTh-G;
          var col;
          var edge = (ax>=w-G||ay>=h-G);
          if(slot&&!edge){ col=P.dark; }
          else if(edge && (z%12<6)){col=P.trim;}
          else if(y>h-G-2){col=P.armorLight;}
          else if(y<-h+G+2){col=P.hull2;}
          else {col=hullMatColor(x,y,z,rng,(x>0)!==(z%24<12));}
          var o={scale:5.7,mat:col===P.trim?1:(col===P.dark?2:0)};
          if(edge && z%24===0 && ((Math.floor(ax/12)+Math.floor(z/24))%3===0)){
            col=P.accent;o.mat=1;o.glow=P.accent;o.emis=1.2;
          }
          add(x,y,z,col,o);
        }
      }
      // deck spine
      if(z%12===0&&pr.h>20){
        var sp=profile(z);
        for(var sx=-30;sx<=30;sx+=12)
          add(sx,Math.round(sp.h)+6,z,(sx%24===0)?P.trim:P.hull2,{scale:5.6,mat:1});
      }
    }

    // longitudinal dark groove bands + connecting beams on sides
    buildSideDetails(profile);
    // dorsal superstructure (stepped blocks)
    buildDorsal(profile);
    // ventral ribs
    buildVentral(profile);
    // bow twin prongs
    buildBow(profile);
    // beam cannon
    buildBeamCannon(profile);
    // stern nozzles
    buildStern(profile);
    // pulse turret ring
    buildPulseTurrets(profile);
    // hangar opening port side (x negative)
    buildHangarPort(profile);

    var mesh=R.makeMesh(C);
    return {mesh:mesh,loc:loc,length:L,center:[0,0,0]};
  }

  function buildSideDetails(profile){
    for(var z=-440;z<=360;z+=40){
      var pr=profile(z);
      for(var side=-1;side<=1;side+=2){
        var w=Math.round(pr.w);
        // recessed dark band with beam trusses
        for(var y=-Math.round(pr.h*0.5);y<=Math.round(pr.h*0.3);y+=8){
          add(side*w,y,z+10,P.dark,{scale:0.96,mat:2});
          add(side*w,y,z+14,P.innerDark,{scale:0.9,mat:2});
        }
        // truss beams
        for(var k=0;k<4;k++){
          add(side*(w+2), -Math.round(pr.h*0.5)+k*8, z+12, P.trim,{scale:0.8,mat:1});
        }
        // side fin blades (stepped)
        var fy=Math.round(pr.h*0.1);
        for(var i=0;i<5;i++){
          add(side*(w+2+i*2),fy-i*3,z-20+i*0,P.hull2,{scale:0.94});
          add(side*(w+2+i*2),fy-i*3-4,z-20,P.dark,{scale:0.8,mat:2});
        }
      }
    }
  }

  function buildDorsal(profile){
    // stepped superstructure blocks along top
    var blocks=[
      {z0:-360,z1:-260,w:44,h:26},{z0:-250,z1:-150,w:58,h:34},
      {z0:-140,z1:-20,w:50,h:30},{z0:-10,z1:110,w:40,h:24},
      {z0:120,z1:230,w:30,h:18},{z0:240,z1:330,w:20,h:12}
    ];
    for(var b of blocks){
      var G2=6;
      for(var z=b.z0;z<=b.z1;z+=G2){
        var base=Math.round(profile(z).h/G2)*G2;
        for(var y=0;y<b.h;y+=G2){
          var wb=Math.round(b.w*(1-0.25*y/b.h)/G2)*G2;
          for(var x=-wb;x<=wb;x+=G2){
            var edge=Math.abs(x)>=wb-G2||y>=b.h-G2||y===0;
            var col=edge?P.trim:(y%12<6?P.hull2:P.hull);
            var o={scale:5.7,mat:edge?1:0};
            if(edge&&(z%24===0)&&y>b.h-12){col=P.accent;o.glow=P.accent;o.emis=0.9;}
            add(x,base+G2+y,z,col,o);
          }
        }
      }
      // command windows row (fine detail)
      var base0=Math.round(profile((b.z0+b.z1)/2).h);
      for(var z=b.z0+8;z<b.z1-6;z+=10){
        for(var x=-b.w+8;x<=b.w-8;x+=10){
          if((x+z)%30<15)add(x,base0+b.h+3,z,P.glass,{scale:2.2,mat:3,glow:P.accent,emis:0.8});
        }
      }
    }
    // tall mast spires with warning lights
    for(var mz of [-300,-80,150]){
      var bh=30,hh=Math.round(profile(mz).h)+4+bh;
      for(var y=0;y<26;y+=4)add(0,hh+y,mz,P.trim,{scale:0.7,mat:1});
      add(0,hh+28,mz,P.glowr,{scale:0.9,mat:1,glow:P.glowr,emis:1.6});
    }
  }

  function buildVentral(profile){
    for(var z=-420;z<=300;z+=24){
      var pr=profile(z);
      for(var side=-1;side<=1;side+=2){
        for(var i=0;i<4;i++){
          var x=side*(Math.round(pr.w*0.45)-i*4);
          add(x,-Math.round(pr.h)-4-i*2,z,P.hull2,{scale:0.92});
          if(i===2)add(x,-Math.round(pr.h)-10,z,P.dark,{scale:0.8,mat:2});
        }
      }
      // keel ridge
      if(z%48===0)add(0,-Math.round(pr.h)-6,z,P.trim,{scale:0.85,mat:1});
    }
  }

  function buildBow(profile){
    // two forward prongs: shell on 6-grid for mass, fine trim on leading edges
    var G=6;
    for(var z=380;z<=560;z+=G){
      var t=(z-380)/180;
      var spread=Math.round(lerp(24,42,smoothstep(0,1,t))/G)*G;
      var ph=Math.max(G,Math.round(lerp(36,6,smoothstep(0,1,t))/G)*G);
      var pw=Math.max(G,Math.round(lerp(24,6,smoothstep(0,1,t))/G)*G);
      for(var side=-1;side<=1;side+=2){
        var cx=side*spread;
        for(var x=-pw;x<=pw;x+=G)for(var y=-ph;y<=ph;y+=G){
          var edge=Math.abs(x)>=pw-G||Math.abs(y)>=ph-G;
          var surf=edge||Math.abs(x)>=pw-G||Math.abs(y)>=ph-G;
          var stepi=Math.floor(t*8);
          var cut=((x+y*0.5+stepi*4)%16)<G;
          if(edge&&cut&&t>0.45)continue;
          var col=edge?P.trim:(y>ph-G-2?P.armorLight:P.hull);
          var o={scale:5.7,mat:edge?1:0};
          if(edge&&z%24===0&&Math.abs(y)<=G){col=P.accent;o.glow=P.accent;o.emis=1.0;}
          add(cx+x,y,z,col,o);
        }
        add(cx-side*G,-ph+G,z,P.accentDim,{scale:4,mat:2,glow:P.accent,emis:0.3});
      }
      if(t<0.45){
        for(var bx=-spread+12;bx<=spread-12;bx+=12)
          for(var by=-6;by<=6;by+=12)add(bx,by,z,P.hull2,{scale:5});
      }
    }
    // fine prong tips (last segment) at 3-grid
    for(var z=500;z<=566;z+=3){
      var t=(z-500)/66,spread=Math.round(lerp(36,44,t)),ph=Math.round(lerp(16,4,t));
      for(var side=-1;side<=1;side+=2){
        for(var x=-4;x<=4;x+=3)for(var y=-ph;y<=ph;y+=3){
          add(side*spread+x,y,z,Math.abs(y)>=ph-3?P.trim:P.hull,{scale:2.9,mat:Math.abs(y)>=ph-3?1:0});
        }
      }
    }
  }

  function buildBeamCannon(profile){
    // broad base on bow center, barrel along +Z, glowing muzzle
    // base: tapered block between prongs
    for(var z=300;z<=400;z+=4){
      var t=(z-300)/100;
      var w=lerp(30,14,t),h=lerp(20,12,t);
      for(var x=-w;x<=w;x+=4)for(var y=-h;y<=h;y+=4){
        var edge=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        add(x,y,z,edge?P.trim:P.hull2,{scale:0.96,mat:edge?1:0});
      }
    }
    // barrel: long squared cylinder z 400..520, stepped segments
    for(var z=400;z<=530;z+=4){
      var t=(z-400)/130;
      var r=lerp(10,7,t) + (z%16<4?2:0);
      for(var x=-r;x<=r;x+=4)for(var y=-r;y<=r;y+=4){
        var edge=Math.max(Math.abs(x),Math.abs(y))>=r-2;
        if(!edge&&(z%16>=8))continue;
        var col=edge?P.trim:P.dark;
        var o={scale:0.96,mat:edge?1:2};
        if(Math.abs(x)<=4&&y===-r+4){col=P.accent;o.glow=P.accent;o.emis=0.35;o.mat=1;}
        add(x,y,z,col,o);
      }
    }
    // muzzle ring + deep glowing throat
    var mz=532;
    for(var a=0;a<Math.PI*2;a+=Math.PI/8){
      add(Math.round(Math.cos(a)*12),Math.round(Math.sin(a)*12),mz,P.trim,{scale:0.96,mat:1});
    }
    for(var x=-6;x<=6;x+=4)for(var y=-6;y<=6;y+=4){
      add(x,y,mz+2,P.accent,{scale:0.92,mat:1,glow:P.accent,emis:0.8});
    }
    add(0,0,mz+2,P.white,{scale:0.8,mat:1,glow:P.white,emis:1.4});
    loc.beam={muzzle:[0,0,mz+3],base:[0,0,300]};
  }

  function buildStern(profile){
    // stepped retreating stern with multiple nozzle clusters, z -470..-560
    for(var z=-470;z>=-560;z-=4){
      var t=(-470-z)/90;
      var w=lerp(profile(-470).w,30,t),h=lerp(profile(-470).h,22,t);
      w=Math.round(w);h=Math.round(h);
      for(var x=-w;x<=w;x+=4)for(var y=-h;y<=h;y+=4){
        var surf=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        if(!surf&&z%12>=8)continue;
        var edge=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        add(x,y,z,edge?P.trim:(z%12<4?P.hull2:P.dark),{scale:0.96,mat:edge?1:2});
      }
    }
    // nozzle array at z=-564
    var nozzles=[
      {x:0,y:0,r:20},{x:-34,y:8,r:13},{x:34,y:8,r:13},
      {x:-34,y:-14,r:12},{x:34,y:-14,r:12},{x:0,y:-22,r:14},{x:-60,y:0,r:9},{x:60,y:0,r:9},
      {x:-16,y:22,r:8},{x:16,y:22,r:8}
    ];
    for(var n of nozzles){
      // layered rim
      for(var layer=0;layer<3;layer++){
        var rr=n.r+layer*3, zz=-560-layer*4;
        for(var a=0;a<Math.PI*2;a+=Math.PI/Math.max(6,n.r)){
          var xx=Math.round(n.x+Math.cos(a)*rr),yy=Math.round(n.y+Math.sin(a)*rr);
          add(xx,yy,zz,layer===0?P.trim:P.hull2,{scale:0.95,mat:layer===0?1:0});
        }
      }
      // glowing interior throat (bright core)
      for(var x=-n.r+4;x<=n.r-4;x+=5)for(var y=-n.r+4;y<=n.r-4;y+=5){
        if(Math.hypot(x-n.x,y-n.y)<n.r-1){
          var dd=Math.hypot(x-n.x,y-n.y)/n.r;
          var hot=dd<0.45;
          add(x,y,-566,hot?P.white:P.accent2,{scale:hot?1.4:1.1,mat:1,glow:hot?P.white:P.accent2,emis:hot?3.2:2.2});
        }
      }
      loc.engines.push({pos:[n.x,n.y,-572],r:n.r,dir:[0,0,-1]});
    }
  }

  function buildPulseTurrets(profile){
    // rows of floating/standing pulse turrets along dorsal & side edges
    var positions=[];
    for(var z=-380;z<=300;z+=70){
      var pr=profile(z),h=Math.round(pr.h),w=Math.round(pr.w);
      positions.push([0,h+16,z]);
      positions.push([-w-2,h*0.3,z+30]);
      positions.push([w+2,h*0.3,z+30]);
    }
    for(var p of positions){
      buildPulseTurret(p[0],p[1],p[2]);
    }
  }
  function buildPulseTurret(x,y,z){
    // stepped base block
    add(x,y,z,P.hull2,{scale:8});
    add(x,y+5,z,P.trim,{scale:7,mat:1});
    add(x,y+10,z+1,P.hull,{scale:6});
    // rotating body housing (wide)
    for(var bx=-6;bx<=6;bx+=4)for(var bz=-4;bz<=6;bz+=4){
      var edge=Math.abs(bx)>=6||bz>=6;
      add(x+bx,y+15,z+bz+2,edge?P.trim:P.hull2,{scale:3.6,mat:edge?1:0});
    }
    // twin pulse barrels pointing +Z
    for(var s=-1;s<=1;s+=2){
      for(var k=0;k<4;k++)add(x+s*5,y+17,z+8+k*3,k===3?P.accent:P.trim,
        {scale:2.6,mat:1,glow:k===3?P.accent:P.trim,emis:k===3?1.2:0});
    }
    add(x,y+17,z+22,P.white,{scale:2.2,mat:1,glow:P.white,emis:1.4});
    loc.pulseTurrets.push({pos:[x,y+17,z+24]});
  }

  function buildHangarPort(profile){
    // giant opening on port side (x negative)
    var z0=-140,z1=140,y0=-42,y1=42;
    // thick stepped rim around opening
    for(var z=z0-14;z<=z1+14;z+=6){
      var w=Math.round(profile(z).w/6)*6;
      var hh=Math.round(profile(z).h/6)*6;
      for(var y=-hh;y<=hh;y+=6){
        var inOpen = z>z0&&z<z1&&y>y0&&y<y1;
        var nearEdge = Math.abs(z)>z1-10 || Math.abs(y)>y1-10;
        if(inOpen&&!nearEdge)continue;
        add(-w,y,z,nearEdge?P.trim:P.hull2,{scale:5.6,mat:nearEdge?1:0});
        if(nearEdge && ((Math.round(z/6)+Math.round(y/6))%3===0))
          add(-w,y,z,P.accent,{scale:2.4,mat:1,glow:P.accent,emis:1.1});
      }
    }
    // recessed cavity: dark floor/ceiling/back wall + guide lights into depth
    for(var depth=6;depth<=44;depth+=6){
      var xx=-Math.round(profile(0).w)+depth;
      for(var z=z0+6;z<=z1-6;z+=12){
        add(xx,y0,z,P.innerDark,{scale:5,mat:2});
        add(xx,y1,z,P.dark,{scale:5,mat:2});
        if(depth===44)add(xx,0,z,P.accentDim,{scale:3,mat:2,glow:P.accent,emis:0.5});
      }
      for(var y=y0+6;y<=y1-6;y+=12){
        add(xx,y,z0+2,P.innerDark,{scale:5,mat:2});
        add(xx,y,z1-2,P.innerDark,{scale:5,mat:2});
      }
      // guide lights along floor toward the back
      if(depth%12===0)add(xx,y0+6,0,P.accent,{scale:2,mat:1,glow:P.accent,emis:1.2});
    }
    // parked shuttles visible inside (small voxel hints)
    for(var bz of [-90,0,90]){
      for(var sx=0;sx<5;sx+=2)for(var sy=-2;sy<=2;sy+=2){
        var wd=sx<3?2:1;
        for(var wy=0;wy<3;wy+=2)
          add(-Math.round(profile(0).w)+30+sx, y0+8+wy+ (Math.abs(sy)>wd?6:0), bz+sy,
            sx>=4?P.trim:P.hull,{scale:1.8,mat:sx>=4?1:0});
      }
      add(-Math.round(profile(0).w)+24,y0+13,bz,P.glass,{scale:1.5,mat:3,glow:P.accent,emis:0.9});
    }
    loc.hangars.push({side:-1,z0,z1,y0,y1,
      mouth:[ -Math.round(profile(0).w)-2,0,0],
      center:[-30,0,0]});
  }

  /* ---------- escort: guard (close defense), ~190 long, compact ---------- */
  function buildGuard(){
    C=new R.Collector();
    var L=190;
    function prof(z){
      var t=(z+L/2)/L;
      var w,h;
      if(t<0.2){var k=t/0.2;w=lerp(10,18,k);h=lerp(8,13,k);}
      else if(t<0.7){var u=(t-0.2)/0.5;w=lerp(18,14,u);h=lerp(13,11,u);}
      else{var u=(t-0.7)/0.3;w=lerp(14,3,smoothstep(0,1,u));h=lerp(11,3,smoothstep(0,1,u));}
      return {w:w,h:h};
    }
    for(var z=-80;z<=60;z+=4){
      var pr=prof(z),w=Math.round(pr.w),h=Math.round(pr.h);
      for(var x=-w;x<=w;x+=4)for(var y=-h;y<=h;y+=4){
        var surf=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        if(!surf)continue;
        var edge=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        var slot=((Math.floor(z/6)+Math.floor(Math.abs(x)/8))%4===0);
        var col=edge?P.trim:(slot?P.dark:(y>h-6?P.armorLight:P.hull));
        var o={scale:0.95,mat:edge?1:(slot?2:0)};
        add(x,y,z,col,o);
      }
    }
    // compact stubby wings / stacked shells
    for(var side=-1;side<=1;side+=2){
      for(var i=0;i<6;i++){
        add(side*(14+i*3), -2+i*2, -10-i*4, P.hull2,{scale:0.92});
        add(side*(14+i*3), 2, -10-i*4, P.trim,{scale:0.8,mat:1});
      }
      // PD gun clusters on raised mounts with twin barrels
      for(var g=0;g<3;g++){
        var gy=8+g*6,gz=-20+g*14;
        add(side*20,gy-2,gz,P.hull2,{scale:3.4});
        add(side*20,gy+2,gz+2,P.trim,{scale:2.8,mat:1});
        for(var b=-1;b<=1;b+=2)
          for(var k=0;k<4;k++)
            add(side*20+b*2,gy+2,gz+4+k*2,k===3?P.accent:P.trim,
              {scale:1.5,mat:1,glow:k===3?P.accent:P.trim,emis:k===3?1.0:0});
        add(side*20,gy+2,gz+13,P.white,{scale:1.2,mat:1,glow:P.white,emis:1.2});
      }
    }
    // dorsal block + pointed bow fork
    for(var z=20;z<=80;z+=4){
      var t=(z-20)/60,sp=lerp(6,10,t),ph=lerp(8,3,t);
      for(var s2=-1;s2<=1;s2+=2)
        for(var x=-3;x<=3;x+=4)for(var y=-ph;y<=ph;y+=4)
          add(s2*sp+x,y,z,Math.abs(y)>=ph-2?P.trim:P.hull2,{scale:0.92,mat:Math.abs(y)>=ph-2?1:0});
    }
    // twin nozzles with bright inner cores
    for(var nx of [-9,9]){
      for(var a=0;a<Math.PI*2;a+=Math.PI/4)
        add(nx+Math.round(Math.cos(a)*7),Math.round(Math.sin(a)*7),-84,P.trim,{scale:3.2,mat:1});
      for(var x=-4;x<=4;x+=4)for(var y=-4;y<=4;y+=4){
        var hot=Math.hypot(x,y)<3;
        add(nx+x,y,-86,hot?P.white:P.accent2,{scale:hot?2:2.4,mat:1,glow:hot?P.white:P.accent2,emis:hot?3:2});
      }
    }
    return {mesh:R.makeMesh(C),length:L,
      engines:[{pos:[-9,0,-92],r:6,dir:[0,0,-1]},{pos:[9,0,-92],r:6,dir:[0,0,-1]}],
      pd:[[-20,10,-7],[20,10,-7],[-20,16,7],[20,16,7],[-20,22,21],[20,22,21]]};
  }

  /* ---------- vanguard: ~240 long, stretched, missile launchers ---------- */
  function buildVanguard(){
    C=new R.Collector();
    var L=240;
    function prof(z){
      var t=(z+L/2)/L;
      var w,h;
      if(t<0.15){var k=t/0.15;w=lerp(8,12,k);h=lerp(6,9,k);}
      else if(t<0.75){var u=(t-0.15)/0.6;w=lerp(12,10,u);h=lerp(9,7,u);}
      else{var u=(t-0.75)/0.25;w=lerp(10,2,smoothstep(0,1,u));h=lerp(7,2,smoothstep(0,1,u));}
      return {w:w,h:h};
    }
    for(var z=-100;z<=100;z+=4){
      var pr=prof(z),w=Math.round(pr.w),h=Math.round(pr.h);
      for(var x=-w;x<=w;x+=4)for(var y=-h;y<=h;y+=4){
        var surf=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        if(!surf)continue;
        var edge=Math.abs(x)>=w-4||Math.abs(y)>=h-4;
        add(x,y,z,edge?P.trim:(z%20<8?P.hull:P.hull2),{scale:0.95,mat:edge?1:0});
      }
    }
    // long slender blade bow
    for(var z=90;z<=120;z+=4){
      var t=(z-90)/30;
      for(var x=-4;x<=4;x+=4)for(var y=-4;y<=4;y+=4){
        var keep=Math.abs(x)<=lerp(4,2,t)&&Math.abs(y)<=lerp(4,2,t);
        if(keep)add(x,y,z,(z%8===0)?P.trim:P.hull,{scale:0.92,mat:z%8===0?1:0});
      }
    }
    // outstretched missile launcher wings: rows of slot cells
    var cells=[];
    for(var side=-1;side<=1;side+=2){
      for(var i=0;i<8;i++){
        var wz=12+i*4, wy=2, wx=side*(12+i*2);
        add(wx,wy,wz,P.hull2,{scale:0.9});
        add(wx,wy+3,wz,P.trim,{scale:0.7,mat:1});
      }
      // launcher pod: box with slot columns and loaded missile bodies
      for(var lz=-70;lz<=30;lz+=8){
        for(var row=0;row<3;row++){
          var px=side*16,py=-4+row*5;
          add(px,py,lz,P.dark,{scale:2.2,mat:2});
          add(px,py,lz+3,P.trim,{scale:1.8,mat:1});
          // loaded missile in alternating cells
          if((Math.round(lz/8)+row)%2===0){
            for(var mz2=0;mz2<8;mz2+=2)
              add(px+side*1,py,lz+4+mz2,(mz2>=6)?P.accent2:P.hull,
                {scale:1.5,mat:mz2>=6?1:0,glow:mz2>=6?P.accent2:P.hull,emis:mz2>=6?1.2:0});
            add(px+side*1,py,lz+12,P.trim,{scale:1.2,mat:1});
          }
          cells.push([px+side*1,py,lz+6]);
        }
      }
    }
    // engine: long thin nozzle
    for(var side=-1;side<=1;side+=2){
      for(var a=0;a<Math.PI*2;a+=Math.PI/4)
        add(side*7+Math.round(Math.cos(a)*6),Math.round(Math.sin(a)*6),-104,P.trim,{scale:2.6,mat:1});
      for(var x=-3;x<=3;x+=3)for(var y=-3;y<=3;y+=3){
        var hot=Math.abs(x)<3&&Math.abs(y)<3;
        add(side*7+x,y,-106,hot?P.white:P.accent2,{scale:hot?1.8:2,mat:1,glow:hot?P.white:P.accent2,emis:hot?2.6:1.8});
      }
    }
    return {mesh:R.makeMesh(C),length:L,
      engines:[{pos:[-7,0,-112],r:5,dir:[0,0,-1]},{pos:[7,0,-112],r:5,dir:[0,0,-1]}],
      missileCells:cells};
  }

  /* ---------- shuttle: ~28 long ---------- */
  function buildShuttle(){
    C=new R.Collector();
    // nose + body + nozzle, echoes the fork motif simply
    for(var z=-10;z<=8;z+=2){
      var w=z<2?4:lerp(4,1,(z-2)/8),h=3;
      for(var x=-w;x<=w;x+=2)for(var y=-h;y<=h;y+=2){
        var edge=Math.abs(x)>=w-1||Math.abs(y)>=h-1;
        add(x,y,z,edge?P.trim:P.hull,{scale:0.92,mat:edge?1:0});
      }
    }
    // twin tiny prongs
    for(var s=-1;s<=1;s+=2){
      for(var z=8;z<=14;z+=2){
        add(s*2,0,z,z%4===0?P.trim:P.hull2,{scale:0.85,mat:z%4===0?1:0});
      }
    }
    // cockpit glow
    add(0,2,0,P.glass,{scale:0.8,mat:3,glow:P.accent,emis:0.9});
    add(0,0,2,P.accent,{scale:0.6,mat:1,glow:P.accent,emis:0.6});
    // nozzle
    for(var x=-2;x<=2;x+=2)for(var y=-2;y<=2;y+=2)
      add(x,y,-11,P.accent2,{scale:0.7,mat:1,glow:P.accent2,emis:1.5});
    return {mesh:R.makeMesh(C),length:28,engine:{pos:[0,0,-13],r:2.5,dir:[0,0,-1]}};
  }

  return {buildFlagship,buildGuard,buildVanguard,buildShuttle};
})();
