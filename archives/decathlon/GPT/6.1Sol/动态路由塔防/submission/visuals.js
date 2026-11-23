'use strict';
// Procedural mechanical detail and animation. Every state animation is driven
// by simulation time, including destruction, so offline frames remain stable.
const Visuals={retired:[],floaters:[],environment:[],telegraphs:[],numberMaps:new Map(),
 reset(){for(const r of this.retired)this.dispose(r.model.g);for(const f of this.floaters){f.sprite.parent?.remove(f.sprite);f.sprite.material.dispose();}for(const t of this.telegraphs)this.dispose(t.g);this.retired=[];this.floaters=[];this.environment=[];this.telegraphs=[];this.protocolGroup=null;this.protocolKey='';},
 dispose(g){g.parent?.remove(g);const shared=new Set(Object.values(View.materials));g.traverse(o=>{if(o.geometry&&!Object.values(View.geo).includes(o.geometry))o.geometry.dispose();if(o.material&&!shared.has(o.material)){if(o.material.map&&!o.userData.sharedMap)o.material.map.dispose();o.material.dispose();}});},
 group(parent,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;},
 joint(parent,x,y,z,axis='z',rest=0){const g=this.group(parent,x,y,z);g.rotation[axis]=rest;g.userData={axis,rest};return g;},
 bolts(parent,positions,color=0xabbab4){const m=new THREE.InstancedMesh(View.geo.cyl,View.mat(color),positions.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion();positions.forEach((p,i)=>{matrix.compose(new THREE.Vector3(...p),q,new THREE.Vector3(.022,.025,.022));m.setMatrixAt(i,matrix);});parent.add(m);},
 tower(model,type,c,level,branch){
  const g=model.g,p=model.parts,white=0xa1b8b8,teal=0x7fdfc5,dark=0x1c3540;p.joints=[];p.emitters=[];p.fields=[];
  this.bolts(g,[[-.27,.18,-.18],[.27,.18,-.18],[-.27,.18,.18],[.27,.18,.18]]);
  if(type==='firewall'){
   for(const side of [-1,1]){const arm=this.joint(g,side*.28,.52,0,'z',side*.12);View.box(arm,side*.11,0,-.08,.23,.49,.38,white);View.box(arm,side*.12,.08,-.283,.12,.29,.025,teal,0x2a6c57);View.cylinder(arm,0,0,0,.08,.16,0x506c75);p.joints.push(arm);}
   const crest=View.box(g,0,.84,-.17,.26,.07,.05,0xe0c891,0x56401f);p.crest=crest;
   if(level===2){View.box(g,0,.98,0,.66,.12,.42,0x839b9c);for(const side of [-1,1])View.box(g,side*.47,.22,0,.17,.16,.56,0xb1b7a3);}
  }else if(type==='gate'){
   for(const side of [-1,1]){const lock=this.joint(g,side*.27,.79,0,'z');View.box(lock,-side*.14,0,-.25,.3,.12,.12,0xd8b979);p.joints.push(lock);}
   View.box(g,0,.45,.12,.27,.38,.08,0x173842);for(let i=0;i<3;i++)View.box(g,0,.34+i*.12,.18,.16,.025,.035,0xf1c781,0x795128);
   if(level===2){for(const side of [-1,1]){View.cylinder(g,side*.28,1.19,0,.12,.1,0x2b4851);const fan=this.group(g,side*.28,1.25,0);View.box(fan,0,0,0,.18,.02,.025,teal);View.box(fan,0,0,0,.025,.02,.18,teal);p.joints.push(fan);fan.userData.fan=true;}}
  }else if(type==='interceptor'){
   const head=p.head;for(const side of [-1,1]){for(let i=0;i<3;i++)View.box(head,side*.18,.15,-.18-i*.12,.065,.06,.04,white);const tip=View.sphere(head,side*.15,.08,-.76,.065,0xd8ffe5,0x93ffbf);tip.visible=false;p.emitters.push(tip);}
   View.cylinder(head,0,.25,.13,.13,.08,white);const scope=View.sphere(head,0,.32,.13,.075,0x99c9eb,0x4b7d9b);p.scope=scope;
   if(level===2){for(const side of [-1,1]){View.box(g,side*.35,.31,.12,.11,.28,.23,white);View.box(g,side*.35,.19,-.11,.13,.05,.55,0x6a8d92);}}
   if(branch==='pierce'){View.box(head,0,.22,-.35,.09,.06,.6,0xe6c388,0x76522b);View.ring(head,0,.2,-.18,.16,0xf1cf92);}
   if(branch==='suppress'){for(const side of [-1,1]){const coil=View.ring(head,side*.27,.16,-.25,.16,0x8abbed);coil.rotation.x=0;p.joints.push(coil);coil.userData.fan=true;}}
  }else if(type==='sandbox'){
   const cage=this.group(g,0,.67,0);for(let i=0;i<(level===2?3:2);i++){const r=View.ring(cage,0,0,0,.4+i*.055,teal,.75);r.rotation.x=.7+i*.8;r.rotation.z=i*.7;p.joints.push(r);r.userData.orbit=i+1;}
   for(const side of [-1,1]){View.box(g,side*.29,.3,.1,.15,.18,.26,white);View.box(g,side*.29,.42,.1,.08,.025,.17,teal,0x38634e);}
   if(level===2){for(const side of [-1,1]){View.cylinder(g,side*.34,.68,.14,.07,.45,0x79b2b5,0x224b4e);View.cylinder(g,side*.34,.93,.14,.1,.07,white);}}
  }else if(type==='repair'){
   for(let i=0;i<(level===2?4:2);i++){const a=i*Math.PI*2/(level===2?4:2)+Math.PI/2,arm=this.joint(g,Math.sin(a)*.22,.46,Math.cos(a)*.22,'z',Math.sin(a)*.4);arm.rotation.y=a;View.box(arm,0,.1,.11,.09,.1,.3,white);const fore=this.joint(arm,0,.1,.25,'x',-.3);View.box(fore,0,0,.14,.075,.08,.29,0x6d9d9b);View.sphere(fore,0,0,.3,.07,teal,0x388a62);p.joints.push(arm);}
   View.cylinder(g,0,.28,0,.27,.09,0x94b5ac);p.healRing=View.ring(g,0,.62,0,.37,0x8ce9bf,.8);
  }else if(type==='honeypot'){
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3,j=this.joint(g,Math.sin(a)*.23,.42,Math.cos(a)*.23,'x',.3);j.rotation.y=a;View.box(j,0,.16,.12,.04,.36,.04,white);View.sphere(j,0,.34,.12,.045,0xf8d18b,0xa57633);p.joints.push(j);}
   if(branch==='lure'){View.cylinder(g,0,1.05,0,.025,.46,white);View.ring(g,0,1.25,0,.22,0xf5ce8c);}
   if(branch==='mirror'){for(let i=0;i<4;i++){const a=i*Math.PI/2;const panel=View.box(g,Math.sin(a)*.36,.58,Math.cos(a)*.36,.25,.42,.035,0xb0c8d2);panel.rotation.y=a;p.joints.push(panel);panel.userData.mirror=true;}}
  }
  if(c.type==='node')for(const near of View.net.neighbors(c)){const dx=near.x-c.x,dz=near.z-c.z,field=new THREE.Mesh(new THREE.PlaneGeometry(.82,.65),new THREE.MeshBasicMaterial({color:0xf0b477,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));field.position.set(dx*.51,.51,dz*.51);field.rotation.y=dx?Math.PI/2:0;g.add(field);p.fields.push(field);}
  const lock=this.group(g,0,1.08,0);View.box(lock,0,0,0,.24,.18,.1,0xc28cda,0x623a85);const shackle=View.ring(lock,0,.11,0,.09,0xe0b9f7);shackle.rotation.x=0;View.box(lock,0,0,-.06,.026,.06,.025,0x382b58);lock.visible=false;p.lockMesh=lock;
 },
 enemy(model,type){
  const p=model.p,parts=model.parts,c=Data.enemies[type].color;parts.articulated=[];parts.details=[];
  if(type==='worm'){for(const side of [-1,1]){const jaw=this.joint(p,side*.08,.29,-.39,'y',side*.25);View.box(jaw,side*.08,0,-.07,.065,.07,.2,0xeeb099);parts.articulated.push(jaw);}}
  else if(type==='flood'){const ram=this.joint(p,0,.4,-.43,'x');View.box(ram,0,0,-.06,.55,.24,.18,0xc6a884);for(const side of [-1,1])View.box(ram,side*.16,.03,-.17,.07,.16,.07,c,0x693d1e);parts.ram=ram;for(const side of [-1,1]){View.cylinder(p,side*.24,.74,.14,.08,.21,0x42545b);View.cylinder(p,side*.24,.88,.14,.06,.05,c,0x8a4c20);}}
  else if(type==='trojan'){parts.covers=[];for(const side of [-1,1]){const lid=this.joint(p,side*.21,.51,0,'z');View.box(lid,-side*.105,.025,0,.22,.05,.48,0x9ac4bd);View.box(lid,-side*.105,.058,0,.14,.01,.035,0xc8e2d0);parts.covers.push(lid);}const payload=View.sphere(p,0,.48,0,.13,0xf5bb6c,0x9b5023);parts.payload=payload;}
  else if(type==='ransom'){for(const side of [-1,1]){const sleeve=this.joint(p,side*.24,.6,.03,'z',side*.18);View.box(sleeve,side*.03,-.17,.1,.15,.42,.3,0x643f5b);View.box(sleeve,side*.03,-.18,-.06,.06,.23,.025,c,0x5d2854);parts.articulated.push(sleeve);}const cast=this.group(p,0,.75,-.24);View.box(cast,0,0,0,.15,.16,.18,0xb785ad);View.sphere(cast,0,0,-.12,.06,0xf2a9df,0xab4e8c);parts.caster=cast;}
  else if(type==='flyer'){parts.blades=[];for(const side of [-1,1]){const fan=this.group(p,side*.45,.08,0);View.box(fan,0,0,0,.32,.012,.035,0xd2bdf1);View.box(fan,0,0,0,.035,.012,.32,0xd2bdf1);parts.blades.push(fan);}View.box(p,0,-.08,.13,.14,.14,.2,0x9a82ba);}
  else if(type==='shell'){parts.projectors=[];for(const side of [-1,1]){const pod=this.group(p,side*.32,.5,0);View.cylinder(pod,0,0,0,.09,.18,0xa4bfd3);const r=View.ring(pod,0,.12,0,.13,0x91c7ff);parts.projectors.push(r);}}
  else if(type==='boss0'){for(let i=0;i<4;i++){const a=i*Math.PI/2,pod=this.group(p,Math.sin(a)*.5,.91,Math.cos(a)*.5);View.cylinder(pod,0,0,0,.12,.3,0x826368,0,true);View.sphere(pod,0,.2,0,.085,0xfab29d,0x9b4c37);parts.details.push(pod);}}
  else if(type==='boss1'){for(let i=0;i<4;i++){const a=i*Math.PI/2,mirror=this.group(p,Math.sin(a)*.65,1,Math.cos(a)*.65);const pane=View.mesh(new THREE.OctahedronGeometry(.24),View.mat(0xc1b8d1,0x38234b,.7,.2),mirror);pane.scale.set(.35,1.7,1);parts.details.push(mirror);}}
  else if(type==='boss2'){View.box(p,0,1.03,-.32,.48,.2,.08,0xf2c389);for(const side of [-1,1]){const j=this.joint(p,side*.28,1.2,.2,'z',side*.3);View.box(j,side*.09,.16,0,.12,.5,.14,0xdba366);View.box(j,side*.09,.41,-.02,.08,.06,.19,0xffbf7a,0x8b3c17);parts.articulated.push(j);}parts.cloak=[];p.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.depthWrite=false;parts.cloak.push(o);}});}
  const root=this.group(model.g,0,.15,0);View.ring(root,0,0,0,.45,0xe9c080,.9);for(let i=0;i<4;i++){const a=i*Math.PI/2;View.box(root,Math.sin(a)*.42,.27,Math.cos(a)*.42,.03,.54,.03,0xe8be7e,0x765225);}root.visible=false;parts.rootCage=root;
  const slow=View.ring(model.g,0,.12,0,.38,0x87b9ec,.75);slow.visible=false;parts.slowRing=slow;
  parts.legRest=parts.legs.map(o=>({x:o.rotation.x,y:o.rotation.y,z:o.rotation.z}));
 },
 animateTower(t,time){const p=t.model.parts,fire=Math.max(0,1-(time-(t.lastFire??-99))/.22),heal=Math.max(0,1-(time-(t.lastHeal??-99))/.55);for(let i=0;i<p.joints.length;i++){const j=p.joints[i];if(j.userData.fan)j.rotation.y=time*8;else if(j.userData.orbit){j.rotation.y=time*.8*j.userData.orbit;j.rotation.z=time*.35;}else if(j.userData.mirror)j.rotation.y=i*Math.PI/2+Math.sin(time*2)*.06;else{const axis=j.userData.axis;j.rotation[axis]=(j.userData.rest||0)+(t.type==='firewall'?(t.buff>0?.13:fire*.18)*(i%2?1:-1):t.type==='repair'?Math.sin(time*2+i)*(.06+heal*.22):t.type==='gate'?Math.sin(time*2)*.025:Math.sin(time*2+i)*.06);}}
  p.emitters.forEach(m=>m.visible=fire>.65&&t.encrypted<=0);p.lockMesh.visible=t.encrypted>0;p.lockMesh.position.y=1.08+Math.sin(time*3)*.025;for(const field of p.fields)field.material.opacity=.12+Math.sin(time*3)*.025;if(p.healRing){p.healRing.rotation.z=time;p.healRing.scale.setScalar(1+heal*.12);}
 },
 animateEnemy(e,time,dt){const m=e.model,p=m.parts,walk=(e.distanceTravelled||0)*10,moving=e.moving?1:0,attack=Math.max(0,1-(time-(e.lastAttack??-99))/.55);for(let i=0;i<p.legs.length;i++){const leg=p.legs[i],rest=p.legRest[i];leg.rotation.x=rest.x+Math.sin(walk+i*Math.PI)*.26*moving+Math.sin(attack*Math.PI)*.12;}
  for(let i=0;i<p.articulated.length;i++){const j=p.articulated[i],axis=j.userData.axis;j.rotation[axis]=(j.userData.rest||0)+Math.sin(walk+i*Math.PI)*.12*moving+Math.sin(attack*Math.PI)*.4*(i%2?1:-1);}
  if(p.ram){p.ram.position.z=-.43-Math.sin(attack*Math.PI)*.19;p.ram.rotation.x=-Math.sin(attack*Math.PI)*.2;}
  if(p.covers){const exposed=e.revealed||e.scanTime>0||e.detected>0,open=m.revealBlend=THREE.MathUtils.damp(m.revealBlend||0,exposed?1:0,12,dt);p.covers.forEach((j,i)=>{j.rotation.z=(i?1:-1)*open*1.15;});p.payload.visible=!!exposed;}
  if(p.blades)p.blades.forEach((fan,i)=>fan.rotation.y=time*45*(i?1:-1));if(p.caster){p.caster.rotation.z=Math.sin(attack*Math.PI)*.2;p.caster.position.z=-.24-Math.sin(attack*Math.PI)*.15;}
  if(p.projectors)p.projectors.forEach((r,i)=>{r.rotation.x=.7;r.rotation.z=time*(i?1:-1)*2;});
  if(e.type==='boss0')p.details.forEach((o,i)=>{o.position.y=.91+Math.sin(time*2+i)*.04;o.rotation.z=Math.sin(time*1.5+i)*.1*(1+e.phase);});
  if(e.type==='boss1')p.details.forEach((o,i)=>{const a=time*.25+i*Math.PI/2;o.position.x=Math.sin(a)*(.65+e.phase*.15);o.position.z=Math.cos(a)*(.65+e.phase*.15);o.rotation.y=-a;o.rotation.z=Math.sin(time+i)*.12;});
  if(p.cloak){const visible=e.phase>0||e.revealed||e.scanTime>0||e.detected>0;p.cloak.forEach(o=>{o.material.opacity=visible?1:.3;o.material.depthWrite=visible;o.castShadow=visible;});}
  p.rootCage.visible=e.rooted>0&&!e.flying;p.rootCage.rotation.y=time*.2;p.slowRing.visible=e.slow>0;p.slowRing.rotation.z=time*2;
  if(e.moving&&!e.flying)m.p.position.y=Math.abs(Math.sin(walk))*(e.type.startsWith('boss')?.025:.018);
 },
 popup(x,y,z,text,color='#ecc4a7'){
  if(this.floaters.length>=16)return;const k=text+color;let map=this.numberMaps.get(k);if(!map){const c=document.createElement('canvas');c.width=192;c.height=48;const ctx=c.getContext('2d');ctx.font='600 30px Consolas, "Microsoft YaHei"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#061119';ctx.shadowBlur=5;ctx.fillStyle=color;ctx.fillText(text,96,24);map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;this.numberMaps.set(k,map);}const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthTest:false,toneMapped:false}));sprite.userData.sharedMap=true;sprite.scale.set(1.4,.35,1);sprite.position.set(x,y,z);View.fxGroup.add(sprite);this.floaters.push({sprite,life:.9,total:.9,y});
 },
 retire(actor,enemy=true,destroyed=true){
  const model=actor.model;if(!model)return;if(this.retired.length>=20){this.dispose(model.g);return;}model.hp.g.visible=false;model.shield.visible=false;if(model.lockLabel)model.lockLabel.visible=false;if(model.link)model.link.visible=false;if(model.parts.lockMesh)model.parts.lockMesh.visible=false;model.parts.fields?.forEach(m=>m.visible=false);if(model.parts.rootCage)model.parts.rootCage.visible=false;model.parts.slowRing&&(model.parts.slowRing.visible=false);
  const shards=[];model.g.traverse(o=>{if(o.isMesh&&o.visible&&shards.length<60){o.material=o.material.clone();o.material.transparent=true;o.material.depthWrite=false;shards.push({o,pos:o.position.clone(),rot:o.rotation.clone(),alpha:o.material.opacity,angle:(shards.length*2.399+actor.id)});}});View.fxGroup.add(model.g);this.retired.push({model,shards,life:enemy?.65:.85,total:enemy?.65:.85,y:model.g.position.y,enemy,destroyed,id:actor.id});
 },
 skill(t){const c=t.cell,color=t.type==='honeypot'?0xf2cc88:t.type==='sandbox'?0x8edfd9:t.type==='repair'?0x9cebbd:0xb5eddf;for(let i=0;i<3;i++)View.pulse(c.x,.18+i*.16,c.z,color,(t.range||2)*(1-i*.12));if(t.type==='sandbox')for(const e of Game.state.enemies)View.pulse(e.x,.12,e.z,0x9bdac8,.65);},
 warning(c,duration,kind){const g=this.group(View.fxGroup,c.x,.13,c.z),color=kind==='blackhole'?0xd8a0eb:0xf3ba7f;View.ring(g,0,0,0,.51,color,.8);for(const sx of [-1,1])for(const sz of [-1,1]){View.line([[sx*.47,.01,sz*.25],[sx*.47,.01,sz*.47],[sx*.25,.01,sz*.47]],color,.95,g);}const label=View.text('',.36,'#f3c9ac',true);label.position.y=1.65;g.add(label);const bar=View.box(g,0,1.45,0,.65,.035,.025,color,color);this.telegraphs.push({g,label,bar,kind,life:duration,total:duration,last:-1});},
 hazard(c,kind){const g=this.group(View.world,c.x,.1,c.z),rings=[];
  if(kind==='blackhole'){View.cylinder(g,0,.02,0,.47,.05,0x171525,0x291234);View.sphere(g,0,.25,0,.2,0x1f112d,0x3d134c);for(let i=0;i<3;i++){const r=View.ring(g,0,.12+i*.13,0,.43-i*.07,0xc394e5,.85);r.rotation.z=i*.3;rings.push(r);}for(let i=0;i<6;i++){const a=i*Math.PI/3;const shard=View.mesh(new THREE.OctahedronGeometry(.065),View.mat(0xab7fd1,0x46205f),g,Math.sin(a)*.36,.3,Math.cos(a)*.36);rings.push(shard);}}
  else{for(const side of [-1,1]){View.box(g,side*.35,.28,0,.15,.56,.36,0x776447);View.box(g,side*.35,.35,-.2,.05,.32,.04,0xffc27d,0x935124);}for(const side of [-1,1]){const beam=View.box(g,0,.32,0,.8,.065,.07,0xf1b97d,0x87501f);beam.rotation.z=side*.5;rings.push(beam);}View.ring(g,0,.03,0,.46,0xf1bd7f,.9);}
  this.environment.push({kind:kind==='blackhole'?'blackhole':'lock',g,rings});return g;
 },
 removeHazard(g){this.environment=this.environment.filter(o=>o.g!==g);this.dispose(g);},
 updateProtocol(n){const k=[...n.slow].sort().join('|');if(k===this.protocolKey)return;this.protocolKey=k;if(this.protocolGroup)this.dispose(this.protocolGroup);this.protocolGroup=this.group(View.world);for(const key of n.slow){const c=n.cells.get(key);if(!c||c.legacy)continue;const g=this.group(this.protocolGroup,c.x,.085,c.z);const overlay=new THREE.Mesh(new THREE.PlaneGeometry(.83,.83),new THREE.MeshBasicMaterial({color:0xe9ba6d,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));overlay.rotation.x=-Math.PI/2;g.add(overlay);for(const side of [-1,1])View.line([[side*.36,.01,-.33],[side*.36,.01,.33]],0xeac07f,.85,g);}},
 environmentMap(n){
  const map=n.map,world=View.world;
  for(const c of map.exits){const halo=this.glow(0x8bd1e1,.2);halo.position.set(c.x,1.58,c.z);halo.scale.setScalar(1.6);world.add(halo);}
  if(map.id===0){
   const cluster=this.group(world,-4.8,0,-5.25);View.box(cluster,0,.08,0,1.85,.18,1.15,0x3c535c);
   for(let i=0;i<4;i++){const x=-.62+i*.41;View.box(cluster,x,.68,0,.33,1.2,.64,0x647b84);View.box(cluster,x,.69,.34,.25,.92,.02,0x192e3b);for(let j=0;j<5;j++){View.box(cluster,x,.33+j*.17,.36,.2,.055,.025,0x7ca2a7);View.box(cluster,x+.055,.34+j*.17,.38,.022,.025,.02,0x8fe4c4,0x33754e);}const fan=this.group(cluster,x,1.31,0);View.cylinder(fan,0,0,0,.12,.035,0x263e46);View.box(fan,0,.024,0,.2,.02,.03,0x9bb5b6);View.box(fan,0,.024,0,.03,.02,.2,0x9bb5b6);this.environment.push({kind:'fan',g:fan,speed:i%2?3:-3});}
   for(const z of [-.35,.35])View.line([[-.8,.18,z],[-.8,.2,z-.2],[.8,.2,z-.2]],0x77b9af,.7,cluster);const label=View.text('DMZ / 高可用业务集群',.38,'#b1c9c9',true);label.position.set(0,1.7,0);cluster.add(label);
   const old=this.group(world,-8,0,1);View.box(old,0,.48,0,.6,.9,.65,0x716a55);for(let i=0;i<4;i++)View.box(old,0,.26+i*.17,.34,.42,.04,.025,0xc7b17e);View.line([[0,.07,0],[.52,.07,0],[.52,.07,1.5]],0xb39b67,.7,old);
  }else if(map.id===1){
   for(const x of [-8,-3,5]){const bridge=this.group(world,x,0,0),old=x===5,col=old?0xc3a371:0x86aeba;for(const side of [-1,1]){View.box(bridge,side*.53,.31,0,.1,.65,1.4,0x344f5d);View.box(bridge,side*.53,.66,0,.045,.045,1.5,col,col);}const arch=View.mesh(new THREE.TorusGeometry(.57,.035,6,24,Math.PI),View.mat(col,old?0x5b401e:0x26505d),bridge,0,.64,0);arch.rotation.y=0;const title=View.text(old?'旧专线跨越':'专线隧道',.33,old?'#d9bc8b':'#a2c8d5',true);title.position.y=1.5;bridge.add(title);}
   for(let i=0;i<18;i++){const packet=this.group(world,0,-.005,-.55+(i%4)*.34);View.box(packet,0,0,0,.25+(i%3)*.14,.025,.055,0x84b7d0,0x2d5c7a);this.environment.push({kind:'flow',g:packet,offset:i*1.37,speed:1.6+i%3});}
   for(const z of [-.88,.88])View.line([[-9.1,-.04,z],[9.1,-.04,z]],0x50849c,.7,world);
  }else{
   // Vertical inner walls make the air gap a physical break in the substrate.
   for(const x of [-2.66,2.66]){View.box(world,x,-1.48,0,.15,2.55,4.7,0x27343b);for(let z=-2;z<=2;z+=.5){View.box(world,x*.975,-1.2,z,.08,1.6,.1,0x576068);View.box(world,x*.965,-.7,z,.025,.28,.08,0xd3a05c,0x68441b);}}
   for(const z of [-2.34,2.34])View.box(world,0,-1.48,z,5.4,2.55,.13,0x23323a);
   View.box(world,0,-2.8,0,5.3,.12,4.7,0x101c26);const inner=new THREE.GridHelper(5,10,0x5d6c65,0x263f44);inner.position.y=-2.72;world.add(inner);
   const glow=this.glow(0xe8a45c,.13);glow.position.set(0,-1.6,0);glow.scale.set(5.5,2.5,1);world.add(glow);
   const pump=this.group(world,3.6,0,-6.15);for(const x of [-.32,.32]){View.cylinder(pump,x,.42,0,.16,.7,0x817965);View.cylinder(pump,x,.82,0,.19,.07,0xcbb68a);const fan=this.group(pump,x,.88,0);View.box(fan,0,0,0,.29,.025,.04,0x6c837e);View.box(fan,0,0,0,.04,.025,.29,0x6c837e);this.environment.push({kind:'fan',g:fan,speed:x>0?4:-4});}View.line([[-.32,.1,0],[-.32,.1,.5],[.7,.1,.5]],0xe2b47a,.7,pump);
  }
 },
 glow(color,opacity){if(!this.glowMap){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),r=ctx.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,0.8)');r.addColorStop(.25,'rgba(255,255,255,0.28)');r.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=r;ctx.fillRect(0,0,128,128);this.glowMap=new THREE.CanvasTexture(c);}const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowMap,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));sprite.userData.sharedMap=true;return sprite;},
 tick(dt,time){
  for(const t of Game.state?.towers||[])this.animateTower(t,time);for(const e of Game.state?.enemies||[])this.animateEnemy(e,time,dt);
  for(let i=this.retired.length-1;i>=0;i--){const r=this.retired[i];r.life-=dt;const p=1-Math.max(0,r.life)/r.total,fold=Math.sin(p*Math.PI/2);r.model.g.rotation.x=fold*(r.enemy?.75:.22);r.model.g.rotation.z=Math.sin(r.id)*fold*.25;r.model.g.position.y=r.y-p*p*(r.destroyed?.4:1.2);for(const s of r.shards){s.o.position.x=s.pos.x+Math.sin(s.angle)*p*.16;s.o.position.y=s.pos.y+Math.sin(p*Math.PI)*.1;s.o.position.z=s.pos.z+Math.cos(s.angle)*p*.16;s.o.rotation.x=s.rot.x+fold*Math.sin(s.angle)*.65;s.o.rotation.z=s.rot.z+fold*Math.cos(s.angle)*.45;s.o.material.opacity=s.alpha*Math.max(0,1-p*p);}if(r.life<=0){this.dispose(r.model.g);this.retired.splice(i,1);}}
  for(let i=this.floaters.length-1;i>=0;i--){const f=this.floaters[i];f.life-=dt;f.sprite.position.y=f.y+(1-f.life/f.total)*.5;f.sprite.material.opacity=Math.min(1,f.life/.3);if(f.life<=0){f.sprite.parent?.remove(f.sprite);f.sprite.material.dispose();this.floaters.splice(i,1);}}
  for(let i=this.telegraphs.length-1;i>=0;i--){const w=this.telegraphs[i];w.life-=dt;const digit=Math.max(0,Math.ceil(w.life));if(digit!==w.last){w.last=digit;w.g.remove(w.label);w.label.material.map.dispose();w.label.material.dispose();w.label=View.text((w.kind==='blackhole'?'黑洞':w.kind==='flood'?'洪峰冲击':'链路锁死')+' · '+digit+'s',.36,'#f2c69b',true);w.label.position.y=1.65;w.g.add(w.label);}w.bar.scale.x=.65*Math.max(0,w.life/w.total);w.bar.position.x=-(.65-w.bar.scale.x)/2;w.g.rotation.y=Math.sin(time*3)*.025;if(w.life<=0){this.dispose(w.g);this.telegraphs.splice(i,1);}}
  for(const o of this.environment){if(o.kind==='fan')o.g.rotation.y=time*o.speed;else if(o.kind==='flow'){o.g.position.x=(o.offset+time*o.speed+9.3)%18.6-9.3;}else if(o.kind==='orbit')o.g.rotation.z=time*.2;else if(o.kind==='blackhole'){o.rings.forEach((r,i)=>{r.rotation.y=time*(i%2?1:-1);r.rotation.z=time*.35+i*.3;});}else if(o.kind==='lock')o.rings.forEach((r,i)=>{r.position.y=.32+Math.sin(time*2+i)*.015;});}
 }
};
