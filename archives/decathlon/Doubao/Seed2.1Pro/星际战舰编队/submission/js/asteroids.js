/* voxel asteroids with pre-fractured chunks */
var Asteroids=(function(){
  var P=R.PAL;
  var noise=Noise(991);

  function makeAsteroid(cx,cy,cz,radius,seed){
    var rng=RNG(seed);
    var C=new R.Collector();
    var Rr=radius, step=radius>26?6:(radius>14?4:3);
    var voxels=[];
    var origin=[cx,cy,cz];
    var hash=function(ix,iy,iz){
      // voxel -> pseudo random
      var n=Math.sin(ix*127.1+iy*311.7+iz*74.7+seed)*43758.5453;
      return n-Math.floor(n);
    };
    for(var x=-Rr;x<=Rr;x+=step)for(var y=-Rr;y<=Rr;y+=step)for(var z=-Rr;z<=Rr;z+=step){
      var d=Math.hypot(x,y,z)/Rr;
      var n=noise.fbm(x*0.045+seed*0.13,y*0.045,z*0.045,3);
      var surf=d < (0.92+n*0.28);
      // holes / fissures
      var fiss=noise.noise3(x*0.07+seed,y*0.07,z*0.07);
      if(fiss>0.46 && d>0.4)surf=false;
      if(!surf)continue;
      // shell only: remove deep interior (cavity)
      var dn=noise.noise3(x*0.1+seed*3,y*0.1,z*0.1);
      var isShell = d>(0.55+dn*0.2);
      var col;
      var lit = n>0.2?P.rockLight:P.rock;
      if(!isShell){
        if(rng()<0.12){col=P.rockDark;}else continue;
      } else {
        if(fiss>0.3&&d>0.35)col=P.rockDark;
        else if(y> Rr*0.3)col=P.rockLight;
        else if(y< -Rr*0.4)col=P.rockDark;
        else col=lit;
      }
      var scale=step*0.92;
      var vx=cx+x+(hash(x,y,z)-0.5)*step*0.3;
      var vy=cy+y+(hash(x+9,y,z)-0.5)*step*0.3;
      var vz=cz+z+(hash(x,y+9,z)-0.5)*step*0.3;
      C.add(vx,vy,vz,col,{scale:scale,mat:4,ao:0.95});
      voxels.push({x:vx,y:vy,z:vz,col:col,scale:scale,lx:x,ly:y,lz:z});
    }
    var mesh=R.makeMesh(C);
    var ast={
      mesh:mesh, voxels:voxels, origin:V3.c(cx,cy,cz), radius:Rr, seed:seed,
      alive:true, rot:[rng()*6,rng()*6,rng()*6], spin:[0.02+rng()*0.03,(rng()-0.5)*0.03,0.01+rng()*0.02],
      pieces:[], pieceMeshes:[], cracked:false, fractureT:0
    };
    mesh.setTRS(origin,[0,0,0],1);
    return ast;
  }

  // pre-fracture into chunks by cutting planes
  function fracture(ast,originHit,weaponType,rng){
    if(ast.cracked)return [];
    ast.cracked=true;
    ast.fractureT=0;
    var ng = ast.radius>26?6:(ast.radius>14?4:3);
    var groups=[];
    for(var i=0;i<ng;i++)groups.push([]);
    // 2 cut planes roughly through hit; quadrant signs -> 4 groups, map to ng with wobble
    var p1=V3.norm(V3.c(rng()-0.5,rng()-0.5,rng()-0.5));
    var p2=V3.norm(V3.cross(p1,V3.norm(V3.c(rng()-0.5,rng()-0.5,rng()-0.5))));
    if(V3.len(p2)<0.01)p2=V3.norm(V3.cross(p1,V3.c(0,1,0)));
    var hitRel=V3.sub(originHit,ast.origin);
    var off1=V3.dot(p1,hitRel)*0.35+(rng()-0.5)*ast.radius*0.25;
    var off2=V3.dot(p2,hitRel)*0.35+(rng()-0.5)*ast.radius*0.25;
    for(var v of ast.voxels){
      var px=v.x-ast.origin[0],py=v.y-ast.origin[1],pz=v.z-ast.origin[2];
      var s1=px*p1[0]+py*p1[1]+pz*p1[2]-off1;
      var s2=px*p2[0]+py*p2[1]+pz*p2[2]-off2;
      var key=(s1>0?1:0)+(s2>0?2:0);
      // for ng=6 split larger quadrants further by noise
      if(ng>=6){
        var wob=noise.noise3(px*0.1+ast.seed,py*0.1,pz*0.1);
        if(wob>0.15)key=(key+ (s1*s2>0?2:1))%ng;
      }
      groups[key%ng].push(v);
    }
    // build chunk meshes
    var pieces=[];
    for(var gi=0;gi<groups.length;gi++){
      var g=groups[gi];
      if(g.length<2)continue;
      // centroid in world
      var ccx=0,ccy=0,ccz=0;
      for(var v of g){ccx+=v.x;ccy+=v.y;ccz+=v.z;}
      ccx/=g.length;ccy/=g.length;ccz/=g.length;
      var CC=new R.Collector();
      for(var v of g){
        CC.add(v.x-ccx,v.y-ccy,v.z-ccz,v.col,{scale:v.scale,mat:4,ao:0.95});
        // crack-lit voxels near either cut plane
        var d1=Math.abs((v.x-ast.origin[0])*p1[0]+(v.y-ast.origin[1])*p1[1]+(v.z-ast.origin[2])*p1[2]-off1);
        var d2=Math.abs((v.x-ast.origin[0])*p2[0]+(v.y-ast.origin[1])*p2[1]+(v.z-ast.origin[2])*p2[2]-off2);
        var near=d1<ast.radius*0.14||d2<ast.radius*0.14;
        if(near && rng()<0.4){
          CC.add(v.x-ccx,v.y-ccy,v.z-ccz,P.rockCrack,{scale:v.scale*0.9,mat:1,glow:P.rockCrack,emis:1.2,ao:1});
        }
      }
      var pm=R.makeMesh(CC);
      var center=V3.c(ccx,ccy,ccz);
      pm.setTRS(center,[0,0,0],1);
      // velocity away from hit
      var dir=V3.norm(V3.sub(center,originHit));
      if(V3.len(dir)<0.01)dir=V3.norm(V3.sub(center,ast.origin));
      var power = weaponType==='beam'?26:(weaponType==='missile'?22:(weaponType==='pulse'?14:9));
      var vel=V3.scl(dir,power*(0.6+rng()*0.7));
      vel[1]+=(rng()-0.5)*8;
      var piece={
        mesh:pm,pos:V3.copy(center),rot:V3.c(0,0,0),
        vel:vel,
        angVel:V3.c((rng()-0.5)*0.9,(rng()-0.5)*0.9,(rng()-0.5)*0.9),
        life:999, age:0, size:ast.radius
      };
      pieces.push(piece);
      ast.pieces.push(piece);
    }
    // hide original mesh; keep voxels for reference but don't draw
    ast.mesh.visible=false;
    // some pieces for big rocks remain: pieces stay visible permanently (debris field)
    return pieces;
  }

  // chip small bits from a piece or asteroid
  function spawnChips(worldPos,count,rng,power){
    var chips=[];
    for(var i=0;i<count;i++){
      var s=2.5+rng()*2.5;
      var CC=new R.Collector();
      var c=rng()<0.5?P.rock:(rng()<0.5?P.rockDark:P.rockLight);
      CC.add(0,0,0,c,{scale:s,mat:4});
      var m=R.makeMesh(CC);
      m.setTRS(worldPos,[0,0,0],1);
      var dir=V3.norm(V3.c(rng()-0.5,rng()-0.5,rng()-0.5));
      var p={mesh:m,pos:V3.copy(worldPos),rot:V3.c(rng()*6,rng()*6,rng()*6),
        vel:V3.scl(dir,(power||14)*(0.5+rng())),
        angVel:V3.c((rng()-0.5)*2,(rng()-0.5)*2,(rng()-0.5)*2),age:0,life:999,size:s};
      chips.push(p);
    }
    return chips;
  }

  function updateAst(ast,dt){
    if(!ast.alive)return;
    var dz=(ast.driftZ||0)+(ast.lunge||0);
    if(!ast.cracked){
      ast.rot[0]+=ast.spin[0]*dt;ast.rot[1]+=ast.spin[1]*dt;ast.rot[2]+=ast.spin[2]*dt;
      ast.mesh.setTRS(V3.add(ast.origin,V3.c(0,0,dz)),ast.rot,1);
    } else {
      ast.fractureT+=dt;
    }
    for(var p of ast.pieces){
      p.age+=dt;
      p.pos=V3.add(p.pos,V3.scl(p.vel,dt));
      p.vel=V3.scl(p.vel,Math.exp(-0.04*dt));
      p.rot[0]+=p.angVel[0]*dt;p.rot[1]+=p.angVel[1]*dt;p.rot[2]+=p.angVel[2]*dt;
      p.mesh.setTRS(V3.add(p.pos,V3.c(0,0,dz)),p.rot,1);
    }
  }

  function updateChip(p,dt){
    p.age+=dt;
    p.pos=V3.add(p.pos,V3.scl(p.vel,dt));
    p.vel=V3.scl(p.vel,Math.exp(-0.05*dt));
    p.rot[0]+=p.angVel[0]*dt;p.rot[1]+=p.angVel[1]*dt;p.rot[2]+=p.angVel[2]*dt;
    var dz=(p.lunge||0);
    p.mesh.setTRS(V3.add(p.pos,V3.c(0,0,dz)),p.rot,1);
  }
  function worldOrigin(ast){
    return V3.add(ast.origin,V3.c(0,0,(ast.driftZ||0)+(ast.lunge||0)));
  }

  return {makeAsteroid,fracture,spawnChips,updateAst,updateChip,worldOrigin};
})();
