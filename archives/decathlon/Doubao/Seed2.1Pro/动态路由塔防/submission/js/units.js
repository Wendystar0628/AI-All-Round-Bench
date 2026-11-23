/* ================= 单位建模与动画、特效 ================= */
G.Units=(function(){
'use strict';
var THREE=window.THREE;

/* ---------- 小工具 ---------- */
function mat(color,o){return new THREE.MeshStandardMaterial(Object.assign({
  color:color,metalness:.55,roughness:.35},o||{}));}
function emis(color,intensity){return new THREE.MeshStandardMaterial({color:0x0a1a2a,emissive:color,emissiveIntensity:intensity,metalness:.3,roughness:.3});}
function box(w,h,d,color,o){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color,o));}
function cyl(rt,rb,h,seg,color,o){return new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||10),mat(color,o));}
function sph(r,color,o){return new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mat(color,o));}
function addAll(g,arr){arr.forEach(function(m){g.add(m);});}

function makeHealthBar(width){
  var g=new THREE.Group();
  var bg=new THREE.Sprite(new THREE.SpriteMaterial({color:0x0a1626,transparent:true,opacity:.85,depthTest:false}));
  bg.scale.set(width||1.4,.16,1);
  var fill=new THREE.Sprite(new THREE.SpriteMaterial({color:0x33dd88,depthTest:false}));
  fill.scale.set((width||1.4)*.96,.1,1);
  fill.position.z=.002;
  g.add(bg,fill);g.userData.fill=fill;g.userData.w=width||1.4;
  g.renderOrder=20;
  return g;
}
function setHealthBar(bar,frac,color){
  frac=G.clamp(frac,0,1);
  bar.userData.fill.scale.x=bar.userData.w*.96*frac;
  bar.userData.fill.position.x=-(bar.userData.w*.96)*(1-frac)/2;
  if(color)bar.userData.fill.material.color.setHex(color);
}

/* =========================================================
   塔模型
   返回 {group, parts, update(dt,state)}
========================================================= */
function towerBase(radius,h,color){
  var g=new THREE.Group();
  var b=cyl(radius,radius*1.15,h||.35,6,0x122c44,{metalness:.8,roughness:.3,emissive:color,emissiveIntensity:.15});
  b.position.y=h/2||.18;b.castShadow=true;g.add(b);
  var rim=new THREE.Mesh(new THREE.TorusGeometry(radius*.95,.035,6,6),
    new THREE.MeshBasicMaterial({color:color}));
  rim.rotation.x=Math.PI/2;rim.position.y=h||.35;g.add(rim);
  g.userData.rim=rim;
  return g;
}

function makeFirewall(level,branch,onNode){
  var g=towerBase(onNode?1.05:.8,.4,0x4da6ff);
  var plates=[];
  var n=onNode?6:3,h=onNode?1.3:1.0;
  for(var i=0;i<n;i++){
    var pl=box(.16,h*(level>1?1.25:1),.5, 0x1c4a78,{emissive:0x125a90,emissiveIntensity:.6});
    if(!onNode){pl.position.set((i-(n-1)/2)*.26,.4+h/2,0);}
    else{var a=i/n*Math.PI*2;pl.position.set(Math.sin(a)*.55,.4+h/2,Math.cos(a)*.55);pl.rotation.y=a;}
    pl.userData.hitT=0;plates.push(pl);g.add(pl);
    var strip=box(.05,h*.7,.04,0x6fd4ff,{emissive:0x37cfff,emissiveIntensity:1.4});
    strip.position.copy(pl.position);strip.position.y+=.05;strip.rotation.y=pl.rotation.y;
    if(onNode){strip.position.x=Math.sin((i/n)*Math.PI*2)*.64;strip.position.z=Math.cos((i/n)*Math.PI*2)*.64;}
    else{strip.position.x+=(i-(n-1)/2)*.26*.2;}
    g.add(strip);
  }
  var core=sph(level>1?.26:.18, 0x8fe8ff,{emissive:0x37cfff,emissiveIntensity:level>1?1.6:1});
  core.position.y=.4+h+.25;g.add(core);
  if(level>1){
    var crown=new THREE.Mesh(new THREE.TorusGeometry(.42,.06,8,6),
      new THREE.MeshBasicMaterial({color:0x8fe8ff}));
    crown.rotation.x=Math.PI/2;crown.position.y=.4+h+.25;g.add(crown);
  }
  return {group:g,parts:{plates:plates,core:core},update:function(dt,st){
    core.rotation.y+=dt*2;
    var swing=st.attacking?Math.sin(st.attackT*18)*.08:0;
    plates.forEach(function(p){p.position.x; p.rotation.z=swing;p.userData.hitT=Math.max(0,p.userData.hitT-dt*4);
      p.material.emissiveIntensity=.6+p.userData.hitT*2;});
  }};
}

function makeHoneypot(level,branch){
  var g=towerBase(.7,.3,0xffb44d);
  var pot=new THREE.Mesh(new THREE.CylinderGeometry(.5,.36,.55,12),
    mat(0x7a4a10,{emissive:0xff9c2a,emissiveIntensity:.5,roughness:.5}));
  pot.position.y=.6;pot.castShadow=true;g.add(pot);
  var honey=sph(.36,0xffc85e,{emissive:0xffaa30,emissiveIntensity:1.1,roughness:.25});
  honey.position.y=.88;honey.scale.y=.7;g.add(honey);
  var decoys=[];
  var nd=level>1?4:3;
  for(var i=0;i<nd;i++){
    var bit=sph(.1,0xffe08a,{emissive:0xffc040,emissiveIntensity:1.2});
    bit.userData.a=i/nd*Math.PI*2;g.add(bit);decoys.push(bit);
  }
  if(level>1){
    if(branch==='deep'){
      var swirl=new THREE.Mesh(new THREE.TorusKnotGeometry(.26,.07,40,8),
        emis(0xff8a2a,1.3));
      swirl.position.y=1.35;g.add(swirl);g.userData.swirl=swirl;
    }else{
      var spike=new THREE.Mesh(new THREE.ConeGeometry(.34,.6,6),emis(0xff5a3c,1.2));
      spike.position.y=1.3;g.add(spike);g.userData.swirl=spike;
    }
  }
  return {group:g,parts:{decoys:decoys,honey:honey},update:function(dt,st){
    var t=st.time;
    decoys.forEach(function(b){var a=b.userData.a+t*1.6;
      b.position.set(Math.sin(a)*.75,1.05+Math.sin(t*3+b.userData.a)*.12,Math.cos(a)*.75);});
    honey.scale.y=.7+Math.sin(t*4)*.05;
    if(g.userData.swirl){g.userData.swirl.rotation.y+=dt*2.2;g.userData.swirl.rotation.x+=dt*1.3;}
  }};
}

function makeGate(level,branch){
  var g=towerBase(.95,.3,0x8fd0ff);
  function arm(y,len,col){
    var a=new THREE.Group();
    var bar=box(len,.22,.16,0x24507a,{emissive:0x2a80c0,emissiveIntensity:.5});
    a.add(bar);
    for(var i=-2;i<=2;i++){
      var stripe=box(.12,.25,.18,col,{emissive:col,emissiveIntensity:1.2});
      stripe.position.x=i*len/5;a.add(stripe);
    }
    a.position.y=y;a.userData.baseY=y;
    g.add(a);return a;
  }
  var a1=arm(.75,level>1?2.0:1.6,0xffd25c);
  var a2=level>1?arm(1.15,2.0,0xff7a5c):null;
  [-1,1].forEach(function(s){
    var post=cyl(.09,.12,.9,8,0x1a3a55,{emissive:0x2a80c0,emissiveIntensity:.4});
    post.position.set(s*.75,.65,0);g.add(post);
  });
  var beacon=new THREE.Mesh(new THREE.SphereGeometry(.12,10,10),emis(0xff5577,1.4));
  beacon.position.y=1.35;g.add(beacon);
  return {group:g,parts:{a1:a1,a2:a2,beacon:beacon},update:function(dt,st){
    a1.rotation.y=Math.sin(st.time*1.5)*.06;
    if(a2)a2.rotation.y=-a1.rotation.y;
    beacon.material.emissiveIntensity=1+Math.sin(st.time*5)*.6;
  }};
}

function makeInterceptor(level,branch){
  var g=towerBase(.8,.3+ (0),0x5ef0c0);
  var head=new THREE.Group();head.position.y=.55;g.add(head);
  var dome=sph(.38,0x0f3a32,{emissive:0x14b890,emissiveIntensity:.7,roughness:.25});
  dome.scale.y=.8;head.add(dome);
  var barrel=new THREE.Group();
  if(level>1&&branch==='pierce'){
    var rail=box(.12,.12,1.7,0x9fffe4,{emissive:0x2af0c8,emissiveIntensity:1.2});
    rail.position.z=-.7;barrel.add(rail);
    [-1,1].forEach(function(s){var r2=box(.06,.06,1.3,0x1d8a70,{emissive:0x2af0c8,emissiveIntensity:.7});
      r2.position.set(s*.16,-.12,-.55);barrel.add(r2);});
    var tip=new THREE.Mesh(new THREE.ConeGeometry(.1,.3,8),emis(0xffffff,1.4));
    tip.rotation.x=Math.PI/2;tip.position.z=-1.55;barrel.add(tip);
  }else if(level>1&&branch==='suppress'){
    [-1,1].forEach(function(s){
      var coil=new THREE.Mesh(new THREE.TorusGeometry(.16,.06,8,16),emis(0x6fb8ff,1.3));
      coil.position.set(s*.28,.05,-.7);coil.rotation.x=Math.PI/2;barrel.add(coil);
      var nb=box(.1,.1,.9,0x9fd0ff,{emissive:0x6fb8ff,emissiveIntensity:1});
      nb.position.set(s*.28,0,-.45);barrel.add(nb);
    });
    var core2=sph(.16,0xbfd8ff,{emissive:0x6fb8ff,emissiveIntensity:1.4});core2.position.z=-.2;barrel.add(core2);
  }else{
    var b1=box(.14,.14,1.0,0x8fffe0,{emissive:0x2af0c8,emissiveIntensity:1});
    b1.position.z=-.45;barrel.add(b1);
    var eye=sph(.13,0xbafff0,{emissive:0x2af0c8,emissiveIntensity:1.3});eye.position.z=-.1;barrel.add(eye);
  }
  head.add(barrel);
  return {group:g,parts:{head:head,barrel:barrel},update:function(dt,st){
    if(st.aim!==undefined)head.rotation.y=st.aim;
    if(st.firing>0){barrel.position.z=-.12*st.firing;}else barrel.position.z=0;
    dome.material.emissiveIntensity=.7+Math.sin(st.time*3)*.15;
  }};
}

function makeSandbox(level,branch){
  var g=towerBase(.8,.3,0xb08cff);
  var chamber=new THREE.Mesh(new THREE.OctahedronGeometry(.5),
    new THREE.MeshStandardMaterial({color:0x241840,emissive:0x8a5cff,emissiveIntensity:.8,transparent:true,opacity:.85,metalness:.2,roughness:.15}));
  chamber.position.y=.95;g.add(chamber);
  var inner=sph(.2,0xd6b3ff,{emissive:0xb07cff,emissiveIntensity:1.5});
  inner.position.y=.95;g.add(inner);
  var probes=[];var np=level>1?4:3;
  for(var i=0;i<np;i++){
    var p=cyl(.03,.03,.7,6,0x6a4ac0,{emissive:0xb07cff,emissiveIntensity:1});
    p.userData.a=i/np*Math.PI*2;
    var tip=sph(.08,0xd6b3ff,{emissive:0xb07cff,emissiveIntensity:1.3});
    tip.userData.isTip=true;p.add(tip);tip.position.y=.4;
    g.add(p);probes.push(p);
  }
  if(level>1){
    var ring=new THREE.Mesh(new THREE.TorusGeometry(.68,.04,8,24),emis(0xd6b3ff,1));
    ring.rotation.x=Math.PI/2;ring.position.y=.55;g.add(ring);
  }
  return {group:g,parts:{chamber:chamber,inner:inner,probes:probes},update:function(dt,st){
    chamber.rotation.y+=dt*1.1;chamber.rotation.x+=dt*.5;
    inner.scale.setScalar(1+Math.sin(st.time*5)*.12);
    probes.forEach(function(p,i){var a=p.userData.a+st.time*.9;
      p.position.set(Math.sin(a)*.75,.9,Math.cos(a)*.75);p.lookAt(0,.9,0);
      p.rotation.z+=Math.PI;});
    if(st.pulse>0){chamber.scale.setScalar(1+st.pulse*.25);}else chamber.scale.setScalar(1);
  }};
}

function makeRepair(level,branch){
  var g=towerBase(.75,.3,0x6fe08a);
  var drone=new THREE.Group();drone.position.y=1;g.add(drone);
  var body=cyl(.3,.38,.22,8,0x14401f,{emissive:0x2fd06a,emissiveIntensity:.6});
  drone.add(body);
  var cross=new THREE.Group();
  function armBar(x){var a=box(.5,.1,.1,0x9fffb0,{emissive:0x57e389,emissiveIntensity:1.3});a.position.x=x;cross.add(a);}
  armBar(.28);armBar(-.28);
  var ab=box(.1,.1,.5,0x9fffb0,{emissive:0x57e389,emissiveIntensity:1.3});cross.add(ab);
  var ab2=ab.clone();ab2.position.z=.28;cross.add(ab2);ab.position.z=-.28;
  cross.position.y=.16;drone.add(cross);
  var halo=new THREE.Mesh(new THREE.TorusGeometry(.5,.035,8,24),emis(0x7dffaa,1));
  halo.rotation.x=Math.PI/2;halo.position.y=-.05;drone.add(halo);
  if(level>1){
    var orb=sph(.12,0xcaffd8,{emissive:0x7dffaa,emissiveIntensity:1.5});
    orb.position.y=.42;drone.add(orb);drone.userData.orb=orb;
  }
  return {group:g,parts:{drone:drone,cross:cross,halo:halo},update:function(dt,st){
    drone.position.y=1+Math.sin(st.time*2.2)*.12;
    cross.rotation.y+=dt*.8;halo.rotation.z+=dt*2;
    if(st.healPulse>0){halo.scale.setScalar(1+st.healPulse*.8);halo.material.opacity=1;}
    else{halo.scale.setScalar(1);}
  }};
}

var TOWER_FACTORIES={firewall:makeFirewall,honeypot:makeHoneypot,gate:makeGate,interceptor:makeInterceptor,sandbox:makeSandbox,repair:makeRepair};
function makeTowerMesh(type,level,branch,locKind){
  var f=TOWER_FACTORIES[type];
  var r=f(level||1,branch,type==='firewall'&&locKind==='node');
  r.group.traverse(function(o){if(o.isMesh)o.castShadow=true;});
  r.bar=makeHealthBar(1.5);
  r.bar.position.y=2.1;r.group.add(r.bar);
  return r;
}

/* =========================================================
   敌人模型
========================================================= */
function makeWorm(){
  var g=new THREE.Group();var segs=[];
  for(var i=0;i<6;i++){
    var r=.34-i*.03;
    var s=sph(r,i===0?0xff8a4d:0xd8442e,{emissive:i===0?0xff5a2a:0x6a1410,emissiveIntensity:i===0?.8:.35,roughness:.4});
    s.userData.off=i;segs.push(s);g.add(s);
  }
  var eye=sph(.07,0xffee66,{emissive:0xffee44,emissiveIntensity:2});eye.position.set(.13,.1,-.3);g.add(eye);
  var eye2=eye.clone();eye2.position.x=-.13;g.add(eye2);
  g.userData.segs=segs;
  return g;
}
function makeFlood(){
  var g=new THREE.Group();
  var blobs=[];
  [[0,0,0,.55],[.4,.15,.2,.38],[-.38,.1,-.15,.36],[.1,.25,-.4,.3]];
  var arr=arguments;
  [[0,0,0,.55],[.4,.15,.2,.38],[-.38,.1,-.15,.36],[.1,.25,-.4,.3]].forEach(function(p){
    var b=sph(p[3],0x2fc8ff,{transparent:true,opacity:.78,emissive:0x0a90d0,emissiveIntensity:.55,roughness:.12});
    b.position.set(p[0],p[1]+p[3],p[2]);blobs.push(b);g.add(b);
  });
  var core=sph(.18,0xe0fbff,{emissive:0x8fe8ff,emissiveIntensity:1.6});core.position.y=.6;g.add(core);
  g.userData.blobs=blobs;g.userData.core=core;
  return g;
}
function makeTrojan(){
  var g=new THREE.Group();
  // 伪装态：普通数据包
  var pack=box(.62,.62,.62,0x9aa8b8,{roughness:.45,metalness:.3});
  pack.position.y=.35;g.add(pack);
  var strap=box(.66,.12,.66,0xc8d4e0);strap.position.y=.45;g.add(strap);
  var label=new THREE.Mesh(new THREE.PlaneGeometry(.4,.2),
    new THREE.MeshBasicMaterial({map:makeLabelTex('DATA'),transparent:true}));
  label.position.set(0,.32,.321);g.add(label);
  // 显形态（隐藏）
  var real=new THREE.Group();real.visible=false;
  var body=new THREE.Mesh(new THREE.IcosahedronGeometry(.38,0),
    mat(0x6a2a9a,{emissive:0xa04cff,emissiveIntensity:.7,flatShading:true}));
  body.position.y=.4;real.add(body);
  for(var i=0;i<5;i++){
    var sp=new THREE.Mesh(new THREE.ConeGeometry(.08,.3,5),emis(0xd6b3ff,1.2));
    var a=i/5*Math.PI*2;sp.position.set(Math.sin(a)*.36,.55,Math.cos(a)*.36);sp.rotation.z=Math.PI;
    real.add(sp);
  }
  var e1=sph(.07,0xffff66,{emissive:0xffee44,emissiveIntensity:2});e1.position.set(.14,.48,-.3);real.add(e1);
  var e2=e1.clone();e2.position.x=-.14;real.add(e2);
  g.add(real);
  g.userData.pack=pack;g.userData.strap=strap;g.userData.label=label;g.userData.real=real;
  return g;
}
function makeLabelTex(txt){
  var c=document.createElement('canvas');c.width=128;c.height=64;var g2=c.getContext('2d');
  g2.fillStyle='#dfe8f2';g2.fillRect(0,0,128,64);g2.fillStyle='#2a3a4a';g2.font='bold 26px Consolas';g2.textAlign='center';
  g2.fillText(txt,64,42);return new THREE.CanvasTexture(c);
}
function makeRansom(){
  var g=new THREE.Group();
  var body=cyl(.3,.38,.7,8,0x8a6a10,{emissive:0xffc020,emissiveIntensity:.35,roughness:.4});
  body.position.y=.5;g.add(body);
  var head=box(.4,.34,.4,0xffd23d,{emissive:0xffc020,emissiveIntensity:.6});
  head.position.y=.98;g.add(head);
  var shackle=new THREE.Mesh(new THREE.TorusGeometry(.16,.05,6,12,Math.PI),
    emis(0xffe88a,1));shackle.position.y=1.18;g.add(shackle);
  var keyhole=cyl(.05,.05,.04,8,0x1a1200);keyhole.rotation.x=Math.PI/2;keyhole.position.set(0,.98,-.21);g.add(keyhole);
  return g;
}
function makeAP(){
  var g=new THREE.Group();
  var body=new THREE.Mesh(new THREE.ConeGeometry(.34,.5,8),mat(0xc060a0,{emissive:0xff6fc0,emissiveIntensity:.6}));
  body.position.y=0;body.rotation.x=Math.PI;g.add(body);
  var hub=sph(.16,0xffc0e8,{emissive:0xff8fd8,emissiveIntensity:1.2});g.add(hub);
  var rot=new THREE.Group();
  var blade=box(1.0,.03,.12,0x9fe8ff,{emissive:0x5fb8e0,emissiveIntensity:.6});
  rot.add(blade);var blade2=blade.clone();blade2.rotation.y=Math.PI/2;rot.add(blade2);
  rot.position.y=.12;g.add(rot);g.userData.rot=rot;
  var antenna=cyl(.02,.02,.5,6,0xff8fd8,{emissive:0xff8fd8,emissiveIntensity:1});
  antenna.position.y=-.4;g.add(antenna);
  g.userData.flyHeight=2.6;
  return g;
}
function makePacker(){
  var g=new THREE.Group();
  var shell=new THREE.Mesh(new THREE.SphereGeometry(.52,10,8,0,Math.PI*2,0,Math.PI/2),
    mat(0x4a5aa0,{emissive:0x2a3a90,emissiveIntensity:.4,roughness:.3}));
  shell.position.y=.4;shell.rotation.x=Math.PI;g.add(shell);
  var body=sph(.42,0x8fa0e0,{emissive:0x5068c0,emissiveIntensity:.4});body.position.y=.36;g.add(body);
  var e1=sph(.08,0x9fffe4,{emissive:0x57e3a0,emissiveIntensity:1.5});e1.position.set(.16,.5,-.34);g.add(e1);
  var e2=e1.clone();e2.position.x=-.16;g.add(e2);
  var bubble=new THREE.Mesh(new THREE.SphereGeometry(.9,16,12,0,Math.PI*2,0,Math.PI/2.3),
    new THREE.MeshBasicMaterial({color:0x8fd0ff,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false}));
  bubble.position.y=.25;g.add(bubble);g.userData.bubble=bubble;
  return g;
}
/* Boss */
function makeWankui(){
  var g=new THREE.Group();
  var body=sph(1.0,0x5a0a18,{emissive:0xff2244,emissiveIntensity:.55,roughness:.35});
  body.position.y=1.1;body.scale.set(1,.85,1);g.add(body);
  var crown=new THREE.Mesh(new THREE.ConeGeometry(.8,1.1,6),emis(0xff4466,1.1));
  crown.position.y=2.2;g.add(crown);
  for(var i=0;i<5;i++){var sp=crown.clone();sp.scale.setScalar(.3);
    sp.position.set(Math.sin(i/5*Math.PI*2)*.7,2.0,Math.cos(i/5*Math.PI*2)*.7);g.add(sp);}
  var legs=[];
  for(var l=0;l<6;l++){
    var a=l/6*Math.PI*2,lg=new THREE.Group();
    var seg1=cyl(.1,.14,.9,6,0x7a1020,{emissive:0xff3355,emissiveIntensity:.3});
    seg1.position.y=-.45;lg.add(seg1);
    lg.position.set(Math.sin(a)*.9,.8,Math.cos(a)*.9);
    lg.rotation.y=a;lg.userData.a=a;legs.push(lg);g.add(lg);
  }
  var eye=sph(.22,0xffe050,{emissive:0xffcc22,emissiveIntensity:2});
  eye.position.set(0,1.25,-.85);g.add(eye);
  g.userData.legs=legs;g.userData.eye=eye;
  return g;
}
function makeShenlou(){
  var g=new THREE.Group();
  var core=new THREE.Mesh(new THREE.IcosahedronGeometry(.8,1),
    mat(0x2a1a6a,{emissive:0x8f7cff,emissiveIntensity:.8,flatShading:true}));
  core.position.y=1.4;g.add(core);
  var shards=[];
  for(var i=0;i<9;i++){
    var s=new THREE.Mesh(new THREE.TetrahedronGeometry(.28+Math.random()*.18),
      mat(0x6a54d0,{emissive:0x8f7cff,emissiveIntensity:.9,flatShading:true,transparent:true,opacity:.85}));
    s.userData.a=i/9*Math.PI*2;s.userData.r=1.1+Math.random()*.4;s.userData.sp=.5+Math.random();
    g.add(s);shards.push(s);
  }
  var ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.06,8,32),emis(0xb0a0ff,.9));
  ring.rotation.x=Math.PI/2;ring.position.y=1.4;g.add(ring);
  var eye=sph(.2,0xffffff,{emissive:0xc8b8ff,emissiveIntensity:2});eye.position.y=1.4;g.add(eye);
  g.userData.shards=shards;g.userData.ring=ring;g.userData.core=core;
  return g;
}
function makeZheying(){
  var g=new THREE.Group();
  var body=sph(.85,0x104a24,{emissive:0x33dd66,emissiveIntensity:.45,roughness:.3,flatShading:true});
  body.position.y=.8;body.scale.set(1.2,.8,1.5);g.add(body);
  // 钳
  [-1,1].forEach(function(s){
    var claw=new THREE.Mesh(new THREE.ConeGeometry(.22,.7,6),emis(0x7cff9e,.8));
    claw.position.set(s*.7,.5,-1.1);claw.rotation.x=-Math.PI/2;g.add(claw);
  });
  // 尾巴
  var tail=new THREE.Group();
  for(var i=0;i<5;i++){
    var s=sph(.28-i*.03,0x1a6a36,{emissive:0x44ee80,emissiveIntensity:.5});
    s.position.set(0,.2+i*.28,i*.3);tail.add(s);
  }
  var sting=new THREE.Mesh(new THREE.ConeGeometry(.18,.6,6),emis(0xa0ffc0,1.3));
  sting.position.set(0,1.7,1.5);sting.rotation.x=Math.PI/3;tail.add(sting);
  tail.position.z=.5;g.add(tail);
  var legs=[];
  for(var l=0;l<6;l++){
    var a=Math.PI/2+ (l<3?1:-1)*(l%3+1)*.5;
    var leg=cyl(.07,.11,.8,6,0x0a3a1c,{emissive:0x2fbb58,emissiveIntensity:.3});
    leg.position.set((l<3?-1:1)*.8,.35,(l%3-1)*.6);
    leg.rotation.z=(l<3?.5:-.5);g.add(leg);legs.push(leg);
  }
  var eye=sph(.18,0xeeff66,{emissive:0xccff33,emissiveIntensity:2});eye.position.set(0,.9,-1.05);g.add(eye);
  g.userData.tail=tail;g.userData.eye=eye;g.userData.body=body;
  return g;
}
var ENEMY_FACTORIES={worm:makeWorm,flood:makeFlood,trojan:makeTrojan,ransom:makeRansom,ap:makeAP,packer:makePacker,
  wankui:makeWankui,shenlou:makeShenlou,zheying:makeZheying};

function makeEnemyMesh(type){
  var g=ENEMY_FACTORIES[type]();
  g.traverse(function(o){if(o.isMesh)o.castShadow=true;});
  var scale=G.ENEMIES[type].scale||1;g.scale.setScalar(scale*(G.ENEMIES[type].boss?1:1));
  g.userData.animTime=Math.random()*5;
  var bar=makeHealthBar(G.ENEMIES[type].boss?2.6:1.3);
  var h=G.ENEMIES[type].flying?3.2:(G.ENEMIES[type].boss?3.8:1.5);
  bar.position.y=h;g.add(bar);
  return {group:g,bar:bar};
}

/* 敌人模型驱动 */
function updateEnemyModel(em,type,st){
  var g=em.group,ud=g.userData,t=st.time;
  ud.animTime+=st.dt;
  if(type==='worm'){
    ud.segs.forEach(function(s,i){
      var a=ud.animTime*6-i*.55;
      s.position.set(Math.sin(a)*.12*(i/6),.34-i*.015,-i*.22+Math.cos(a)*.05);
    });
  }else if(type==='flood'){
    ud.blobs.forEach(function(b,i){b.scale.setScalar(1+Math.sin(t*4+i*1.7)*.12);b.position.y+=(Math.random()-.5)*0;});
    ud.core.position.y=.6+Math.sin(t*5)*.12;
  }else if(type==='trojan'){
    if(st.revealed!==undefined){
      var rv=st.revealed;
      ud.real.visible=rv;ud.pack.visible=!rv;ud.strap.visible=!rv;ud.label.visible=!rv;
      if(rv){ud.real.rotation.y+=st.dt*2;ud.real.children[0].position.y=.4+Math.sin(t*4)*.06;}
    }
  }else if(type==='ap'){
    if(ud.rot)ud.rot.rotation.y+=st.dt*18;
    g.position.y=(g.userData.baseY||0)+Math.sin(t*2.5)*.18;
  }else if(type==='packer'){
    if(ud.bubble)ud.bubble.material.opacity=.1+Math.sin(t*3)*.04;
  }else if(type==='wankui'){
    ud.legs.forEach(function(l,i){l.rotation.x=Math.sin(t*3+i)*.3;});
    ud.eye.scale.setScalar(1+Math.sin(t*6)*.15);
  }else if(type==='shenlou'){
    if(ud.core)ud.core.rotation.y+=st.dt*1.4;
    if(ud.ring)ud.ring.rotation.z+=st.dt*1.2;
    ud.shards.forEach(function(s){var a=s.userData.a+t*s.userData.sp;
      s.position.set(Math.sin(a)*s.userData.r,1.4+Math.sin(t*2+s.userData.a)*.3,Math.cos(a)*s.userData.r);
      s.rotation.y+=st.dt*2;s.rotation.x+=st.dt*1.3;});
  }else if(type==='zheying'){
    if(ud.tail)ud.tail.rotation.x=Math.sin(t*2.2)*.18-.05;
    if(ud.eye)ud.eye.scale.setScalar(1+Math.sin(t*5)*.2);
    if(st.stage!==undefined){
      var op=st.stage===0?.35:(st.stage===1?1:.9);
      ud.body.material.transparent=true;ud.body.material.opacity=op;
    }
  }
  // 通用：攻击前压
  if(st.attackT>0){g.scale.z=1+Math.sin(st.attackT*14)*.06;}
}

/* 状态视觉挂接 */
function attachShieldBubble(group,r,color){
  var b=new THREE.Mesh(new THREE.SphereGeometry(r||.8,16,12),
    new THREE.MeshBasicMaterial({color:color||0x6fb8ff,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false}));
  b.position.y=(r||.8)*.7;group.add(b);return b;
}
function attachEncryptRing(group){
  var r=new THREE.Mesh(new THREE.TorusGeometry(.55,.05,6,20),
    new THREE.MeshBasicMaterial({color:0xffd23d}));
  r.rotation.x=Math.PI/2;r.position.y=1.2;group.add(r);return r;
}

/* =========================================================
   特效（自管理寿命，返回 update 方法给 Game）
========================================================= */
var FX={};
FX.beam=function(fxGroup,from,to,color,thick){
  var dir=new THREE.Vector3().subVectors(to,from);var len=dir.length();
  var m=new THREE.Mesh(new THREE.CylinderGeometry(thick||.05,thick||.05,len,6),
    new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:.95}));
  m.position.copy(from).addScaledVector(dir,.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  fxGroup.add(m);
  return {life:.16,max:.16,obj:m,update:function(k){m.material.opacity=.95*(1-k);}};
};
FX.projectile=function(fxGroup,from,to,speed,color,onDone){
  var p=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),
    new THREE.MeshBasicMaterial({color:color}));
  p.position.copy(from);
  var dir=new THREE.Vector3().subVectors(to,from);var dist=dir.length();
  fxGroup.add(p);
  return {life:dist/speed,max:dist/speed,obj:p,from:from.clone(),to:to.clone(),dir:dir.clone().normalize(),sp:speed,d:0,
    update:function(k,dt){this.d+=dt*this.speed;var k2=G.clamp(this.d/dist,0,1);
      p.position.copy(from).lerp(to,k2);
      if(k2>=1){if(onDone)onDone();}}};
};
FX.ring=function(fxGroup,pos,color,maxR){
  var m=new THREE.Mesh(new THREE.TorusGeometry(.3,.05,8,40),
    new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:.9}));
  m.rotation.x=Math.PI/2;m.position.copy(pos);fxGroup.add(m);
  return {life:.5,max:.5,obj:m,update:function(k){m.scale.setScalar(1+k*(maxR||3));m.material.opacity=.9*(1-k);}};
};
FX.burst=function(fxGroup,pos,color,n){
  var parts=[];
  for(var i=0;i<(n||12);i++){
    var s=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial({color:color}));
    s.position.copy(pos);var a=Math.random()*Math.PI*2,v=2+Math.random()*4;
    s.userData.v=new THREE.Vector3(Math.cos(a)*v,2+Math.random()*3,Math.sin(a)*v);
    fxGroup.add(s);parts.push(s);
  }
  return {life:.6,max:.6,obj:parts[0],parts:parts,update:function(k,dt){
    parts.forEach(function(p){p.position.addScaledVector(p.userData.v,dt);p.userData.v.y-=9*dt;p.rotation.x+=dt*8;});
  }};
};
FX.heal=function(fxGroup,pos){
  var m=new THREE.Mesh(new THREE.SphereGeometry(.3,10,8),
    new THREE.MeshBasicMaterial({color:0x7dffaa,transparent:true,opacity:.8}));
  m.position.copy(pos);fxGroup.add(m);
  return {life:.7,max:.7,obj:m,update:function(k){m.scale.setScalar(1+k*2);m.material.opacity=.8*(1-k);m.position.y+=.02;}};
};
FX.shieldPulse=function(fxGroup,pos,r){
  var m=new THREE.Mesh(new THREE.SphereGeometry(r||1,16,12),
    new THREE.MeshBasicMaterial({color:0x6fb8ff,transparent:true,opacity:.7,wireframe:true}));
  m.position.copy(pos);fxGroup.add(m);
  return {life:.8,max:.8,obj:m,update:function(k){m.scale.setScalar(1+k*.8);m.material.opacity=.7*(1-k);}};
};
FX.flash=function(fxGroup,pos,color,size){
  var m=new THREE.Mesh(new THREE.SphereGeometry(size||.5,12,10),
    new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:1}));
  m.position.copy(pos);fxGroup.add(m);
  return {life:.3,max:.3,obj:m,update:function(k){m.scale.setScalar(1+k*2.2);m.material.opacity=1-k;}};
};
FX.web=function(fxGroup,pos,r){
  var g=new THREE.Group();
  var c=new THREE.Mesh(new THREE.TorusGeometry(r,.04,8,32),new THREE.MeshBasicMaterial({color:0xffb44d,transparent:true,opacity:.85}));
  c.rotation.x=Math.PI/2;g.add(c);
  for(var i=0;i<6;i++){var l=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,r*2,4),
    new THREE.MeshBasicMaterial({color:0xffb44d,transparent:true,opacity:.5}));
    l.rotation.z=Math.PI/2;l.rotation.y=i/6*Math.PI;l.position.y=0;g.add(l);}
  g.position.copy(pos);fxGroup.add(g);
  return {life:3,max:3,obj:g,update:function(k){g.children.forEach(function(c2){c2.material.opacity=.85*(1-k*.4);});}};
};
FX.warnMarker=function(fxGroup,pos,color){
  var m=new THREE.Mesh(new THREE.TorusGeometry(1.2,.09,8,40),
    new THREE.MeshBasicMaterial({color:color||0xff4466}));
  m.rotation.x=Math.PI/2;m.position.copy(pos);fxGroup.add(m);
  return {life:2.6,max:2.6,obj:m,update:function(k,t,dt){m.rotation.z+=dt*2;m.material.opacity=.5+.5*Math.sin(t*12);}};
};
FX.spawnPortal=function(fxGroup,pos,color){
  var m=new THREE.Mesh(new THREE.TorusGeometry(.8,.1,8,32),
    new THREE.MeshBasicMaterial({color:color}));
  m.position.copy(pos);fxGroup.add(m);
  return {life:.8,max:.8,obj:m,update:function(k){m.scale.setScalar(1.6-k);m.material.opacity=1-k;m.rotation.x+=.1;}};
};

return {makeTowerMesh:makeTowerMesh,makeEnemyMesh:makeEnemyMesh,updateEnemyModel:updateEnemyModel,
  makeHealthBar:makeHealthBar,setHealthBar:setHealthBar,
  attachShieldBubble:attachShieldBubble,attachEncryptRing:attachEncryptRing,FX:FX};
})();
