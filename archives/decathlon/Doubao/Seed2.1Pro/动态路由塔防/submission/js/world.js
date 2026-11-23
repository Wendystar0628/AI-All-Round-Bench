/* ================= 3D 世界：场景 / 镜头 / 地图美术 / 路线 / 拾取 ================= */
G.World = function(canvas){
'use strict';
var self=this;
var THREE=window.THREE;
this.canvas=canvas;
this.renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
this.renderer.setSize(window.innerWidth,window.innerHeight);
this.renderer.shadowMap.enabled=true;
this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
this.renderer.outputEncoding=THREE.sRGBEncoding;
this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
this.renderer.toneMappingExposure=1.12;

this.scene=new THREE.Scene();
this.scene.background=new THREE.Color(0x03060c);
this.scene.fog=new THREE.FogExp2(0x050a14,0.0125);

this.camera=new THREE.PerspectiveCamera(50,window.innerWidth/window.innerHeight,.1,400);
this.mapGroup=new THREE.Group();this.envGroup=new THREE.Group();
this.routeGroup=new THREE.Group();this.unitGroup=new THREE.Group();this.fxGroup=new THREE.Group();
this.scene.add(this.envGroup,this.mapGroup,this.routeGroup,this.unitGroup,this.fxGroup);

/* ---------- 灯光 ---------- */
var hemi=new THREE.HemisphereLight(0x88bbff,0x0a0e1a,.75);this.scene.add(hemi);
var key=new THREE.DirectionalLight(0xbfe0ff,1.15);
key.position.set(14,26,12);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-34;key.shadow.camera.right=34;key.shadow.camera.top=34;key.shadow.camera.bottom=-34;
key.shadow.camera.far=90;key.shadow.bias=-.0004;
this.scene.add(key);
var fill=new THREE.DirectionalLight(0x3a6cff,.35);fill.position.set(-20,12,-14);this.scene.add(fill);
this.keyLight=key;

/* ---------- 状态 ---------- */
this.nodes={}; this.edges=[]; this.platforms=[]; this.slots=[];
this.pickables=[]; this.mapDef=null;
this.clock=0;
this.themes=[
  {fog:0x050a14,slab:0x0a1828,accent:0x37e2ff,light:0xbfe0ff,amb:0x223},
  {fog:0x04101a,slab:0x07202c,accent:0x2af0c8,light:0xa0f0ff,amb:0x223},
  {fog:0x0c0806,slab:0x1c1408,accent:0xffb648,light:0xffd9a0,amb:0x322}
];

/* =========================================================
   镜头（Blender 风格）
========================================================= */
var cam={target:new THREE.Vector3(0,0,0),radius:44,theta:Math.PI*.25,phi:Math.PI*.36,
  dtheta:0,dphi:0,dr:0,panX:0,panY:0};
this.camDefault=null;
var camMode='manual'; // manual | fly | follow
var camFrom=new THREE.Vector3(),camToPos=new THREE.Vector3(),camToTgt=new THREE.Vector3(),camT=0,camDur=1,camFollow=null;

this.resetCamera=function(){
  var b=self.bounds;
  cam.target.set((b.minx+b.maxx)/2,0,(b.minz+b.maxz)/2);
  var w=b.maxx-b.minx, d=b.maxz-b.minz;
  cam.radius=Math.max(w,d)*1.35+12;
  cam.theta=Math.PI*.18;cam.phi=Math.PI*.34;
  this.camDefault={pos:self.camera.position.clone(),tgt:cam.target.clone(),r:cam.radius,th:cam.theta,ph:cam.phi};
  applyCamera(1);
};
this.flyTo=function(pos,tgt,dur){
  camMode='fly';camFrom.copy(self.camera.position);camToPos.copy(pos);camToTgt.copy(tgt);camT=0;camDur=dur||1;
};
this.follow=function(getter){camMode='follow';camFollow=getter;};
this.camManual=function(){camMode='manual';camFollow=null;};
function applyCamera(k){
  var sp=Math.sin(cam.phi), cp=Math.cos(cam.phi);
  self.camera.position.set(
    cam.target.x+cam.radius*sp*Math.sin(cam.theta),
    cam.target.y+cam.radius*cp,
    cam.target.z+cam.radius*sp*Math.cos(cam.theta));
  self.camera.lookAt(cam.target);
}
this.screenToGround=function(cx,cy,y){
  var v=new THREE.Vector3((cx/window.innerWidth)*2-1,-(cy/window.innerHeight)*2+1,.5);
  v.unproject(self.camera);
  var dir=v.sub(self.camera.position).normalize();
  var t=(y-self.camera.position.y)/dir.y;
  return self.camera.position.clone().add(dir.multiplyScalar(t));
};
this.updateCamera=function(dt){
  if(camMode==='fly'){
    camT+=dt;var k=G.clamp(camT/camDur,0,1),e=G.easeInOut(k);
    self.camera.position.lerpVectors(camFrom,camToPos,e);
    cam.target.lerp(camToTgt,Math.min(1,dt*4));
    self.camera.lookAt(cam.target);
    if(k>=1)camMode='manual';
  }else if(camMode==='follow'&&camFollow){
    var f=camFollow();
    cam.target.lerp(f.tgt,Math.min(1,dt*2.2));
    if(f.radius){var s=Math.min(1,dt*2);cam.radius=G.lerp(cam.radius,f.radius,s);}
    applyCamera(0);
  }else{
    var damp=1-Math.pow(.0001,dt);
    cam.theta+=cam.dtheta*damp;cam.phi+=cam.dphi*damp;
    cam.phi=G.clamp(cam.phi,.12,Math.PI/2-.05);
    cam.radius=G.clamp(cam.radius+cam.dr*damp,12,90);
    var right=new THREE.Vector3().setFromMatrixColumn(self.camera.matrix,0);
    var up=new THREE.Vector3(0,1,0);
    cam.target.addScaledVector(right,cam.panX*damp);
    cam.target.addScaledVector(up,cam.panY*damp);
    cam.target.y=G.clamp(cam.target.y,-4,14);
    cam.dtheta*=(1-damp);cam.dphi*=(1-damp);cam.dr*=(1-damp);
    cam.panX*=(1-damp);cam.panY*=(1-damp);
    applyCamera(0);
  }
};

/* 鼠标镜头控制 */
var dragging=null,lastX=0,lastY=0;
canvas.addEventListener('mousedown',function(ev){
  if(ev.button===1){dragging=ev.shiftKey?'pan':'orbit';lastX=ev.clientX;lastY=ev.clientY;ev.preventDefault();}
});
window.addEventListener('mousemove',function(ev){
  if(!dragging)return;
  var dx=ev.clientX-lastX,dy=ev.clientY-lastY;lastX=ev.clientX;lastY=ev.clientY;
  if(dragging==='orbit'){cam.dtheta=-dx*.0064;cam.dphi-=dy*.0064;}
  else{cam.panX=-dx*cam.radius*.0016;cam.panY=dy*cam.radius*.0016;}
});
window.addEventListener('mouseup',function(ev){if(ev.button===1)dragging=null;});
canvas.addEventListener('wheel',function(ev){
  ev.preventDefault();
  cam.dr+=ev.deltaY*.022;
},{passive:false});
canvas.addEventListener('contextmenu',function(ev){ev.preventDefault();});

/* ---------- 拾取 ---------- */
this.ray=new THREE.Raycaster();
this.ndc=new THREE.Vector2();
this.pickAt=function(cx,cy,objs){
  this.ndc.set((cx/window.innerWidth)*2-1,-(cy/window.innerHeight)*2+1);
  this.ray.setFromCamera(this.ndc,this.camera);
  return this.ray.intersectObjects(objs||this.pickables,true);
};

/* =========================================================
   地图构建
========================================================= */
this.setMap=function(def){
  this.mapDef=def;
  this.clearMap();
  var th=this.themes[def.theme];
  this.scene.fog.color.setHex(th.fog);
  this.scene.background=new THREE.Color(th.fog);
  this.buildEnvironment(def,th);
  this.buildBattlefield(def,th);
  this.bounds=this.computeBounds(def);
  this.resetCamera();
};
this.computeBounds=function(def){
  var xs=def.nodes.map(n=>n.x),zs=def.nodes.map(n=>n.z);
  return {minx:Math.min.apply(null,xs)-6,maxx:Math.max.apply(null,xs)+6,
          minz:Math.min.apply(null,zs)-6,maxz:Math.max.apply(null,zs)+6};
};
this.clearMap=function(){
  this.mapGroup.remove.apply(this.mapGroup,this.mapGroup.children.slice());
  this.routeGroup.remove.apply(this.routeGroup,this.routeGroup.children.slice());
  this.nodes={};this.edges=[];this.platforms=[];this.slots=[];this.pickables=[];
  this.curves=[];
};

/* 画布纹理工具 */
function canvasTex(w,h,draw){
  var c=document.createElement('canvas');c.width=w;c.height=h;
  var g=c.getContext('2d');draw(g,w,h);
  var t=new THREE.CanvasTexture(c);t.anisotropy=4;return t;
}
function textSprite(text,color,scale){
  var c=document.createElement('canvas');c.width=512;c.height=128;
  var g=c.getContext('2d');
  g.font='bold 54px "Microsoft YaHei UI",sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.shadowColor='#000';g.shadowBlur=18;
  g.fillStyle=color||'#bfeaff';g.fillText(text,256,66);
  var t=new THREE.CanvasTexture(c);
  var m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false});
  var s=new THREE.Sprite(m);s.scale.set(scale||4.2,(scale||4.2)/4,1);
  return s;
}

/* ---------- 战场底板 ---------- */
this.buildBattlefield=function(def,th){
  var b=this.computeBounds(def);
  var w=b.maxx-b.minx,d=b.maxz-b.minz,cx=(b.minx+b.maxx)/2,cz=(b.minz+b.maxz)/2;
  var slabMat=new THREE.MeshStandardMaterial({color:th.slab,metalness:.55,roughness:.45,
    emissive:th.accent,emissiveIntensity:.035});
  var slab=new THREE.Mesh(new THREE.BoxGeometry(w,.5,d),slabMat);
  slab.position.set(cx,-.5,cz);slab.receiveShadow=true;this.mapGroup.add(slab);
  // 底板网格纹理（发光网格）
  var gridTex=canvasTex(512,512,function(g,W,H){
    g.fillStyle='rgba(0,0,0,0)';g.fillRect(0,0,W,H);
    g.strokeStyle='rgba(70,170,220,.16)';g.lineWidth=2;
    for(var i=0;i<=8;i++){g.beginPath();g.moveTo(i*W/8,0);g.lineTo(i*W/8,H);g.stroke();
      g.beginPath();g.moveTo(0,i*H/8);g.lineTo(W,i*H/8);g.stroke();}
    g.strokeStyle='rgba(70,190,240,.35)';g.lineWidth=4;g.strokeRect(2,2,W-4,H-4);
  });
  gridTex.wrapS=gridTex.wrapT=THREE.RepeatWrapping;
  var cells=Math.round(Math.max(w,d)/4);
  gridTex.repeat.set(w/4,d/4);
  var grid=new THREE.Mesh(new THREE.PlaneGeometry(w-.2,d-.2),
    new THREE.MeshBasicMaterial({map:gridTex,transparent:true,opacity:.9}));
  grid.rotation.x=-Math.PI/2;grid.position.set(cx,-.235,cz);this.mapGroup.add(grid);

  // 悬浮装饰：四角悬浮支架
  [[b.minx+1.5,b.minz+1.5],[b.maxx-1.5,b.minz+1.5],[b.minx+1.5,b.maxz-1.5],[b.maxx-1.5,b.maxz-1.5]].forEach(function(p){
    var leg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,3.4,8),
      new THREE.MeshStandardMaterial({color:0x16324a,metalness:.8,roughness:.3,emissive:th.accent,emissiveIntensity:.1}));
    leg.position.set(p[0],-2.2,p[1]);self.mapGroup.add(leg);
    var lamp=new THREE.Mesh(new THREE.SphereGeometry(.18,10,10),
      new THREE.MeshBasicMaterial({color:th.accent}));
    lamp.position.set(p[0],-.1,p[1]);self.mapGroup.add(lamp);
  });

  this.buildEdges(def,th);
  this.buildNodes(def,th);
  this.buildPlatforms(def,th);
  this.buildObstacles(def,th);
};

/* ---------- 链路 ---------- */
function linkTexture(old){
  return canvasTex(256,64,function(g,W,H){
    var col=old?'#d99a3a':'#3db8e8', dim=old?'#3a2a10':'#0a2030';
    var grd=g.createLinearGradient(0,0,0,H);
    grd.addColorStop(0,dim);grd.addColorStop(.5,old?'#1c1405':'#0d2638');grd.addColorStop(1,dim);
    g.fillStyle=grd;g.fillRect(0,0,W,H);
    g.strokeStyle=col;g.lineWidth=3;g.globalAlpha=.85;
    g.beginPath();g.moveTo(0,3);g.lineTo(W,3);g.stroke();
    g.beginPath();g.moveTo(0,H-3);g.lineTo(W,H-3);g.stroke();
    g.globalAlpha=.9;g.fillStyle=col;
    for(var x=0;x<W;x+=32){
      g.beginPath();g.moveTo(x,H/2);g.lineTo(x+12,H/2-6);g.lineTo(x+12,H/2+6);g.closePath();g.fill();
    }
    if(old){g.globalAlpha=.5;g.strokeStyle='#8a5a1a';
      for(var i=0;i<14;i++){g.beginPath();g.moveTo(Math.random()*W,Math.random()*H);
        g.lineTo(Math.random()*W,Math.random()*H);g.stroke();}}
    g.globalAlpha=1;
  });
}
this.buildEdges=function(def,th){
  var self=this;
  def.edges.forEach(function(ed,idx){
    var a=def.nodes.find(function(n){return n.id===ed.a;});
    var b=def.nodes.find(function(n){return n.id===ed.b;});
    var len=Math.hypot(b.x-a.x,b.z-a.z);
    var arch=(ed.tunnel||ed.arch)?1.6:0;
    var curve;
    if(arch>0){
      var mid=new THREE.Vector3((a.x+b.x)/2,arch,(a.z+b.z)/2);
      curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x,.12,a.z),mid,new THREE.Vector3(b.x,.12,b.z)]);
    }else{
      curve=new StraightCurve(
        new THREE.Vector3(a.x,.12,a.z),new THREE.Vector3(b.x,.12,b.z));
    }
    self.curves[idx]=curve;
    var geoLen=curve.getLength();
    // 路面条带
    var tex=linkTexture(!!ed.old);
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1,Math.round(geoLen/2)),1);
    var ribbon=makeRibbon(curve,.62,new THREE.MeshStandardMaterial({map:tex,roughness:.6,metalness:.3,
      emissive:ed.old?0x664400:0x0a2a3a,emissiveIntensity:.5}));
    ribbon.userData.edgeIdx=idx;
    self.mapGroup.add(ribbon);
    // 两侧光管
    [-1,1].forEach(function(side){
      try{
      var oc=offsetCurve(curve,side*.62);
      var tube=new THREE.Mesh(new THREE.TubeGeometry(oc,Math.max(8,Math.round(geoLen*3)), .045,6,false),
        new THREE.MeshBasicMaterial({color:ed.old?0xffb84d:0x2ea8e0}));
      tube.position.y=.06;tube.userData.edgeIdx=idx;
      self.mapGroup.add(tube);
      }catch(err){console.error('tube edge fail',idx,ed,err.message);}
    });
    // 流动数据包
    var pkt=new THREE.Mesh(new THREE.BoxGeometry(.34,.18,.22),
      new THREE.MeshBasicMaterial({color:ed.old?0xffc45e:0x9feaff}));
    self.mapGroup.add(pkt);
    // 部署槽（链路）
    var spots=geoLen>7?[.34,.66]:[.5];
    spots.forEach(function(t){
      var p=curve.getPointAt(t);
      var slot={kind:'link',edge:idx,t:t,pos:p.clone(),mesh:null,tower:null};
      var ring=new THREE.Mesh(new THREE.RingGeometry(.5,.66,6),
        new THREE.MeshBasicMaterial({color:0x2f7da6,transparent:true,opacity:.32,side:THREE.DoubleSide}));
      ring.rotation.x=-Math.PI/2;ring.position.copy(p);ring.position.y+=.06;
      ring.userData.slot=slot;
      slot.mesh=ring;self.mapGroup.add(ring);self.slots.push(slot);self.pickables.push(ring);
    });
    self.edges.push({idx:idx,a:ed.a,b:ed.b,len:geoLen,curve:curve,old:!!ed.old,tunnel:!!ed.tunnel,
      ribbon:ribbon,tex:tex,packet:pkt,blocked:null,downgradeT:0});
  });
};
function StraightCurve(p0,p1){
  this.arcLengthDivisions=200;this.needsUpdate=false;this.cacheArcLengths=null;
  this.p0=p0;this.p1=p1;
}
StraightCurve.prototype=Object.create(THREE.Curve.prototype);
StraightCurve.prototype.constructor=StraightCurve;
StraightCurve.prototype.getPoint=function(t,opt){
  var r=opt||new THREE.Vector3();
  r.copy(this.p0).lerp(this.p1,t);return r;
};
StraightCurve.prototype.getTangent=function(t,opt){
  var r=opt||new THREE.Vector3();
  r.subVectors(this.p1,this.p0).normalize();return r;
};
function offsetCurve(curve,off){
  if(curve instanceof StraightCurve){
    var t0=curve.getTangentAt(0);
    var v=new THREE.Vector3(-t0.z*off,0,t0.x*off);
    return new StraightCurve(curve.p0.clone().add(v),curve.p1.clone().add(v));
  }
  var pts=[],n=14;
  for(var i=0;i<=n;i++){
    var t=i/n,p=curve.getPointAt(t),t2=curve.getTangentAt(t);
    p.x+=-t2.z*off;p.z+=t2.x*off;pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}
function makeRibbon(curve,width,mat){
  var seg=Math.max(8,Math.round(curve.getLength()*2));
  var pos=[],uv=[],idx=[];
  for(var i=0;i<=seg;i++){
    var t=i/seg,p=curve.getPointAt(t),tg=curve.getTangentAt(t);
    var nx=-tg.z,nz=tg.x;
    pos.push(p.x+nx*width,p.y+.02,p.z+nz*width, p.x-nx*width,p.y+.02,p.z-nz*width);
    uv.push(0,t,1,t);
    if(i<seg){var k=i*2;idx.push(k,k+1,k+2, k+1,k+3,k+2);}
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  return new THREE.Mesh(g,mat);
}

/* ---------- 节点 / 入口 / 出口 ---------- */
this.buildNodes=function(def,th){
  def.nodes.forEach(function(n){
    var g=new THREE.Group();g.position.set(n.x,0,n.z);
    var rec={def:n,group:g,sealed:false,core:null,ring:null,ring2:null,slot:null};
    if(n.type==='switch'){
      var base=new THREE.Mesh(new THREE.CylinderGeometry(.95,1.1,.5,8),
        new THREE.MeshStandardMaterial({color:0x122c44,metalness:.75,roughness:.32,emissive:0x0c2a40,emissiveIntensity:.6}));
      base.position.y=.25;base.castShadow=true;base.receiveShadow=true;g.add(base);
      var rim=new THREE.Mesh(new THREE.TorusGeometry(.96,.07,8,24),
        new THREE.MeshBasicMaterial({color:th.accent}));
      rim.rotation.x=Math.PI/2;rim.position.y=.52;g.add(rim);
      var core=new THREE.Mesh(new THREE.OctahedronGeometry(.36),
        new THREE.MeshStandardMaterial({color:0x0a3a4a,emissive:0x2af0d0,emissiveIntensity:1.1,metalness:.3,roughness:.2}));
      core.position.y=.95;g.add(core);rec.core=core;
      var ring=new THREE.Mesh(new THREE.TorusGeometry(.62,.035,6,28),
        new THREE.MeshBasicMaterial({color:0x37e2ff,transparent:true,opacity:.8}));
      ring.rotation.x=Math.PI/2;ring.position.y=1.05;g.add(ring);rec.ring=ring;
      // 槽位
      var slot={kind:'node',node:n.id,pos:new THREE.Vector3(n.x,.5,n.z),mesh:null,tower:null};
      var hit=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.7,8),
        new THREE.MeshBasicMaterial({visible:false}));
      hit.position.y=.4;hit.userData.slot=slot;
      slot.mesh=hit;g.add(hit);self.slots.push(slot);self.pickables.push(hit);
      rec.slot=slot;
    }else if(n.type==='entry'){
      var col=def.entryColors[n.id]||0x37e2ff;
      var pad=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.35,.45,6),
        new THREE.MeshStandardMaterial({color:0x0d2638,metalness:.7,roughness:.35,emissive:col,emissiveIntensity:.25}));
      pad.position.y=.22;pad.castShadow=true;g.add(pad);
      var arch=new THREE.Mesh(new THREE.TorusGeometry(1.05,.1,8,24,Math.PI),
        new THREE.MeshStandardMaterial({color:0x1a4a68,emissive:col,emissiveIntensity:.9,metalness:.4,roughness:.3}));
      arch.position.y=.45;g.add(arch);
      var beam=new THREE.Mesh(new THREE.PlaneGeometry(1.7,2.4),
        new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));
      beam.position.y=1.65;g.add(beam);rec.beam=beam;
      var lab=textSprite(n.name,'#9fe8ff',3.9);lab.position.y=3.5;g.add(lab);
      rec.beacon=new THREE.PointLight(col,.9,9);rec.beacon.position.y=1.5;g.add(rec.beacon);
    }else if(n.type==='exit'){
      var plat=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.75,.7,8),
        new THREE.MeshStandardMaterial({color:0x10243a,metalness:.8,roughness:.3,emissive:0x123a5a,emissiveIntensity:.7}));
      plat.position.y=.35;plat.castShadow=true;plat.receiveShadow=true;g.add(plat);
      var pillar=new THREE.Mesh(new THREE.CylinderGeometry(.5,.8,2.6,8),
        new THREE.MeshStandardMaterial({color:0x163a55,metalness:.6,roughness:.3,emissive:0x1c5a80,emissiveIntensity:.6}));
      pillar.position.y=1.9;pillar.castShadow=true;g.add(pillar);
      var orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.78,1),
        new THREE.MeshStandardMaterial({color:0x0a4458,emissive:0x37e2ff,emissiveIntensity:1.4,metalness:.2,roughness:.15}));
      orb.position.y=3.7;g.add(orb);rec.core=orb;
      var ring2=new THREE.Mesh(new THREE.TorusGeometry(1.15,.06,8,32),
        new THREE.MeshBasicMaterial({color:0x7ff0ff,transparent:true,opacity:.9}));
      ring2.rotation.x=Math.PI/2;ring2.position.y=3.7;g.add(ring2);rec.ring=ring2;
      var ring3=new THREE.Mesh(new THREE.TorusGeometry(1.5,.04,8,32),
        new THREE.MeshBasicMaterial({color:0x37e2ff,transparent:true,opacity:.5}));
      ring3.position.y=3.7;g.add(ring3);rec.ring2=ring3;
      var lx=textSprite(n.name,'#bfefff',4.2);lx.position.y=5.1;g.add(lx);
      rec.pl=new THREE.PointLight(0x37e2ff,1.4,14);rec.pl.position.y=4;g.add(rec.pl);
    }
    self.nodes[n.id]=rec;
    self.mapGroup.add(g);
  });
};

/* ---------- 设备平台 ---------- */
this.buildPlatforms=function(def,th){
  def.platforms.forEach(function(p){
    var g=new THREE.Group();g.position.set(p.x,0,p.z);
    var column=new THREE.Mesh(new THREE.CylinderGeometry(.28,.42,1.1,6),
      new THREE.MeshStandardMaterial({color:0x14304a,metalness:.7,roughness:.4,emissive:th.accent,emissiveIntensity:.08}));
    column.position.y=.55;column.castShadow=true;g.add(column);
    var pad=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.15,.24,6),
      new THREE.MeshStandardMaterial({color:0x1a3a2e,metalness:.5,roughness:.4,emissive:0x1fae86,emissiveIntensity:.28}));
    pad.position.y=1.18;pad.castShadow=true;pad.receiveShadow=true;g.add(pad);
    var rim=new THREE.Mesh(new THREE.TorusGeometry(1.02,.06,6,6),
      new THREE.MeshBasicMaterial({color:0x3fe8b8}));
    rim.rotation.x=Math.PI/2;rim.rotation.z=Math.PI/6;rim.position.y=1.31;g.add(rim);
    var slot={kind:'platform',plat:p.id,pos:new THREE.Vector3(p.x,1.32,p.z),mesh:null,tower:null};
    var hit=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.4,6),new THREE.MeshBasicMaterial({visible:false}));
    hit.position.y=1.32;hit.userData.slot=slot;slot.mesh=hit;g.add(hit);
    self.slots.push(slot);self.pickables.push(hit);
    self.platforms.push({def:p,group:g,rim:rim,slot:slot});
    self.mapGroup.add(g);
  });
};

/* ---------- 障碍 ---------- */
this.buildObstacles=function(def,th){
  def.obstacles.forEach(function(o){
    var g=new THREE.Group();g.position.set(o.x,0,o.z);
    if(o.kind==='facility'||o.kind==='datacenter'||o.kind==='plc'){
      var body=new THREE.Mesh(new THREE.BoxGeometry(o.w,o.h,o.d),
        new THREE.MeshStandardMaterial({color:o.kind==='plc'?0x2a2010:0x16283a,metalness:.6,roughness:.4,
          emissive:o.kind==='plc'?0x6a4a10:0x123a55,emissiveIntensity:.35}));
      body.position.y=o.h/2;body.castShadow=true;body.receiveShadow=true;g.add(body);
      // 指示灯列
      var n=Math.max(2,Math.floor(o.w/.5));
      for(var i=0;i<n;i++){
        var led=new THREE.Mesh(new THREE.BoxGeometry(.1,.06,.06),
          new THREE.MeshBasicMaterial({color:i%3===0?0xff5577:0x37e2ff}));
        led.position.set(-o.w/2+.35+i*(o.w-.7)/(n-1),o.h*.62,o.d/2+.04);
        led.userData.blink=Math.random()*3;g.add(led);
      }
      var lab=textSprite(o.name,'#8fb8d8',o.w*1.1);lab.position.y=o.h+.9;g.add(lab);
    }else if(o.kind==='airgap'){
      var pit=new THREE.Mesh(new THREE.BoxGeometry(o.w,.1,o.d),
        new THREE.MeshBasicMaterial({color:0x000000}));
      pit.position.y=.02;g.add(pit);
      var frame=new THREE.Mesh(new THREE.TorusGeometry(Math.min(o.w,o.d)/2,.08,8,4,Math.PI*2),
        new THREE.MeshBasicMaterial({color:0xb07cff}));
      frame.scale.set(o.w/Math.min(o.w,o.d),o.d/Math.min(o.w,o.d),1);
      frame.rotation.x=Math.PI/2;frame.position.y=.08;g.add(frame);
      for(var k=0;k<6;k++){
        var spark=new THREE.Mesh(new THREE.OctahedronGeometry(.12+Math.random()*.12),
          new THREE.MeshBasicMaterial({color:0xb07cff}));
        spark.position.set((Math.random()-.5)*o.w*.8,.25+Math.random()*1.6,(Math.random()-.5)*o.d*.8);
        spark.userData.spark={y:spark.position.y,s:Math.random()*2+1};g.add(spark);
      }
    }else if(o.kind==='publicflow'){
      // 横贯的公网流：半透明光墙 + 高速粒子
      var wall=new THREE.Mesh(new THREE.BoxGeometry(o.w,2.2,o.d),
        new THREE.MeshStandardMaterial({color:0x082a3a,emissive:0x1a80c0,emissiveIntensity:.55,
          transparent:true,opacity:.28,metalness:.2,roughness:.25}));
      wall.position.y=.9;g.add(wall);
      var N=120,arr=new Float32Array(N*3),spd=[];
      for(var i2=0;i2<N;i2++){arr[i2*3]=(Math.random()-.5)*o.w;arr[i2*3+1]=.2+Math.random()*1.9;arr[i2*3+2]=(Math.random()-.5)*o.d;spd.push(.04+Math.random()*.12);}
      var pg=new THREE.BufferGeometry();
      pg.setAttribute('position',new THREE.BufferAttribute(arr,3));
      var pts=new THREE.Points(pg,new THREE.PointsMaterial({color:0x8fe8ff,size:.14,transparent:true,opacity:.85}));
      pts.userData.flow={spd:spd,w:o.w};pts.userData.flowPts=pts;g.add(pts);
    }
    self.mapGroup.add(g);
  });
};

/* ---------- 节点状态 ---------- */
this.setNodeSealed=function(nodeId,sealed){
  var n=this.nodes[nodeId];if(!n)return;
  n.sealed=sealed;
  if(n.core){
    n.core.material.emissive.setHex(sealed?0xff4466:0x2af0d0);
    n.core.material.emissiveIntensity=sealed?1.6:1.1;
  }
  if(n.ring)n.ring.material.color.setHex(sealed?0xff5577:0x37e2ff);
};
this.setEdgeDowngrade=function(idx,on){
  var e=this.edges[idx];if(!e)return;
  // 简化：通过光管颜色与纹理表现
  e.downgradeT=on?999:0;
};
this.setEdgeBlocked=function(idx,kind){
  var e=this.edges[idx];if(!e||e.blocked===kind)return;
  if(e.blockedFx){this.mapGroup.remove(e.blockedFx);}
  e.blocked=kind;
  if(kind==='blackhole'){
    var bh=new THREE.Mesh(new THREE.TorusGeometry(.85,.18,10,32),
      new THREE.MeshBasicMaterial({color:0x8f7cff}));
    var p=e.curve.getPointAt(.5);bh.position.copy(p);bh.position.y+=.6;
    bh.userData.spin=1;this.mapGroup.add(bh);e.blockedFx=bh;
  }else if(kind==='lock'){
    var lk=new THREE.Mesh(new THREE.BoxGeometry(1.6,.16,1.2),
      new THREE.MeshBasicMaterial({color:0x7cff9e,transparent:true,opacity:.85}));
    var p2=e.curve.getPointAt(.5);lk.position.copy(p2);lk.position.y+=.2;
    this.mapGroup.add(lk);e.blockedFx=lk;
  }
};

/* =========================================================
   协议层 / 远景网络 / 数据流
========================================================= */
this.buildEnvironment=function(def,th){
  var theme=def.theme;
  // 协议层：纵深的多层网格平面
  this.protoLayers=[];
  var layerCols=[0x123a5a,0x0e2c48,0x0a2038];
  for(var i=0;i<3;i++){
    var plane=new THREE.Mesh(new THREE.PlaneGeometry(260,260,1,1),
      new THREE.MeshBasicMaterial({color:layerCols[i],transparent:true,opacity:.10-i*.02,wireframe:true}));
    plane.rotation.x=-Math.PI/2;plane.position.y=-6-i*7;
    this.envGroup.add(plane);this.protoLayers.push(plane);
  }
  // 协议层上的"数据包"点流
  var N=260,arr=new Float32Array(N*3),meta=[];
  for(var j=0;j<N;j++){arr[j*3]=(Math.random()-.5)*220;arr[j*3+1]=-7-Math.random()*16;arr[j*3+2]=(Math.random()-.5)*220;
    meta.push({v:1+Math.random()*3,a:Math.random()*Math.PI*2});}
  var pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(arr,3));
  var pmat=new THREE.PointsMaterial({color:th.accent,size:.22,transparent:true,opacity:.5});
  var pts=new THREE.Points(pg,pmat);pts.userData.meta=meta;this.envGroup.add(pts);this.protoPts=pts;

  // 远景网络集群
  this.clusters=[];
  var clusterCol=[0x2a7ab0,0x4a5fd0,0x20a088,0x8060c0];
  for(var c=0;c<10;c++){
    var a=(c/10)*Math.PI*2+Math.random()*.5,r=70+Math.random()*30;
    var cg=new THREE.Group();cg.position.set(Math.cos(a)*r, -4+Math.random()*10, Math.sin(a)*r);
    var cN=40,cArr=new Float32Array(cN*3);
    for(var k=0;k<cN;k++){cArr[k*3]=(Math.random()-.5)*22;cArr[k*3+1]=(Math.random()-.5)*14;cArr[k*3+2]=(Math.random()-.5)*22;}
    var cgGeo=new THREE.BufferGeometry();cgGeo.setAttribute('position',new THREE.BufferAttribute(cArr,3));
    var cPts=new THREE.Points(cgGeo,new THREE.PointsMaterial({color:clusterCol[c%4],size:.5,transparent:true,opacity:.75}));
    cg.add(cPts);
    // 集群内部连线
    var lines=[];
    for(var q=0;q<12;q++){var ia=Math.floor(Math.random()*cN),ib=Math.floor(Math.random()*cN);
      lines.push(cArr[ia*3],cArr[ia*3+1]+.1,cArr[ia*3+2],cArr[ib*3],cArr[ib*3+1]+.1,cArr[ib*3+2]);}
    var lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
    cg.add(new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:clusterCol[c%4],transparent:true,opacity:.25})));
    this.envGroup.add(cg);this.clusters.push(cg);
  }
  // 星点
  var sN=400,sArr=new Float32Array(sN*3);
  for(var s=0;s<sN;s++){var sa=Math.random()*Math.PI*2,sr=60+Math.random()*120;
    sArr[s*3]=Math.cos(sa)*sr;sArr[s*3+1]=10+Math.random()*70;sArr[s*3+2]=Math.sin(sa)*sr;}
  var sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sArr,3));
  this.envGroup.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0x9fc8ff,size:.35,transparent:true,opacity:.7})));

  // 往来数据流（曲线光带）
  this.streams=[];
  for(var st=0;st<6;st++){
    var a1=Math.random()*Math.PI*2,r1=40+Math.random()*20,a2=a1+.8+Math.random()*1.6,r2=40+Math.random()*20;
    var cv=new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a1)*r1,8+Math.random()*10,Math.sin(a1)*r1),
      new THREE.Vector3((Math.random()-.5)*60,20+Math.random()*14,(Math.random()-.5)*60),
      new THREE.Vector3(Math.cos(a2)*r2,8+Math.random()*10,Math.sin(a2)*r2)]);
    var tube=new THREE.Mesh(new THREE.TubeGeometry(cv,40,.05,5,false),
      new THREE.MeshBasicMaterial({color:th.accent,transparent:true,opacity:.18}));
    this.envGroup.add(tube);
    var pkt=new THREE.Mesh(new THREE.SphereGeometry(.22,8,8),new THREE.MeshBasicMaterial({color:th.accent}));
    this.envGroup.add(pkt);
    this.streams.push({cv:cv,pkt:pkt,t:Math.random(),spd:.02+Math.random()*.03});
  }
};

/* =========================================================
   路线可视化
========================================================= */
this.routeLines=null;this.previewLines=null;this.routeArrows=[];
this.showRoutes=function(routeSet){
  this.clearRoutes();
  var grp=new THREE.Group();
  var self=this;
  Object.keys(routeSet).forEach(function(entry){
    var path=routeSet[entry];if(!path)return;
    var col=self.mapDef.entryColors[entry]||0x37e2ff;
    path.edges.forEach(function(ei,ci){
      var e=self.edges[ei];
      var tube=new THREE.Mesh(new THREE.TubeGeometry(offsetCurve(e.curve,0),30,.07,6,false),
        new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.42}));
      tube.position.y=.28;tube.userData={entry:entry,ei:ei};
      grp.add(tube);
    });
    // 入口色小箭头：每条路径 3 个流动箭头
    for(var a=0;a<3;a++){
      var cone=new THREE.Mesh(new THREE.ConeGeometry(.2,.55,4),
        new THREE.MeshBasicMaterial({color:col}));
      cone.userData={path:path,t:(a/3),spd:.05+Math.random()*.02};
      grp.add(cone);self.routeArrows.push(cone);
    }
  });
  this.routeGroup.add(grp);this.routeLines=grp;
};
this.markChangedEdges=function(edgeSet){
  if(!this.routeLines)return;
  var self=this;
  this.routeLines.children.forEach(function(m){
    if(m.userData&&edgeSet.indexOf(m.userData.ei)>=0){
      G.tween({o:0},{o:1},.8,{onDone:function(){
        m.material.color.setHex(self.mapDef.entryColors[m.userData.entry]||0x37e2ff);
        m.material.opacity=.42;
      }});
      m.material.color.setHex(0xffffff);m.material.opacity=.95;
    }
  });
};
this.showPreview=function(routeSet,blockedInfo){
  this.hidePreview();
  var grp=new THREE.Group();var self=this;
  Object.keys(routeSet).forEach(function(entry){
    var path=routeSet[entry];if(!path)return;
    path.edges.forEach(function(ei){
      var e=self.edges[ei];
      var tube=new THREE.Mesh(new THREE.TubeGeometry(offsetCurve(e.curve,0),24,.09,6,false),
        new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75}));
      tube.position.y=.42;grp.add(tube);
    });
  });
  if(blockedInfo){
    var n=self.nodes[blockedInfo.node];
    if(n){
      var warn=new THREE.Mesh(new THREE.TorusGeometry(1.4,.08,8,32),
        new THREE.MeshBasicMaterial({color:0xff4466}));
      warn.rotation.x=Math.PI/2;warn.position.copy(n.group.position);warn.position.y=1.4;
      grp.add(warn);
    }
  }
  this.routeGroup.add(grp);this.previewLines=grp;
};
this.hidePreview=function(){
  if(this.previewLines){this.routeGroup.remove(this.previewLines);this.previewLines=null;}
};
this.clearRoutes=function(){
  if(this.routeLines){this.routeGroup.remove(this.routeLines);this.routeLines=null;}
  this.routeArrows=[];
  this.hidePreview();
};

/* ---------- 槽位高亮 ---------- */
this.highlightSlots=function(towerType,validOnly){
  var allow=G.TOWERS[towerType].loc;
  this.slots.forEach(function(s){
    if(s.tower)return;
    var ok=allow.indexOf(s.kind)>=0;
    if(s.mesh&&s.mesh.material){
      if(ok){s.mesh.material.color.setHex(0x37e2ff);s.mesh.material.opacity=Math.max(s.mesh.material.opacity,.55);
        if(s.kind!=='node')s.mesh.visible=true;}
    }
  });
};
this.resetSlotHighlights=function(){
  this.slots.forEach(function(s){
    if(s.kind==='link'&&s.mesh){s.mesh.material.color.setHex(0x2f7da6);s.mesh.material.opacity=.32;}
    if(s.kind==='platform'&&s.mesh){}
  });
};

/* =========================================================
   每帧更新
========================================================= */
this.render=function(dt){
  this.clock+=dt;var t=this.clock,self=this;
  // 节点动画
  Object.keys(this.nodes).forEach(function(id){
    var n=self.nodes[id];
    if(n.def.type==='switch'){
      if(n.core){n.core.rotation.y+=dt*.8;n.core.position.y=.95+Math.sin(t*2+id.length)*.06;}
      if(n.ring){n.ring.rotation.z+=dt*1.2*(n.sealed?.4:1);}
    }else if(n.def.type==='entry'){
      if(n.beam)n.beam.material.opacity=.12+Math.sin(t*3)*.05;
    }else if(n.def.type==='exit'){
      if(n.core){n.core.rotation.y+=dt*.7;n.core.rotation.x+=dt*.25;}
      if(n.ring)n.ring.rotation.z+=dt*.9;
      if(n.ring2)n.ring2.rotation.z-=dt*.6;
    }
  });
  // 平台环
  this.platforms.forEach(function(p){p.rim.rotation.z+=dt*.6;});
  // 链路纹理滚动 + 数据包
  this.edges.forEach(function(e,i){
    if(e.tex)e.tex.offset.x-=dt*(e.old?.012:.03);
    var u=(t*.12+i*.37)%1;
    var p=e.curve.getPointAt(u);p.y+=.3;e.packet.position.copy(p);
    e.packet.visible=true;
    if(e.blockedFx){
      if(e.blocked==='blackhole'){e.blockedFx.rotation.z+=dt*3;e.blockedFx.rotation.x+=dt*1.4;
        e.blockedFx.material.color.setHSL(.7+.12*Math.sin(t*4),.8,.6);}
    }
  });
  // 障碍动画
  this.mapGroup.traverse(function(o){
    if(o.userData.blink!==undefined){
      var ph=(t*2+o.userData.blink)%2;o.material.color.setHex(ph<1?0x37e2ff:0xff5577);
    }
    if(o.userData.spark){
      var s=o.userData.spark;o.position.y=s.y+Math.sin(t*s.s)*.3;o.rotation.y+=dt*s.s;
    }
    if(o.userData.flowPts){
      var pos=o.geometry.attributes.position,sp=o.userData.flowPts.sp,w=o.userData.flowPts.w;
      for(var i=0;i<sp.length;i++){var x=pos.getX(i)+sp[i];if(x>w/2)x=-w/2;pos.setX(i,x);}
      pos.needsUpdate=true;
    }
  });
  // 协议层
  this.protoLayers.forEach(function(l,i){l.material.opacity=.08-i*.02+Math.sin(t*.5+i)*.015;});
  if(this.protoPts){
    var pos=this.protoPts.geometry.attributes.position,m=this.protoPts.userData.meta;
    for(var i=0;i<m.length;i++){
      var x=pos.getX(i)+Math.cos(m[i].a)*m[i].v*dt;
      var z=pos.getZ(i)+Math.sin(m[i].a)*m[i].v*dt;
      pos.setX(i,x);pos.setZ(i,z);
    }
    pos.needsUpdate=true;
  }
  this.clusters.forEach(function(c,i){c.rotation.y+=dt*.02*(i%2?1:-1);});
  this.streams.forEach(function(s){s.t=(s.t+s.spd*dt)%1;var p=s.cv.getPointAt(s.t);s.pkt.position.copy(p);});
  // 路线箭头
  this.routeArrows.forEach(function(c){
    var path=c.userData;path.t=(path.t+path.spd*dt)%1;
    // 在整条路径上定位：按边长度分段
    var lens=path.path.edges.map(function(ei){return self.edges[ei].len;});
    var total=lens.reduce(function(a,b){return a+b;},0);
    var target=path.t*total,acc=0,ei=0,lt=0;
    for(var i=0;i<lens.length;i++){if(acc+lens[i]>=target){ei=i;lt=(target-acc)/lens[i];break;}acc+=lens[i];}
    var e=self.edges[path.path.edges[ei]];
    if(e){var pp=e.curve.getPointAt(lt);pp.y+=.55;c.position.copy(pp);
      var tg=e.curve.getTangentAt(lt);c.lookAt(pp.clone().add(tg));c.rotateX(Math.PI/2);}
  });
  G.updateTweens(dt);
  this.updateCamera(dt);
  this.renderer.render(this.scene,this.camera);
};

this.resize=function(){
  this.camera.aspect=window.innerWidth/window.innerHeight;this.camera.updateProjectionMatrix();
  this.renderer.setSize(window.innerWidth,window.innerHeight);
};
window.addEventListener('resize',function(){self.resize();});
};
